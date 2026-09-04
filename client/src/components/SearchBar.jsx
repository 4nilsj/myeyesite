import { useState } from 'react';
import { reverseGeocode } from '../utils/api';

export default function SearchBar({ onSearch, loading, openNowOnly = false, onOpenNowOnlyChange }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);

  const validate = (v) => /^[1-9][0-9]{5}$/.test(v);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate(pin)) {
      setError('Enter a valid 6-digit Indian PIN code');
      return;
    }
    setError('');
    onSearch(pin);
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
          setPin(data.pincode);
          setError('');
          onSearch(data.pincode);
        } catch {
          setError('Could not detect PIN code for your location');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setError('Location access denied. Please enter PIN manually.');
        setLocating(false);
      }
    );
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 text-sm">
            📮
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={pin}
            onChange={e => {
              setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
              setError('');
            }}
            placeholder="Enter 6-digit PIN code (e.g. 110001, 560001)…"
            disabled={loading}
            className="w-full pl-9 pr-4 py-2.5 text-sm border-2 border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800
                       text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 font-medium
                       focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20
                       transition-all disabled:opacity-60"
          />
        </div>
        <button
          type="button"
          onClick={handleNearMe}
          disabled={loading || locating}
          title="Use my GPS location"
          className="px-3 py-2.5 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-base
                     hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-slate-700 transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {locating ? '⏳' : '📍'}
        </button>
        <button
          type="submit"
          disabled={pin.length !== 6 || loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800
                     text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-200 dark:shadow-none transition-all
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
            'Search'
          )}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-1.5 ml-0.5">
        {error && <p className="text-rose-500 text-xs font-medium w-full">{error}</p>}
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
