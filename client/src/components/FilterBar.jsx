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
          ${checked ? 'bg-indigo-600' : 'bg-slate-200 group-hover:bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? 'translate-x-4' : ''}`} />
      </button>
      <span className={`text-sm transition-colors ${checked ? 'text-indigo-700 font-semibold' : 'text-slate-600'}`}>{label}</span>
    </label>
  );
}

export default function FilterBar({ filters, onChange, totalCount, filteredCount, radius = 5000, contactsReady = true }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activeAdvancedCount = [
    filters.hasWebsite,
    filters.leadGen,
    filters.openNow,
    !filters.hideClosed,
    filters.maxDistance && filters.maxDistance !== radius,
  ].filter(Boolean).length;

  const handleResetFilters = () => {
    onChange('hasWebsite', false);
    onChange('leadGen', false);
    onChange('openNow', false);
    onChange('hideClosed', true);
    onChange('minRating', 0);
    onChange('maxDistance', radius);
    onChange('searchQuery', '');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-3.5 flex flex-wrap gap-3 items-center">

        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search by name or address…"
            value={filters.searchQuery || ''}
            onChange={e => onChange('searchQuery', e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl
                       focus:bg-white focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100
                       transition-all placeholder-slate-400"
          />
          {filters.searchQuery && (
            <button onClick={() => onChange('searchQuery', '')}
              className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-slate-600 text-xs font-bold">
              ✕
            </button>
          )}
        </div>

        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filters.minRating}
            onChange={e => onChange('minRating', parseFloat(e.target.value))}
            className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-indigo-400
                       focus:ring-1 focus:ring-indigo-100 transition-all font-medium text-slate-700 cursor-pointer"
          >
            <option value={0}>⭐ All Ratings</option>
            <option value={3}>⭐ 3.0+</option>
            <option value={3.5}>⭐ 3.5+</option>
            <option value={4}>⭐ 4.0+</option>
            <option value={4.5}>⭐ 4.5+</option>
          </select>

          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-xl border transition-all
              ${showAdvanced ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}
          >
            <span>⚙️ Filters</span>
            {activeAdvancedCount > 0 && (
              <span className="flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-indigo-600 rounded-full">
                {activeAdvancedCount}
              </span>
            )}
            <span className={`text-xs transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {(activeAdvancedCount > 0 || filters.minRating > 0 || filters.searchQuery) && (
            <button type="button" onClick={handleResetFilters}
              className="text-xs font-semibold text-rose-500 hover:text-rose-700 hover:underline px-1">
              Clear all
            </button>
          )}
        </div>

        {totalCount > 0 && (
          <div className="text-xs text-slate-500 font-medium whitespace-nowrap lg:ml-auto">
            <span className="font-bold text-slate-800">{filteredCount}</span>
            <span className="text-slate-400"> / {totalCount} results</span>
          </div>
        )}
      </div>

      {showAdvanced && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            <div className="space-y-3.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Availability</p>
              <Toggle label="🟢 Open Now" checked={filters.openNow} onChange={v => onChange('openNow', v)} />
              <Toggle label="🚫 Hide Permanently Closed" checked={filters.hideClosed} onChange={v => onChange('hideClosed', v)} />
            </div>

            <div className="space-y-3.5">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Online Presence</p>
                {!contactsReady && (
                  <span className="text-[10px] text-indigo-400 animate-pulse font-semibold">loading…</span>
                )}
              </div>
              <Toggle label="🌐 Has Website" checked={filters.hasWebsite} onChange={v => onChange('hasWebsite', v)} />
              <Toggle label="📞 Lead Gen (Website + Phone)" checked={filters.leadGen} onChange={v => onChange('leadGen', v)} />
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Max Distance</p>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">
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
                className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-medium">
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
