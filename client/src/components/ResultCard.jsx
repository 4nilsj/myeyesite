import { useState } from 'react';
import { fetchDetails, photoUrl } from '../utils/api';

const PRICE = ['', '₹', '₹₹', '₹₹₹', '₹₹₹₹'];

function Stars({ rating }) {
  if (!rating) return null;
  return (
    <span className="text-yellow-500 font-bold text-sm">★ {rating.toFixed(1)}</span>
  );
}

export default function ResultCard({ place, onSave, isSaved }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleToggle = async () => {
    if (!expanded && !detail) {
      setLoading(true);
      try {
        const data = await fetchDetails(place.placeId);
        setDetail(data);
      } catch (err) {
        const msg = err.response?.data?.error || err.message || 'Could not load details';
        setDetail({ error: msg });
      } finally {
        setLoading(false);
      }
    }
    setExpanded(prev => !prev);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(place.gmapsLink);
  };

  const photo = place.photoRef && !imgError ? photoUrl(place.photoRef, 600) : null;
  const d = detail;

  return (
    <div className={`place-card bg-white rounded-2xl shadow-sm border overflow-hidden
      ${place.permanentlyClosed ? 'opacity-60 border-red-200' : 'border-gray-100'}`}>

      {/* Photo */}
      {photo && (
        <img
          src={photo}
          alt={place.name}
          onError={() => setImgError(true)}
          className="w-full h-32 object-cover"
          loading="lazy"
        />
      )}

      <div className="p-4">
        {/* Status badge */}
        {place.permanentlyClosed && (
          <span className="inline-block text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full mb-2">
            🔴 Permanently Closed
          </span>
        )}

        {/* Header row */}
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-sm leading-snug truncate">
              {place.icon} {place.name}
            </h3>
            <p className="text-gray-400 text-xs mt-0.5 truncate">{place.address}</p>
            {place.distance && (
              <p className="text-blue-600 text-xs font-medium mt-1">📍 {place.distance.toFixed(2)} km away</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <Stars rating={place.rating} />
            {place.priceLevel > 0 && (
              <p className="text-xs text-gray-400">{PRICE[place.priceLevel]}</p>
            )}
          </div>
        </div>

        {/* Open/closed status */}
        {place.openNow !== null && (
          <p className={`text-xs font-medium mt-1 ${place.openNow ? 'text-green-600' : 'text-red-500'}`}>
            {place.openNow ? '🟢 Open Now' : '🔴 Currently Closed'}
          </p>
        )}

        {/* Expanded detail section */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            {loading && (
              <div className="skeleton h-16 rounded-lg" />
            )}
            {d?.error && (
              <p className="text-red-400 text-xs">{d.error}</p>
            )}
            {d && !d.error && (
              <>
                {d.phone && (
                  <div className="flex gap-3">
                    <a href={`tel:${d.phone}`} className="text-sm text-blue-600 hover:underline">
                      📞 {d.phone}
                    </a>
                    <a
                      href={`https://wa.me/${d.phone.replace(/\D/g, '')}`}
                      target="_blank" rel="noreferrer"
                      className="text-sm text-green-600 hover:underline"
                    >
                      💬 WhatsApp
                    </a>
                  </div>
                )}
                {d.website && (
                  <a
                    href={d.website}
                    target="_blank" rel="noreferrer"
                    className="block text-sm text-blue-600 hover:underline truncate"
                  >
                    🌐 {d.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {d.openingHours && (
                  <details className="text-xs text-gray-500 cursor-pointer">
                    <summary className="font-medium text-gray-700">🕐 Opening Hours</summary>
                    <ul className="mt-1 space-y-0.5 ml-4">
                      {d.openingHours.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                  </details>
                )}
                {d.reviews?.length > 0 && (
                  <div className="space-y-1.5">
                    {d.reviews.map((r, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-2 text-xs text-gray-600">
                        <span className="text-yellow-500">{'★'.repeat(r.rating)}</span>
                        <span className="text-gray-400 ml-1">· {r.time}</span>
                        <p className="mt-0.5">{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-3 flex gap-1.5">
          <a
            href={place.gmapsLink}
            target="_blank" rel="noreferrer"
            className="flex-1 text-center text-xs font-medium bg-blue-50 text-blue-700
                       py-2 rounded-lg hover:bg-blue-100 transition-colors"
          >
            📍 Maps
          </a>
          <button
            onClick={handleToggle}
            className="flex-1 text-xs font-medium bg-gray-100 text-gray-700
                       py-2 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {loading ? '⏳' : expanded ? 'Less ▲' : 'Details ▼'}
          </button>
          <button
            onClick={copyLink}
            title="Copy Google Maps link"
            className="px-3 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
          >
            📋
          </button>
          <button
            onClick={() => onSave(place)}
            title={isSaved ? 'Saved' : 'Save place'}
            className={`px-3 text-xs rounded-lg transition-colors
              ${isSaved
                ? 'bg-yellow-100 text-yellow-600'
                : 'bg-gray-100 text-gray-600 hover:bg-yellow-50 hover:text-yellow-600'
              }`}
          >
            {isSaved ? '★' : '☆'}
          </button>
        </div>
      </div>
    </div>
  );
}
