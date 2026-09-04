import { useState } from 'react';

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 shrink-0
          ${checked ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700 group-hover:bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? 'translate-x-4' : ''}`}
        />
      </button>
      <span className={`text-sm transition-colors ${checked ? 'text-indigo-700 dark:text-indigo-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
        {label}
      </span>
    </label>
  );
}

export default function FilterBar({
  filters,
  onChange,
  totalCount,
  filteredCount,
  radius = 5000,
  viewMode = 'split',
  onViewModeChange,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activeAdvancedCount = [
    filters.openNow,
    !filters.hideClosed,
    filters.maxDistance && filters.maxDistance !== radius,
  ].filter(Boolean).length;

  const handleResetFilters = () => {
    onChange('openNow', false);
    onChange('hideClosed', true);
    onChange('minRating', 0);
    onChange('maxDistance', radius);
    onChange('searchQuery', '');
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors duration-200">
      <div className="p-3.5 flex flex-wrap gap-3 items-center">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 text-sm">
            🔍
          </span>
          <input
            type="text"
            placeholder="Filter by name or address…"
            value={filters.searchQuery || ''}
            onChange={e => onChange('searchQuery', e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl
                       text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500
                       focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20
                       transition-all"
          />
          {filters.searchQuery && (
            <button
              onClick={() => onChange('searchQuery', '')}
              className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Rating filter dropdown */}
          <select
            value={filters.minRating}
            onChange={e => onChange('minRating', parseFloat(e.target.value))}
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 focus:outline-none focus:border-indigo-500
                       font-medium text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
          >
            <option value={0}>⭐ All Ratings</option>
            <option value={3}>⭐ 3.0+</option>
            <option value={3.5}>⭐ 3.5+</option>
            <option value={4}>⭐ 4.0+</option>
            <option value={4.5}>⭐ 4.5+</option>
          </select>

          {/* Advanced filters button */}
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer select-none
              ${showAdvanced
                ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'}`}
          >
            <span>⚙️ Filters</span>
            {activeAdvancedCount > 0 && (
              <span className="flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-indigo-600 rounded-full">
                {activeAdvancedCount}
              </span>
            )}
            <span className={`text-[10px] transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {/* Reset button */}
          {(activeAdvancedCount > 0 || filters.minRating > 0 || filters.searchQuery) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-semibold text-rose-500 hover:text-rose-700 dark:text-rose-400 hover:underline px-1 cursor-pointer"
            >
              Reset
            </button>
          )}

          {/* View mode switcher */}
          {onViewModeChange && (
            <div className="hidden sm:flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => onViewModeChange('split')}
                title="Split View (Feed + Sticky Map)"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none flex items-center gap-1
                  ${viewMode === 'split'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <span>◫</span>
                <span className="hidden md:inline">Split</span>
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('grid')}
                title="Grid View (Full-width Cards)"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none flex items-center gap-1
                  ${viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <span>▦</span>
                <span className="hidden md:inline">Grid</span>
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('map')}
                title="Map View (Full-screen Map)"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none flex items-center gap-1
                  ${viewMode === 'map'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <span>🗺️</span>
                <span className="hidden md:inline">Map</span>
              </button>
            </div>
          )}
        </div>

        {/* Results counter */}
        {totalCount > 0 && (
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap ml-auto">
            <span className="font-bold text-slate-900 dark:text-slate-100">{filteredCount}</span>
            <span className="text-slate-400 dark:text-slate-500"> / {totalCount} places</span>
          </div>
        )}
      </div>

      {/* Advanced filters dropdown drawer */}
      {showAdvanced && (
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-4 transition-colors">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-3.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Operating Status
              </p>
              <Toggle label="🟢 Open Now Only" checked={filters.openNow} onChange={v => onChange('openNow', v)} />
              <Toggle label="🚫 Hide Permanently Closed" checked={filters.hideClosed} onChange={v => onChange('hideClosed', v)} />
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Maximum Distance
                </p>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-lg border border-indigo-100 dark:border-indigo-900/40">
                  {((filters.maxDistance || radius) / 1000).toFixed(1)} km
                </span>
              </div>
              <input
                type="range"
                min={500}
                max={radius}
                step={500}
                value={filters.maxDistance || radius}
                onChange={e => onChange('maxDistance', parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-400"
              />
              <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                <span>0.5 km</span>
                <span>{(radius / 1000).toFixed(0)} km</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
