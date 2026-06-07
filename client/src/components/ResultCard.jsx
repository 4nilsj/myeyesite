import { useState } from 'react';
import { fetchDetails, photoUrl } from '../utils/api';

const PRICE = ['', '₹', '₹₹', '₹₹₹', '₹₹₹₹'];

function RatingStars({ rating }) {
  if (!rating) return null;
  const filled = Math.round(rating);
  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map(i => (
          <svg key={i} className={`w-3 h-3 ${i <= filled ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>
        ))}
      </div>
      <span className="text-[11px] text-slate-500 font-medium">
        {rating.toFixed(1)}
        {' '}
        <span className="text-slate-400">
          ({new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(0)})
        </span>
      </span>
    </div>
  );
}

export default function ResultCard({ place, onSave, isSaved }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleToggle = async () => {
    if (!expanded && !detail) {
      setDetailLoading(true);
      try {
        const data = await fetchDetails(place.placeId);
        setDetail(data);
      } catch (err) {
        setDetail({ error: err.response?.data?.error || 'Could not load details' });
      } finally {
        setDetailLoading(false);
      }
    }
    setExpanded(v => !v);
  };

  const photo = place.photoRef && !imgError ? photoUrl(place.photoRef, 600) : null;
  const d = detail;
  const filled = place.rating ? Math.round(place.rating) : 0;

  return (
    <div className={`place-card bg-white rounded-2xl border overflow-hidden flex flex-col
      ${place.permanentlyClosed ? 'border-red-100 opacity-70' : 'border-slate-100 shadow-sm'}`}>

      {/* Photo / placeholder */}
      <div className="relative">
        {photo ? (
          <img src={photo} alt={place.name} onError={() => setImgError(true)}
            className="w-full h-36 object-cover" loading="lazy" />
        ) : (
          <div className="h-24 bg-gradient-to-br from-indigo-50 via-violet-50 to-slate-50 flex items-center justify-center">
            <span className="text-5xl opacity-20">{place.icon}</span>
          </div>
        )}

        {/* Category badge */}
        <span className="absolute top-2 left-2 text-[10px] font-bold bg-white/90 backdrop-blur-sm
                         text-slate-600 px-2 py-0.5 rounded-full shadow-sm border border-white/60">
          {place.icon} {place.label}
        </span>

        {/* Save button */}
        <button onClick={() => onSave(place)}
          title={isSaved ? 'Saved' : 'Save'}
          className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full
                      text-sm shadow-sm transition-all duration-200 backdrop-blur-sm
                      ${isSaved ? 'bg-amber-400 text-white shadow-amber-200' : 'bg-white/90 text-slate-400 hover:text-amber-500 hover:bg-amber-50'}`}>
          {isSaved ? '★' : '☆'}
        </button>

        {place.permanentlyClosed && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-xs font-bold text-white bg-red-500 px-3 py-1 rounded-full shadow">
              Permanently Closed
            </span>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        {/* Name */}
        <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 mb-1">
          {place.name}
        </h3>

        {/* Rating row */}
        {place.rating && (
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(i => (
                <svg key={i} className={`w-3 h-3 ${i <= filled ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
              ))}
            </div>
            <span className="text-[11px] text-slate-500 font-medium">{place.rating.toFixed(1)}</span>
            <span className="text-[11px] text-slate-400">
              ({place.userRatingsTotal > 999
                ? `${(place.userRatingsTotal / 1000).toFixed(1)}k`
                : place.userRatingsTotal})
            </span>
            {place.priceLevel > 0 && (
              <span className="text-[11px] text-slate-400 ml-auto">{PRICE[place.priceLevel]}</span>
            )}
          </div>
        )}

        {/* Address */}
        <p className="text-slate-400 text-xs leading-relaxed line-clamp-2 mb-2.5">{place.address}</p>

        {/* Status + distance chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {place.distance && (
            <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
              📍 {place.distance.toFixed(1)} km
            </span>
          )}
          {place.openNow !== null && !place.permanentlyClosed && (
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold
              ${place.openNow ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
              {place.openNow ? '🟢 Open' : '🔴 Closed'}
            </span>
          )}
        </div>


        {/* Expanded section */}
        {expanded && (
          <div className="pt-3 border-t border-slate-100 space-y-2.5 mb-3">
            {detailLoading && <div className="skeleton h-14 rounded-xl" />}
            {d?.error && (
              <p className="text-xs text-red-500 bg-red-50 p-2.5 rounded-xl">{d.error}</p>
            )}
            {d && !d.error && (
              <>
                {/* Show phone/website in expanded too if not already shown above */}
                {!place.phone && d.phone && (
                  <div className="flex gap-2">
                    <a href={`tel:${d.phone}`} className="text-xs text-indigo-600 hover:underline font-medium">📞 {d.phone}</a>
                    <a href={`https://wa.me/${d.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                      className="text-xs text-green-600 hover:underline font-medium">💬 WhatsApp</a>
                  </div>
                )}
                {!place.website && d.website && (
                  <a href={d.website} target="_blank" rel="noreferrer"
                    className="block text-xs text-indigo-600 hover:underline truncate font-medium">
                    🌐 {d.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {d.openingHours && (
                  <details className="text-xs cursor-pointer group">
                    <summary className="font-semibold text-slate-700 group-open:text-indigo-600 transition-colors select-none">
                      🕐 Opening Hours
                    </summary>
                    <ul className="mt-1.5 ml-4 space-y-0.5 text-slate-500">
                      {d.openingHours.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                  </details>
                )}
                {d.reviews?.length > 0 && (
                  <div className="space-y-1.5">
                    {d.reviews.map((r, i) => (
                      <div key={i} className="bg-slate-50 rounded-xl p-2.5 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-amber-400 text-[10px]">{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</span>
                          <span className="text-slate-400">· {r.author} · {r.time}</span>
                        </div>
                        <p className="leading-relaxed">{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Action bar */}
        <div className="flex gap-1.5 mt-2">
          <a href={place.gmapsLink} target="_blank" rel="noreferrer"
            className="flex-1 text-center text-xs font-semibold py-2 rounded-xl
                       bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors">
            🗺️ Maps
          </a>
          <button onClick={handleToggle}
            className={`flex-1 text-xs font-semibold py-2 rounded-xl transition-colors
              ${expanded ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {detailLoading ? '⏳' : expanded ? 'Less ▲' : 'Details ▼'}
          </button>
          <button onClick={() => navigator.clipboard.writeText(place.gmapsLink)}
            title="Copy link"
            className="px-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors text-sm">
            📋
          </button>
        </div>
      </div>
    </div>
  );
}
