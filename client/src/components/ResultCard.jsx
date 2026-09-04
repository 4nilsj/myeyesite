import { useState } from 'react';
import { fetchDetails, photoUrl } from '../utils/api';

const PRICE = ['', '₹', '₹₹', '₹₹₹', '₹₹₹₹'];

function RatingStars({ rating, count }) {
  if (!rating) return null;
  const filled = Math.round(rating);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <svg
            key={i}
            className={`w-3 h-3 ${i <= filled ? 'text-amber-400' : 'text-slate-200 dark:text-slate-700'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <span className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold">{rating.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          ({count > 999 ? `${(count / 1000).toFixed(1)}k` : count})
        </span>
      )}
    </div>
  );
}

export default function ResultCard({
  place,
  onSave,
  isSaved,
  isActive = false,
  isHovered = false,
  onHover,
  onSelect,
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleToggle = async (e) => {
    e.stopPropagation();
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

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(place.gmapsLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const photo = place.photoRef && !imgError ? photoUrl(place.photoRef, 600) : null;
  const d = detail;

  return (
    <div
      id={`card-${place.placeId}`}
      onClick={() => onSelect && onSelect(place)}
      onMouseEnter={() => onHover && onHover(place.placeId)}
      onMouseLeave={() => onHover && onHover(null)}
      className={`place-card bg-white dark:bg-slate-900 rounded-2xl border overflow-hidden flex flex-col cursor-pointer transition-all duration-200
        ${isActive
          ? 'is-active ring-2 ring-indigo-500 dark:ring-indigo-400 border-transparent shadow-xl dark:shadow-indigo-950/50'
          : isHovered
          ? 'is-hovered ring-2 ring-indigo-300 dark:ring-indigo-600/70 border-transparent'
          : place.permanentlyClosed
          ? 'border-rose-100 dark:border-rose-950/50 opacity-70'
          : 'border-slate-100 dark:border-slate-800 shadow-sm hover:border-slate-300 dark:hover:border-slate-700'}`}
    >
      {/* Photo / placeholder header */}
      <div className="relative">
        {photo ? (
          <img
            src={photo}
            alt={place.name}
            onError={() => setImgError(true)}
            className="w-full h-36 object-cover bg-slate-100 dark:bg-slate-800"
            loading="lazy"
          />
        ) : (
          <div className="h-24 bg-gradient-to-br from-indigo-50 via-violet-50 to-slate-50 dark:from-slate-800 dark:via-indigo-950/40 dark:to-slate-900 flex items-center justify-center">
            <span className="text-4xl opacity-30 select-none">{place.icon || '📍'}</span>
          </div>
        )}

        {/* Category badge */}
        <span className="absolute top-2 left-2 text-[10px] font-bold bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-700 dark:text-slate-200 px-2.5 py-0.5 rounded-full shadow-sm border border-white/60 dark:border-slate-800 flex items-center gap-1">
          <span>{place.icon}</span>
          <span>{place.label || place.category}</span>
        </span>

        {/* Save button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSave(place);
          }}
          title={isSaved ? 'Remove from saved' : 'Save place'}
          className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-sm shadow-sm transition-all duration-200 backdrop-blur-sm
            ${isSaved
              ? 'bg-amber-400 text-white shadow-amber-300/40'
              : 'bg-white/90 dark:bg-slate-900/90 text-slate-400 dark:text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-slate-800'}`}
        >
          {isSaved ? '★' : '☆'}
        </button>

        {place.permanentlyClosed && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center">
            <span className="text-xs font-bold text-white bg-red-600 px-3 py-1 rounded-full shadow">
              Permanently Closed
            </span>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        {/* Place title */}
        <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-snug line-clamp-2 mb-1">
          {place.name}
        </h3>

        {/* Rating row */}
        {place.rating ? (
          <div className="flex items-center gap-2 mb-1.5">
            <RatingStars rating={place.rating} count={place.userRatingsTotal} />
            {place.priceLevel > 0 && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-auto font-medium">
                {PRICE[place.priceLevel]}
              </span>
            )}
          </div>
        ) : null}

        {/* Address */}
        <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed line-clamp-2 mb-2.5">
          {place.address}
        </p>

        {/* Status + distance chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {place.distance !== undefined && (
            <span className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium">
              📍 {place.distance.toFixed(1)} km
            </span>
          )}
          {place.openNow !== null && !place.permanentlyClosed && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold
                ${place.openNow
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40'
                  : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40'}`}
            >
              {place.openNow ? '🟢 Open now' : '🔴 Closed'}
            </span>
          )}
        </div>

        {/* Expanded section */}
        {expanded && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5 mb-3">
            {detailLoading && <div className="skeleton h-14 rounded-xl" />}
            {d?.error && (
              <p className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900">
                {d.error}
              </p>
            )}
            {d && !d.error && (
              <>
                {!place.phone && d.phone && (
                  <div className="flex gap-2">
                    <a
                      href={`tel:${d.phone}`}
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                    >
                      📞 {d.phone}
                    </a>
                    <a
                      href={`https://wa.me/${d.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                    >
                      💬 WhatsApp
                    </a>
                  </div>
                )}
                {!place.website && d.website && (
                  <a
                    href={d.website}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="block text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate font-medium"
                  >
                    🌐 {d.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {d.openingHours && (
                  <details className="text-xs cursor-pointer group" onClick={e => e.stopPropagation()}>
                    <summary className="font-semibold text-slate-700 dark:text-slate-300 group-open:text-indigo-600 dark:group-open:text-indigo-400 transition-colors select-none">
                      🕐 Opening Hours
                    </summary>
                    <ul className="mt-1.5 ml-4 space-y-0.5 text-slate-500 dark:text-slate-400">
                      {d.openingHours.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {d.reviews?.length > 0 && (
                  <div className="space-y-1.5">
                    {d.reviews.map((r, i) => (
                      <div
                        key={i}
                        className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-amber-400 text-[10px]">
                            {'★'.repeat(r.rating)}
                            {'☆'.repeat(5 - r.rating)}
                          </span>
                          <span className="text-slate-400 dark:text-slate-500">· {r.author} · {r.time}</span>
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
        <div className="flex gap-1.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <a
            href={place.gmapsLink}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex-1 text-center text-xs font-semibold py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors border border-indigo-100 dark:border-indigo-900/40"
          >
            🗺️ Directions
          </a>
          <button
            onClick={handleToggle}
            className={`flex-1 text-xs font-semibold py-2 rounded-xl transition-colors
              ${expanded
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
          >
            {detailLoading ? '⏳' : expanded ? 'Less ▲' : 'Details ▼'}
          </button>
          <button
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy maps link'}
            className={`px-2.5 rounded-xl transition-colors text-xs font-medium border
              ${copied
                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 border-emerald-200 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-700'}`}
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>
      </div>
    </div>
  );
}
