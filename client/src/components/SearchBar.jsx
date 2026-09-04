import { useState, useEffect, useRef } from 'react';
import { reverseGeocode, fetchSuggestions } from '../utils/api';

export default function SearchBar({ onSearch, loading, openNowOnly = false, onOpenNowOnlyChange }) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const containerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch debounced autocomplete suggestions
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const data = await fetchSuggestions(query);
        if (data && data.suggestions && data.suggestions.length > 0) {
          setSuggestions(data.suggestions);
          setShowDropdown(true);
          setSelectedIndex(-1);
        } else {
          setSuggestions([]);
          setShowDropdown(false);
        }
      } catch {
        setSuggestions([]);
      }
    }, 180);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) {
      setError('Enter a PIN code or location name');
      return;
    }

    setShowDropdown(false);
    setError('');
    onSearch(q);
  };

  const handleSelectSuggestion = (item) => {
    const target = item.pincode ? item.pincode : item.name;
    setQuery(item.name + (item.pincode ? ` (${item.pincode})` : ''));
    setShowDropdown(false);
    setError('');
    onSearch(target);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported on this device');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const data = await reverseGeocode(coords.latitude, coords.longitude);
          setQuery(data.pincode);
          setError('');
          onSearch(data.pincode);
        } catch {
          setError('Could not detect PIN code for your location');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setError('Location access denied. Please enter PIN or area manually.');
        setLocating(false);
      }
    );
  };

  return (
    <div ref={containerRef} className="w-full max-w-2xl mx-auto relative">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-400 text-sm">
            🔍
          </span>
          <input
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setError('');
            }}
            onFocus={() => {
              if (suggestions.length > 0) setShowDropdown(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search PIN code or area (e.g. 585312, Koramangala, Connaught Place)…"
            disabled={loading}
            autoComplete="off"
            className="w-full pl-10 pr-8 py-2.5 text-sm border-2 border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800
                       text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 font-medium
                       focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20
                       transition-all disabled:opacity-60"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
                setShowDropdown(false);
              }}
              className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleNearMe}
          disabled={loading || locating}
          title="Detect my current location"
          className="px-3 py-2.5 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-base
                     hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-slate-700 transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {locating ? '⏳' : '📍'}
        </button>

        <button
          type="submit"
          disabled={!query.trim() || loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800
                     text-white text-sm font-semibold rounded-xl shadow-xs transition-all
                     disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Searching
            </>
          ) : (
            'Explore'
          )}
        </button>
      </form>

      {/* ─── Autocomplete suggestions dropdown ───────────────────── */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden py-1 max-h-80 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <span>Location Suggestions</span>
            <span className="text-[9px] lowercase font-normal opacity-75">Use ▲▼ to navigate</span>
          </div>

          {suggestions.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={`${item.name}-${item.pincode}-${idx}`}
                onClick={() => handleSelectSuggestion(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer transition-colors
                  ${isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-base select-none shrink-0">📍</span>
                  <div className="truncate">
                    <p className="font-semibold text-xs text-slate-900 dark:text-white truncate leading-tight">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                      {[item.locality, item.district, item.state].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>

                {item.pincode && (
                  <span className="shrink-0 ml-3 text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 px-2 py-0.5 rounded-full">
                    📮 {item.pincode}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Error and quick options row */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-1.5 ml-0.5">
        {error && <p className="text-rose-500 text-xs font-medium w-full">⚠️ {error}</p>}
        {onOpenNowOnlyChange && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={openNowOnly}
              onChange={e => onOpenNowOnlyChange(e.target.checked)}
              className="accent-emerald-600 w-3.5 h-3.5 cursor-pointer"
            />
            <span className={`group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors ${openNowOnly ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}`}>
              🟢 Open now only
            </span>
          </label>
        )}
      </div>
    </div>
  );
}
