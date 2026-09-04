import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon paths broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const centerIcon = L.divIcon({
  className: '',
  html: '<div class="w-4 h-4 bg-indigo-600 dark:bg-indigo-400 border-2 border-white dark:border-slate-900 rounded-full shadow-lg ring-4 ring-indigo-500/20"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function createPlaceIcon(icon, isActive, isHovered) {
  const isSpecial = isActive || isHovered;
  const bgClass = isActive
    ? 'bg-indigo-600 text-white scale-125 ring-4 ring-indigo-400/40 shadow-xl'
    : isHovered
    ? 'bg-indigo-500 text-white scale-110 ring-2 ring-indigo-300/60 shadow-lg'
    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-md border border-slate-200/80 dark:border-slate-700';

  const rippleHtml = isActive ? '<span class="marker-ripple"></span>' : '';

  return L.divIcon({
    className: '',
    html: `
      <div class="relative flex items-center justify-center cursor-pointer select-none">
        ${rippleHtml}
        <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-transform duration-200 ${bgClass}">
          ${icon || '📍'}
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

// Controller to smoothly pan/zoom when center or selected place changes
function MapController({ center, selectedPlace }) {
  const map = useMap();
  const prevCenter = useRef(null);

  useEffect(() => {
    const key = `${center.lat},${center.lng}`;
    if (key !== prevCenter.current) {
      map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
      prevCenter.current = key;
    }
  }, [center.lat, center.lng, map]);

  useEffect(() => {
    if (selectedPlace && selectedPlace.lat && selectedPlace.lng) {
      map.panTo([selectedPlace.lat, selectedPlace.lng], { animate: true, duration: 0.6 });
    }
  }, [selectedPlace, map]);

  return null;
}

export default function MapView({
  center,
  radius,
  places = [],
  onRadiusChange,
  theme = 'light',
  activePlaceId = null,
  hoveredPlaceId = null,
  onSelectPlace,
  height = '480px',
  hideRadiusSlider = false,
}) {
  const isDark = theme === 'dark';
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  const selectedPlace = places.find(p => p.placeId === activePlaceId);

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col bg-white dark:bg-slate-900 transition-colors duration-200">
      <div className="relative flex-1" style={{ height }}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={13}
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            key={theme} // Force re-render tile layer upon theme switch
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
            url={tileUrl}
          />

          <MapController center={center} selectedPlace={selectedPlace} />

          {/* Search radius circle */}
          <Circle
            center={[center.lat, center.lng]}
            radius={radius}
            pathOptions={{
              color: isDark ? '#818CF8' : '#4F46E5',
              fillColor: isDark ? '#818CF8' : '#4F46E5',
              fillOpacity: isDark ? 0.08 : 0.06,
              weight: 2,
              dashArray: '6 6',
            }}
          />

          {/* Center pinpoint */}
          <Marker position={[center.lat, center.lng]} icon={centerIcon}>
            <Popup>
              <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 py-0.5">
                📍 Centroid: {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
              </div>
            </Popup>
          </Marker>

          {/* Place markers */}
          {places.map(place => {
            const isActive = place.placeId === activePlaceId;
            const isHovered = place.placeId === hoveredPlaceId;
            return (
              <Marker
                key={place.placeId}
                position={[place.lat, place.lng]}
                icon={createPlaceIcon(place.icon, isActive, isHovered)}
                zIndexOffset={isActive ? 1000 : isHovered ? 500 : 0}
                eventHandlers={{
                  click: () => {
                    if (onSelectPlace) onSelectPlace(place);
                  },
                }}
              >
                <Popup minWidth={220}>
                  <div className="text-sm space-y-1.5 p-0.5">
                    <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                      <span>{place.icon}</span>
                      <span>{place.label || place.category}</span>
                    </div>
                    <p className="font-bold text-slate-900 dark:text-white leading-snug text-sm">
                      {place.name}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 text-xs line-clamp-2">
                      {place.address}
                    </p>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
                      {place.rating ? (
                        <span className="text-amber-500 font-semibold flex items-center gap-1">
                          ★ {place.rating} {place.userRatingsTotal ? `(${place.userRatingsTotal})` : ''}
                        </span>
                      ) : <span />}
                      <div className="flex gap-2.5">
                        {place.website && (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                          >
                            Website
                          </a>
                        )}
                        <a
                          href={place.gmapsLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                        >
                          Directions ↗
                        </a>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Radius slider toolbar */}
      {!hideRadiusSlider && onRadiusChange && (
        <div className="bg-white/95 dark:bg-slate-900/95 px-4 py-3 flex items-center gap-3 border-t border-slate-100 dark:border-slate-800 transition-colors">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">Radius</span>
          <input
            type="range"
            min={500}
            max={20000}
            step={500}
            value={radius}
            onChange={e => onRadiusChange(Number(e.target.value))}
            className="flex-1 accent-indigo-600 dark:accent-indigo-400 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
          />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0 w-16 text-right tabular-nums">
            {radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}
          </span>
        </div>
      )}
    </div>
  );
}
