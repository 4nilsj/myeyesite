import { useState, useEffect, useCallback, useRef } from 'react';
import SearchBar from './components/SearchBar';
import CategoryTabs from './components/CategoryTabs';
import FilterBar from './components/FilterBar';
import ResultCard from './components/ResultCard';
import MapView from './components/MapView';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import MarketResearch from './components/MarketResearch';
import ErrorBoundary from './components/ErrorBoundary';
import { geocodePin, searchLocality, fetchNearby, fetchBatchNearby, fetchContact } from './utils/api';
import { ALL_CATEGORIES } from './utils/categoryMap';
import { debounce, calculateDistance } from './utils/debounce';

const DEFAULT_FILTERS = {
  openNow: false,
  hideClosed: true,
  minRating: 0,
  maxDistance: 5000,
  searchQuery: '',
};

function applyFilters(places, filters, openNowOnly = false) {
  return places.filter(p => {
    if (filters.hideClosed && p.permanentlyClosed) return false;
    if ((filters.openNow || openNowOnly) && p.openNow !== true) return false;
    if (filters.minRating && (p.rating || 0) < filters.minRating) return false;
    if (filters.maxDistance && p.distance !== undefined && p.distance * 1000 > filters.maxDistance) return false;
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase().trim();
      const nameMatch = p.name?.toLowerCase().includes(q);
      const addrMatch = p.address?.toLowerCase().includes(q);
      if (!nameMatch && !addrMatch) return false;
    }
    return true;
  });
}

export default function App() {
  const [pincode, setPincode] = useState('');
  const [geoData, setGeoData] = useState(null);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [radius, setRadius] = useState(5000);
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, maxDistance: 5000 });
  const [tab, setTab] = useState('results'); // 'results' | 'market'
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'grid' | 'map'
  const [activePlaceId, setActivePlaceId] = useState(null);
  const [hoveredPlaceId, setHoveredPlaceId] = useState(null);

  // Dark mode theme state
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) return savedTheme;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem('savedPlaces') || '[]'); }
    catch { return []; }
  });
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pinHistory') || '[]'); }
    catch { return []; }
  });
  const [showSaved, setShowSaved] = useState(false);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [sort, setSort] = useState('default'); // 'default' | 'rating' | 'distance'
  const [exportLoading, setExportLoading] = useState(false);

  const radiusTimerRef = useRef(null);
  const debouncedCategoryRef = useRef(null);
  const userChangedRadiusRef = useRef(false);

  // Apply theme class to document root
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Persist saved + history
  useEffect(() => {
    localStorage.setItem('savedPlaces', JSON.stringify(saved));
  }, [saved]);
  useEffect(() => {
    localStorage.setItem('pinHistory', JSON.stringify(history));
  }, [history]);

  // Restore from URL on first load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pin = params.get('pin');
    if (pin) doSearch(pin);
  }, []);

  // Sync filters.maxDistance with search radius changes
  useEffect(() => {
    setFilters(prev => ({ ...prev, maxDistance: radius }));
  }, [radius]);

  const doSearch = useCallback(async (query) => {
    if (!query || !query.trim()) return;
    setLoading(true);
    setError('');
    setPlaces([]);
    setGeoData(null);
    setActivePlaceId(null);
    setActiveCategory('all');

    const clean = query.trim();
    const isPin = /^[1-9][0-9]{5}$/.test(clean);

    try {
      let geo;
      if (isPin) {
        geo = await geocodePin(clean);
      } else {
        geo = await searchLocality(clean);
      }

      if (!geo || !geo.lat || !geo.lng) {
        throw new Error('Could not resolve location coordinates');
      }

      const resolvedPin = geo.pincode || (isPin ? clean : '');
      setPincode(resolvedPin || clean);
      setGeoData(geo);

      // Update URL with the resolved PIN code or query
      const url = new URL(window.location);
      if (resolvedPin) {
        url.searchParams.set('pin', resolvedPin);
      } else {
        url.searchParams.delete('pin');
      }
      window.history.replaceState({}, '', url);

      // Update search history
      const historyTag = resolvedPin || clean;
      setHistory(prev => {
        const next = [historyTag, ...prev.filter(p => p !== historyTag)].slice(0, 10);
        return next;
      });

      const searchRadius = geo.suggestedRadius || 5000;
      userChangedRadiusRef.current = false;
      setRadius(searchRadius);

      // Fast single-trip batch fetch with automatic fallback
      let rawPlaces = [];
      try {
        const batchData = await fetchBatchNearby(geo.lat, geo.lng, searchRadius);
        rawPlaces = batchData.places || [];
      } catch {
        const results = await Promise.allSettled(
          ALL_CATEGORIES.map(cat => fetchNearby(geo.lat, geo.lng, searchRadius, cat))
        );
        rawPlaces = results
          .filter(r => r.status === 'fulfilled')
          .flatMap(r => r.value.places || []);
      }

      const allPlaces = rawPlaces.map(p => ({
        ...p,
        distance: calculateDistance(geo.lat, geo.lng, p.lat, p.lng),
      }));

      setPlaces(allPlaces);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Search failed. Try a 6-digit PIN code or prominent landmark.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced re-fetch when the user changes the radius
  useEffect(() => {
    if (!geoData || !pincode) return;
    if (!userChangedRadiusRef.current) return;

    if (radiusTimerRef.current) clearTimeout(radiusTimerRef.current);
    radiusTimerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        let rawPlaces = [];
        try {
          const batchData = await fetchBatchNearby(geoData.lat, geoData.lng, radius);
          rawPlaces = batchData.places || [];
        } catch {
          const results = await Promise.allSettled(
            ALL_CATEGORIES.map(cat => fetchNearby(geoData.lat, geoData.lng, radius, cat))
          );
          rawPlaces = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value.places || []);
        }

        const allPlaces = rawPlaces.map(p => ({
          ...p,
          distance: calculateDistance(geoData.lat, geoData.lng, p.lat, p.lng),
        }));
        setPlaces(allPlaces);
      } catch {
        setError('Failed to fetch places at new radius');
      } finally {
        setLoading(false);
      }
    }, 450);
  }, [radius, geoData, pincode]);

  const handleRadiusChange = useCallback((newRadius) => {
    userChangedRadiusRef.current = true;
    setRadius(newRadius);
  }, []);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleCategoryChange = (cat) => {
    if (!debouncedCategoryRef.current) {
      debouncedCategoryRef.current = debounce((category) => {
        setActiveCategory(category);
      }, 200);
    }
    debouncedCategoryRef.current(cat);
  };

  const handleSave = (place) => {
    setSaved(prev => {
      const exists = prev.find(p => p.placeId === place.placeId);
      if (exists) return prev.filter(p => p.placeId !== place.placeId);
      return [place, ...prev];
    });
  };

  const isSaved = (place) => saved.some(p => p.placeId === place.placeId);

  // Sync selection between card and map marker
  const handleSelectPlace = useCallback((place) => {
    setActivePlaceId(place.placeId);
    const cardEl = document.getElementById(`card-${place.placeId}`);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  // Category-filtered + filter-applied places
  const categoryFiltered = activeCategory === 'all'
    ? places
    : places.filter(p => p.category === activeCategory);
  let visiblePlaces = applyFilters(categoryFiltered, filters, openNowOnly);

  // Apply sorting
  if (sort === 'rating') {
    visiblePlaces = [...visiblePlaces].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (sort === 'distance') {
    visiblePlaces = [...visiblePlaces].sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }

  // Export visible results
  const exportResults = async (format) => {
    if (!visiblePlaces.length) {
      alert('No results to export');
      return;
    }

    setExportLoading(true);
    try {
      const contactMap = {};
      await new Promise(resolve => {
        const CONCURRENCY = 3;
        let i = 0, active = 0, completed = 0;
        const next = () => {
          while (active < CONCURRENCY && i < visiblePlaces.length) {
            const place = visiblePlaces[i++];
            active++;
            fetchContact(place.placeId)
              .then(d => { contactMap[place.placeId] = d; })
              .catch(() => {})
              .finally(() => {
                active--;
                completed++;
                if (completed === visiblePlaces.length) resolve();
                else next();
              });
          }
        };
        next();
      });

      const data = visiblePlaces.map(p => {
        const c = contactMap[p.placeId] || {};
        return {
          name: p.name,
          category: p.label || p.category,
          address: p.address,
          phone: c.phone || '',
          website: c.website || '',
          rating: p.rating || '',
          reviews: p.userRatingsTotal || 0,
          gmapsLink: p.gmapsLink,
        };
      });

      if (format === 'csv') {
        const headers = Object.keys(data[0]);
        const csv = [
          headers.join(','),
          ...data.map(row =>
            headers.map(h => `"${String(row[h]).replace(/"/g, '""')}"`).join(',')
          ),
        ].join('\n');
        downloadFile(csv, `places_${pincode}.csv`, 'text/csv');
      } else {
        downloadFile(JSON.stringify(data, null, 2), `places_${pincode}.json`, 'application/json');
      }
    } finally {
      setExportLoading(false);
    }
  };

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Counts per category (for tab badges)
  const counts = ALL_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = places.filter(p => p.category === cat).length;
    return acc;
  }, {});

  const mapCenter = geoData
    ? { lat: geoData.lat, lng: geoData.lng }
    : { lat: 20.5937, lng: 78.9629 };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-xs transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-lg font-black gradient-text shrink-0 tracking-tight whitespace-nowrap select-none">
              📍 <span className="hidden sm:inline">PinCode Explorer</span>
              <span className="sm:hidden">PCX</span>
            </h1>

            <div className="flex-1 max-w-2xl">
              <SearchBar
                onSearch={doSearch}
                loading={loading}
                openNowOnly={openNowOnly}
                onOpenNowOnlyChange={setOpenNowOnly}
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Theme toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all cursor-pointer select-none text-base"
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>

              {/* Saved places button */}
              <button
                type="button"
                onClick={() => setShowSaved(s => !s)}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border font-semibold transition-all cursor-pointer select-none
                  ${showSaved
                    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 shadow-xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-amber-300 hover:text-amber-600 dark:hover:text-amber-400'}`}
              >
                <span>★</span>
                <span className="hidden sm:inline">Saved</span>
                {saved.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${showSaved ? 'bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {saved.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 space-y-4">
        {/* ─── PIN info & history bar ─────────────────────────────────── */}
        {geoData && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 font-bold text-xs px-3 py-1 rounded-full shadow-xs">
              📮 {pincode}
            </span>
            <span className="text-slate-600 dark:text-slate-400 text-xs font-medium">
              {geoData.locality}{geoData.district ? `, ${geoData.district}` : ''}, {geoData.state}
            </span>
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mr-1 hidden sm:inline">Recent:</span>
              {history.filter(h => h !== pincode).slice(0, 4).map(h => (
                <button
                  key={h}
                  onClick={() => doSearch(h)}
                  className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-slate-800 transition-all font-medium cursor-pointer"
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Tab switcher ─────────────────────────────────────────── */}
        {geoData && (
          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
            {['results', 'market'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all duration-200 cursor-pointer select-none
                  ${tab === t
                    ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                {t === 'results' ? '🗺️ Places Explorer' : '🔬 Market & Saturation'}
              </button>
            ))}
          </div>
        )}

        {/* ─── Error message ─────────────────────────────────────────── */}
        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ─── Loading skeleton ─────────────────────────────────────── */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="skeleton h-36" />
                <div className="p-4 space-y-2.5">
                  <div className="skeleton h-4 rounded-full w-3/4" />
                  <div className="skeleton h-3 rounded-full w-full" />
                  <div className="skeleton h-3 rounded-full w-1/2" />
                  <div className="flex gap-2 mt-3">
                    <div className="skeleton h-7 rounded-xl flex-1" />
                    <div className="skeleton h-7 rounded-xl flex-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── RESULTS TAB ──────────────────────────────────────────── */}
        {!loading && tab === 'results' && geoData && (
          <div className="space-y-4">
            {/* Category tabs */}
            <CategoryTabs active={activeCategory} onChange={handleCategoryChange} counts={counts} />

            {/* Filter bar with ViewMode switcher */}
            <FilterBar
              filters={filters}
              onChange={handleFilterChange}
              totalCount={categoryFiltered.length}
              filteredCount={visiblePlaces.length}
              radius={radius}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />

            {/* ─── SPLIT VIEW MODE (Default on Desktop) ────────────── */}
            {viewMode === 'split' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left Column: Feed & Controls */}
                <div className="lg:col-span-7 space-y-4">
                  {/* Analytics Dashboard */}
                  <ErrorBoundary>
                    <AnalyticsDashboard places={places} />
                  </ErrorBoundary>

                  {/* Sort & Export controls */}
                  {visiblePlaces.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs transition-colors">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">Sort:</span>
                        {['default', 'rating', 'distance'].map(opt => (
                          <button
                            key={opt}
                            onClick={() => setSort(opt)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer
                              ${sort === opt
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                          >
                            {opt === 'default' ? 'Default' : opt === 'rating' ? '⭐ Rating' : '📍 Distance'}
                          </button>
                        ))}
                      </div>

                      <div className="flex gap-1.5">
                        <button
                          onClick={() => exportResults('csv')}
                          disabled={exportLoading}
                          className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200/60 dark:border-emerald-800/40 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {exportLoading ? '⏳ Exporting…' : '📊 CSV'}
                        </button>
                        <button
                          onClick={() => exportResults('json')}
                          disabled={exportLoading}
                          className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/50 border border-violet-200/60 dark:border-violet-800/40 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {exportLoading ? '⏳ Exporting…' : '📄 JSON'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Results cards in split feed (2 columns) */}
                  {visiblePlaces.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {visiblePlaces.map(place => (
                        <ResultCard
                          key={place.placeId}
                          place={place}
                          onSave={handleSave}
                          isSaved={isSaved(place)}
                          isActive={place.placeId === activePlaceId}
                          isHovered={place.placeId === hoveredPlaceId}
                          onHover={setHoveredPlaceId}
                          onSelect={handleSelectPlace}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <span className="text-3xl">🔍</span>
                      <p className="font-semibold text-slate-700 dark:text-slate-300 mt-2 mb-1 text-sm">No places match the active criteria</p>
                      <button
                        onClick={() => setFilters({ ...DEFAULT_FILTERS, maxDistance: radius })}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        Reset all filters
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Column: Sticky Interactive Map */}
                <div className="lg:col-span-5 sticky top-20">
                  <ErrorBoundary>
                    <MapView
                      center={mapCenter}
                      radius={radius}
                      places={visiblePlaces}
                      onRadiusChange={handleRadiusChange}
                      theme={theme}
                      activePlaceId={activePlaceId}
                      hoveredPlaceId={hoveredPlaceId}
                      onSelectPlace={handleSelectPlace}
                      height="calc(100vh - 7rem)"
                    />
                  </ErrorBoundary>
                </div>
              </div>
            )}

            {/* ─── GRID VIEW MODE (Full-width grid + top map) ───────── */}
            {viewMode === 'grid' && (
              <div className="space-y-4">
                <ErrorBoundary>
                  <MapView
                    center={mapCenter}
                    radius={radius}
                    places={visiblePlaces}
                    onRadiusChange={handleRadiusChange}
                    theme={theme}
                    activePlaceId={activePlaceId}
                    hoveredPlaceId={hoveredPlaceId}
                    onSelectPlace={handleSelectPlace}
                    height="420px"
                  />
                </ErrorBoundary>

                <ErrorBoundary>
                  <AnalyticsDashboard places={places} />
                </ErrorBoundary>

                {/* Sort & Export row */}
                {visiblePlaces.length > 0 && (
                  <div className="flex flex-wrap gap-2 items-center justify-between bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">Sort:</span>
                      {['default', 'rating', 'distance'].map(opt => (
                        <button
                          key={opt}
                          onClick={() => setSort(opt)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer
                            ${sort === opt
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                        >
                          {opt === 'default' ? 'Default' : opt === 'rating' ? '⭐ Rating' : '📍 Distance'}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => exportResults('csv')}
                        disabled={exportLoading}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200/60 dark:border-emerald-800/40 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {exportLoading ? '⏳ Exporting…' : '📊 Export CSV'}
                      </button>
                      <button
                        onClick={() => exportResults('json')}
                        disabled={exportLoading}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/50 border border-violet-200/60 dark:border-violet-800/40 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {exportLoading ? '⏳ Exporting…' : '📄 Export JSON'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 4-column cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {visiblePlaces.map(place => (
                    <ResultCard
                      key={place.placeId}
                      place={place}
                      onSave={handleSave}
                      isSaved={isSaved(place)}
                      isActive={place.placeId === activePlaceId}
                      isHovered={place.placeId === hoveredPlaceId}
                      onHover={setHoveredPlaceId}
                      onSelect={handleSelectPlace}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ─── MAP-ONLY VIEW MODE (Full-screen map + drawer) ─────── */}
            {viewMode === 'map' && (
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                <ErrorBoundary>
                  <MapView
                    center={mapCenter}
                    radius={radius}
                    places={visiblePlaces}
                    onRadiusChange={handleRadiusChange}
                    theme={theme}
                    activePlaceId={activePlaceId}
                    hoveredPlaceId={hoveredPlaceId}
                    onSelectPlace={handleSelectPlace}
                    height="calc(100vh - 12rem)"
                  />
                </ErrorBoundary>

                {/* Floating card drawer of active selected place */}
                {activePlaceId && (
                  <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-96 z-20 shadow-2xl">
                    {(() => {
                      const sel = visiblePlaces.find(p => p.placeId === activePlaceId);
                      if (!sel) return null;
                      return (
                        <div className="relative">
                          <button
                            onClick={() => setActivePlaceId(null)}
                            className="absolute -top-2 -right-2 z-30 w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center text-xs shadow-md cursor-pointer"
                          >
                            ✕
                          </button>
                          <ResultCard
                            place={sel}
                            onSave={handleSave}
                            isSaved={isSaved(sel)}
                            isActive={true}
                            onHover={setHoveredPlaceId}
                            onSelect={handleSelectPlace}
                          />
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── MARKET RESEARCH TAB ──────────────────────────────────── */}
        {!loading && tab === 'market' && geoData && (
          <ErrorBoundary>
            <MarketResearch pincode={pincode} />
          </ErrorBoundary>
        )}

        {/* ─── SAVED PLACES DRAWER / SECTION ────────────────────────── */}
        {showSaved && (
          <div className="pt-2">
            <h2 className="text-sm font-bold text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-2">
              <span className="text-lg">★</span> Saved Places
              <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                {saved.length}
              </span>
            </h2>
            {saved.length === 0 ? (
              <p className="text-slate-400 text-xs">No saved places yet. Click ★ on any card to save it for quick reference.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {saved.map(place => (
                  <ResultCard
                    key={place.placeId}
                    place={place}
                    onSave={handleSave}
                    isSaved={true}
                    isActive={place.placeId === activePlaceId}
                    isHovered={place.placeId === hoveredPlaceId}
                    onHover={setHoveredPlaceId}
                    onSelect={handleSelectPlace}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Empty state hero ─────────────────────────────────────── */}
        {!loading && !geoData && !error && (
          <div className="text-center py-20 px-4">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-500/20 text-3xl">
              📍
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
              Explore Any PIN Code in India
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 max-w-md mx-auto leading-relaxed">
              Discover hotels, hospitals, schools, clinics, and businesses with commercial density metrics, market opportunity scoring, and lead-gen contacts.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
              {[
                { pin: '110001', name: 'Delhi Connaught Place' },
                { pin: '400001', name: 'Mumbai Fort' },
                { pin: '560001', name: 'Bengaluru MG Road' },
                { pin: '411001', name: 'Pune City' },
                { pin: '600001', name: 'Chennai George Town' },
                { pin: '700001', name: 'Kolkata BBD Bagh' },
              ].map(({ pin, name }) => (
                <button
                  key={pin}
                  onClick={() => doSearch(pin)}
                  className="px-3.5 py-1.5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-full text-xs font-medium text-slate-600 dark:text-slate-300
                             hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-2xs"
                >
                  {name} <span className="text-slate-400 dark:text-slate-500 text-[10px] ml-1">{pin}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
