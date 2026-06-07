import { useState } from 'react';

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center gap-2 select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2
          ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-sm
            transition-transform duration-200 ${checked ? 'translate-x-4.5' : ''}`}
        />
      </button>
      <span className="text-sm font-medium text-gray-600">{label}</span>
    </div>
  );
}

export default function FilterBar({ filters, onChange, totalCount, filteredCount, radius = 5000, contactsReady = true }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Compute active advanced filters count
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
    <div className="bg-white border border-gray-150 rounded-2xl shadow-sm overflow-hidden transition-all duration-300">
      {/* Main filter row */}
      <div className="p-4 flex flex-wrap gap-4 items-center justify-between">
        
        {/* Search name or address */}
        <div className="relative flex-1 min-w-[240px]">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400 text-sm">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search places by name or address..."
            value={filters.searchQuery || ''}
            onChange={e => onChange('searchQuery', e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder-gray-400"
          />
          {filters.searchQuery && (
            <button
              onClick={() => onChange('searchQuery', '')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 text-xs font-semibold"
            >
              Clear
            </button>
          )}
        </div>

        {/* Rating filter & toggles */}
        <div className="flex flex-wrap items-center gap-3">
          
          <select
            value={filters.minRating}
            onChange={e => onChange('minRating', parseFloat(e.target.value))}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium text-gray-700 cursor-pointer"
          >
            <option value={0}>⭐ All Ratings</option>
            <option value={3}>⭐ 3.0+ Stars</option>
            <option value={3.5}>⭐ 3.5+ Stars</option>
            <option value={4}>⭐ 4.0+ Stars</option>
            <option value={4.5}>⭐ 4.5+ Stars</option>
          </select>

          {/* Advanced filters toggle button */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border transition-all duration-250
              ${showAdvanced 
                ? 'bg-blue-50 border-blue-200 text-blue-600' 
                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
          >
            ⚙️ Filters
            {activeAdvancedCount > 0 && (
              <span className="flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full">
                {activeAdvancedCount}
              </span>
            )}
            <span className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {/* Reset button shown if filters modified */}
          {(activeAdvancedCount > 0 || filters.minRating > 0 || filters.searchQuery) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline px-2 py-1"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Items counter */}
        {totalCount > 0 && (
          <div className="text-sm text-gray-500 font-medium whitespace-nowrap lg:ml-auto">
            Showing <strong className="text-gray-800">{filteredCount}</strong> of <strong className="text-gray-800">{totalCount}</strong> results
          </div>
        )}
      </div>

      {/* Collapsible Advanced Filters panel */}
      {showAdvanced && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-4 transition-all duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Toggles col 1 */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Availability</h4>
              <Toggle
                label="🟢 Open Now"
                checked={filters.openNow}
                onChange={v => onChange('openNow', v)}
              />
              <Toggle
                label="🚫 Hide Closed Places"
                checked={filters.hideClosed}
                onChange={v => onChange('hideClosed', v)}
              />
            </div>

            {/* Toggles col 2 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Online Presence</h4>
                {!contactsReady && (
                  <span className="text-[10px] text-blue-500 animate-pulse font-medium">loading…</span>
                )}
              </div>
              <Toggle
                label="🌐 Has Website"
                checked={filters.hasWebsite}
                onChange={v => onChange('hasWebsite', v)}
              />
              <Toggle
                label="📞 Lead Gen (Website + Phone)"
                checked={filters.leadGen}
                onChange={v => onChange('leadGen', v)}
              />
            </div>

            {/* Range Slider for Distance */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Max Proximity</h4>
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                  {((filters.maxDistance || radius) / 1000).toFixed(1)} km
                </span>
              </div>
              <div className="pt-2">
                <input
                  type="range"
                  min={500}
                  max={radius}
                  step={500}
                  value={filters.maxDistance || radius}
                  onChange={e => onChange('maxDistance', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-medium mt-1">
                  <span>0.5 km</span>
                  <span>{(radius / 1000).toFixed(0)} km</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
