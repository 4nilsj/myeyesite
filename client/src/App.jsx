import { useState, useEffect, useCallback, useRef } from 'react';
import SearchBar from './components/SearchBar';
import CategoryTabs from './components/CategoryTabs';
import FilterBar from './components/FilterBar';
import ResultCard from './components/ResultCard';
import MapView from './components/MapView';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import MarketResearch from './components/MarketResearch';
import ErrorBoundary from './components/ErrorBoundary';
import { geocodePin, fetchNearby } from './utils/api';
import { ALL_CATEGORIES } from './utils/categoryMap';
import { debounce, calculateDistance } from './utils/debounce';

const DEFAULT_FILTERS = {
  hasWebsite: false,
  leadGen: false,
  openNow: false,
  hideClosed: true,
  minRating: 0,
  maxDistance: 5000,
  searchQuery: '',
};

function applyFilters(places, filters) {
  return places.filter(p => {
    if (filters.hideClosed && p.permanentlyClosed) return false;
    if (filters.hasWebsite && !p.hasWebsite) return false;
    if (filters.leadGen && !(p.hasWebsite && p.hasPhone)) return false;
    if (filters.openNow && p.openNow !== true) return false;
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
  const [places, setPlaces] = useState([]);            // all fetched places
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [radius, setRadius] = useState(5000);
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, maxDistance: 5000 });
  const [tab, setTab] = useState('results');            // 'results' | 'market'
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem('savedPlaces') || '[]'); }
    catch { return []; }
  });
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pinHistory') || '[]'); }
    catch { return []; }
  });
  const [showSaved, setShowSaved] = useState(false);
  const [sort, setSort] = useState('default'); // 'default' | 'rating' | 'distance'
  const [currentPage, setCurrentPage] = useState(1);
  const radiusTimerRef = useRef(null);
  const debouncedCategoryRef = useRef(null);

  const pageSize = 12;

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

  // Reset pagination to page 1 when category, filters, sorting, radius, or places list change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, filters.hasWebsite, filters.leadGen, filters.openNow, filters.hideClosed, filters.minRating, filters.maxDistance, filters.searchQuery, sort, places.length, radius]);

  const doSearch = useCallback(async (pin) => {
    setLoading(true);
    setError('');
    setPlaces([]);
    setGeoData(null);      // ← clear old results immediately
    setActiveCategory('all');
    setPincode(pin);

    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('pin', pin);
    window.history.replaceState({}, '', url);

    // Update search history
    setHistory(prev => {
      const next = [pin, ...prev.filter(p => p !== pin)].slice(0, 10);
      return next;
    });

    try {
      const geo = await geocodePin(pin);
      setGeoData(geo);

      // Fetch all categories in parallel
      const results = await Promise.allSettled(
        ALL_CATEGORIES.map(cat => fetchNearby(geo.lat, geo.lng, radius, cat))
      );

      const allPlaces = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value.places || [])
        .map(p => ({
          ...p,
          distance: calculateDistance(geo.lat, geo.lng, p.lat, p.lng)
        }));

      setPlaces(allPlaces);
    } catch (e) {
      setError(e.response?.data?.error || 'Search failed. Check the PIN code and try again.');
    } finally {
      setLoading(false);
    }
  }, [radius]);

  // Debounced re-fetch when radius changes
  useEffect(() => {
    if (!geoData || !pincode) return;

    if (radiusTimerRef.current) clearTimeout(radiusTimerRef.current);
    radiusTimerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await Promise.allSettled(
          ALL_CATEGORIES.map(cat => fetchNearby(geoData.lat, geoData.lng, radius, cat))
        );
        const allPlaces = results
          .filter(r => r.status === 'fulfilled')
          .flatMap(r => r.value.places || [])
          .map(p => ({
            ...p,
            distance: calculateDistance(geoData.lat, geoData.lng, p.lat, p.lng)
          }));
        setPlaces(allPlaces);
      } catch (e) {
        setError('Failed to fetch places at new radius');
      } finally {
        setLoading(false);
      }
    }, 500);
  }, [radius, geoData, pincode]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleCategoryChange = (cat) => {
    if (!debouncedCategoryRef.current) {
      debouncedCategoryRef.current = debounce((category) => {
        setActiveCategory(category);
      }, 300);
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

  // Category-filtered + filter-applied places
  const categoryFiltered = activeCategory === 'all'
    ? places
    : places.filter(p => p.category === activeCategory);
  let visiblePlaces = applyFilters(categoryFiltered, filters);

  // Apply sorting
  if (sort === 'rating') {
    visiblePlaces = [...visiblePlaces].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (sort === 'distance') {
    visiblePlaces = [...visiblePlaces].sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }

  // Slicing for pagination
  const totalPages = Math.ceil(visiblePlaces.length / pageSize);
  const paginatedPlaces = visiblePlaces.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const exportResults = (format) => {
    if (!visiblePlaces.length) {
      alert('No results to export');
      return;
    }

    const data = visiblePlaces.map(p => ({
      name: p.name,
      address: p.address,
      rating: p.rating || 'N/A',
      reviews: p.userRatingsTotal || 0,
      distance: p.distance ? `${p.distance.toFixed(2)} km` : 'N/A',
      openNow: p.openNow ? 'Yes' : 'No',
      priceLevel: p.priceLevel || 'N/A',
      phone: p.phone || 'N/A',
      website: p.website || 'N/A',
      lat: p.lat,
      lng: p.lng,
      gmapsLink: p.gmapsLink,
    }));

    if (format === 'csv') {
      const headers = Object.keys(data[0]);
      const csv = [
        headers.join(','),
        ...data.map(row =>
          headers.map(h => `"${String(row[h]).replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');
      downloadFile(csv, 'places.csv', 'text/csv');
    } else {
      downloadFile(JSON.stringify(data, null, 2), 'places.json', 'application/json');
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
    : { lat: 20.5937, lng: 78.9629 }; // center of India default

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-black text-blue-600 shrink-0">📍 PinCode Explorer</h1>
            <div className="flex-1 max-w-2xl">
              <SearchBar onSearch={doSearch} loading={loading} />
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setShowSaved(s => !s)}
                className={`text-sm px-3 py-1.5 rounded-xl border transition-colors
                  ${showSaved ? 'bg-yellow-50 border-yellow-300 text-yellow-700' : 'bg-white border-gray-200 text-gray-600 hover:border-yellow-300'}`}
              >
                ★ Saved ({saved.length})
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">

        {/* ─── PIN info bar ──────────────────────────────────────────── */}
        {geoData && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="bg-blue-100 text-blue-800 font-semibold px-3 py-1 rounded-full">
              📮 {pincode}
            </span>
            <span className="text-gray-600">
              {geoData.locality}{geoData.district ? `, ${geoData.district}` : ''}, {geoData.state}
            </span>
            {/* PIN history pills */}
            {history.filter(h => h !== pincode).slice(0, 4).map(h => (
              <button key={h} onClick={() => doSearch(h)}
                className="text-xs text-gray-400 hover:text-blue-600 px-2 py-0.5 rounded-full border border-gray-200 hover:border-blue-300 transition-colors">
                {h}
              </button>
            ))}
          </div>
        )}

        {/* ─── Tab switcher ─────────────────────────────────────────── */}
        {geoData && (
          <div className="flex gap-2 border-b border-gray-200">
            {['results', 'market'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`pb-2 px-1 text-sm font-semibold border-b-2 transition-colors capitalize
                  ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t === 'results' ? `🗺️ Results` : `🔬 Market Research`}
              </button>
            ))}
          </div>
        )}

        {/* ─── Error ────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* ─── Loading skeleton ─────────────────────────────────────── */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-48 rounded-2xl" />
            ))}
          </div>
        )}

        {/* ─── RESULTS TAB ──────────────────────────────────────────── */}
        {!loading && tab === 'results' && geoData && (
          <>
            {/* Map wrapper with ErrorBoundary */}
            <ErrorBoundary>
              <MapView
                center={mapCenter}
                radius={radius}
                places={visiblePlaces}
                onRadiusChange={setRadius}
              />
            </ErrorBoundary>

            {/* Category tabs */}
            <CategoryTabs active={activeCategory} onChange={handleCategoryChange} counts={counts} />

            {/* Filter bar */}
            <FilterBar
              filters={filters}
              onChange={handleFilterChange}
              totalCount={categoryFiltered.length}
              filteredCount={visiblePlaces.length}
              radius={radius}
            />

            {/* Analytics dashboard with ErrorBoundary */}
            <ErrorBoundary>
              <AnalyticsDashboard places={places} />
            </ErrorBoundary>

            {/* Sort & Export Controls */}
            {visiblePlaces.length > 0 && (
              <div className="flex flex-wrap gap-3 items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex gap-2">
                  <span className="text-sm font-semibold text-gray-600 self-center">Sort:</span>
                  {['default', 'rating', 'distance'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => setSort(opt)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${sort === opt
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {opt === 'default' ? '📋 Default' : opt === 'rating' ? '⭐ Rating' : '📍 Distance'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => exportResults('csv')}
                    className="px-4 py-2 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 text-sm font-medium transition-colors"
                  >
                    📊 CSV
                  </button>
                  <button
                    onClick={() => exportResults('json')}
                    className="px-4 py-2 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 text-sm font-medium transition-colors"
                  >
                    📄 JSON
                  </button>
                </div>
              </div>
            )}

            {/* Results grid */}
            {paginatedPlaces.length > 0 ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {paginatedPlaces.map(place => (
                    <ResultCard
                      key={place.placeId}
                      place={place}
                      onSave={handleSave}
                      isSaved={isSaved(place)}
                    />
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 mt-8 bg-white p-4 rounded-2xl border border-gray-150 shadow-sm">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      className="px-3.5 py-2 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white transition-all select-none"
                    >
                      ◀ Prev
                    </button>
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: totalPages }).map((_, i) => {
                        const page = i + 1;
                        if (totalPages > 6 && page !== 1 && page !== totalPages && Math.abs(currentPage - page) > 1) {
                          if (page === 2 || page === totalPages - 1) {
                            return <span key={page} className="text-gray-400 px-1 font-bold">...</span>;
                          }
                          return null;
                        }
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`w-9 h-9 rounded-xl text-sm font-semibold transition-all select-none ${
                              currentPage === page
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'border border-gray-200 hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      className="px-3.5 py-2 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white transition-all select-none"
                    >
                      Next ▶
                    </button>
                  </div>
                )}
              </div>
            ) : places.length > 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-medium">No results match the active filters</p>
                <button onClick={() => setFilters({ ...DEFAULT_FILTERS, maxDistance: radius })}
                  className="mt-3 text-sm text-blue-600 hover:underline">
                  Clear all filters
                </button>
              </div>
            ) : null}
          </>
        )}

        {/* ─── MARKET RESEARCH TAB ──────────────────────────────────── */}
        {!loading && tab === 'market' && geoData && (
          <ErrorBoundary>
            <MarketResearch pincode={pincode} />
          </ErrorBoundary>
        )}

        {/* ─── SAVED PANEL ──────────────────────────────────────────── */}
        {showSaved && (
          <div>
            <h2 className="text-lg font-bold mb-3">★ Saved Places</h2>
            {saved.length === 0 ? (
              <p className="text-gray-400 text-sm">No saved places yet. Click ☆ on any card to save.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {saved.map(place => (
                  <ResultCard
                    key={place.placeId}
                    place={place}
                    onSave={handleSave}
                    isSaved={true}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Empty state ──────────────────────────────────────────── */}
        {!loading && !geoData && !error && (
          <div className="text-center py-24">
            <p className="text-6xl mb-4">📍</p>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Discover any area in India</h2>
            <p className="text-gray-500 mb-6">
              Enter a 6-digit PIN code to find hotels, hospitals, restaurants, schools, and more
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-sm text-gray-400">
              {['110001', '400001', '411001', '600001', '560001'].map(pin => (
                <button key={pin} onClick={() => doSearch(pin)}
                  className="px-3 py-1.5 border border-gray-200 rounded-full hover:border-blue-400 hover:text-blue-600 transition-colors">
                  Try {pin}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
