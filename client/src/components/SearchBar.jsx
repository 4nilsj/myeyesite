import { useState } from 'react';
import { reverseGeocode } from '../utils/api';

export default function SearchBar({ onSearch, loading, websiteOnly = false, onWebsiteOnlyChange, openNowOnly = false, onOpenNowOnlyChange }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);

  const validate = (value) => /^[1-9][0-9]{5}$/.test(value);

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
      setError('Geolocation not supported by your browser');
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
        <input
          type="text"
          inputMode="numeric"
          value={pin}
          onChange={e => {
            setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
            setError('');
          }}
          placeholder="Enter 6-digit PIN code (e.g. 411001)"
          className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3 text-lg
                     focus:outline-none focus:border-blue-500 transition-colors bg-white"
          disabled={loading}
        />
        <button
          type="button"
          onClick={handleNearMe}
          disabled={loading || locating}
          title="Use my current location"
          className="bg-white border-2 border-gray-200 hover:border-blue-400 px-4 py-3
                     rounded-xl text-xl transition-colors disabled:opacity-50"
        >
          {locating ? '⏳' : '📍'}
        </button>
        <button
          type="submit"
          disabled={pin.length !== 6 || loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                     text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-4 mt-2 ml-1">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {onWebsiteOnlyChange && (
          <label className="flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={websiteOnly}
              onChange={e => onWebsiteOnlyChange(e.target.checked)}
              className="accent-blue-600 w-3.5 h-3.5 cursor-pointer"
            />
            <span className={websiteOnly ? 'text-blue-600 font-medium' : ''}>
              🌐 Website only
            </span>
          </label>
        )}
        {onOpenNowOnlyChange && (
          <label className="flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={openNowOnly}
              onChange={e => onOpenNowOnlyChange(e.target.checked)}
              className="accent-green-600 w-3.5 h-3.5 cursor-pointer"
            />
            <span className={openNowOnly ? 'text-green-600 font-medium' : ''}>
              🟢 Open now only
            </span>
          </label>
        )}
      </div>
    </div>
  );
}
