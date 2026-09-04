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
  html: '<div style="width:16px;height:16px;background:#4F46E5;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function createPlaceIcon(icon, isActive, isHovered) {
  const bgClass = isActive
    ? 'bg-indigo-600 text-white scale-125 ring-4 ring-indigo-400/50 shadow-xl'
    : isHovered
    ? 'bg-indigo-500 text-white scale-110 ring-2 ring-indigo-300 shadow-lg'
    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-md border border-slate-200 dark:border-slate-700';

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

// Controller to smoothly pan/zoom and resize
function MapResizerAndController({ center, selectedPlace }) {
  const map = useMap();
  const prevCenter = useRef(null);

  // Invalidate size on mount and window resize so map container never collapses
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 600);

    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', onResize);
    };
  }, [map]);

  // Recenter when centroid changes
  useEffect(() => {
    if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') return;
    const key = `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;
    if (prevCenter.current && key !== prevCenter.current) {
      map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
    }
    prevCenter.current = key;
  }, [center, map]);

  // Pan to selected place
  useEffect(() => {
    if (selectedPlace && typeof selectedPlace.lat === 'number' && typeof selectedPlace.lng === 'number') {
      map.panTo([selectedPlace.lat, selectedPlace.lng], { animate: true, duration: 0.5 });
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
  height = 'calc(100vh - 8rem)',
  hideRadiusSlider = false,
}) {
  const isDark = theme === 'dark';
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  // Sanitize valid places
  const validPlaces = places.filter(
    p => p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)
  );

  const selectedPlace = validPlaces.find(p => p.placeId === activePlaceId);

  const safeCenter = center && typeof center.lat === 'number' && typeof center.lng === 'number'
    ? center
    : { lat: 20.5937, lng: 78.9629 };

  return (
    <div
      className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-md flex flex-col bg-white dark:bg-slate-900 transition-colors duration-200 relative"
      style={{ height, minHeight: '460px' }}
    >
      {/* Top map info badge */}
      <div className="absolute top-3 left-3 z-[1000] bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-sm flex items-center gap-1.5 pointer-events-none select-none">
        <span>🗺️</span>
        <span>{validPlaces.length} places on map</span>
      </div>

      {/* Main Map Canvas */}
      <div className="flex-1 w-full relative" style={{ minHeight: '380px' }}>
        <MapContainer
          center={[safeCenter.lat, safeCenter.lng]}
          zoom={13}
          style={{ width: '100%', height: '100%', minHeight: '380px' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            key={theme}
            subdomains="abcd"
            maxZoom={19}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
            url={tileUrl}
          />

          <MapResizerAndController center={safeCenter} selectedPlace={selectedPlace} />

          {/* Search radius circle */}
          <Circle
            center={[safeCenter.lat, safeCenter.lng]}
            radius={radius}
            pathOptions={{
              color: isDark ? '#818CF8' : '#4F46E5',
              fillColor: isDark ? '#818CF8' : '#4F46E5',
              fillOpacity: isDark ? 0.08 : 0.06,
              weight: 2,
              dashArray: '6 6',
            }}
          />

          {/* Centroid Pin */}
          <Marker position={[safeCenter.lat, safeCenter.lng]} icon={centerIcon}>
            <Popup>
              <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 py-0.5">
                📍 Search Centroid ({safeCenter.lat.toFixed(4)}, {safeCenter.lng.toFixed(4)})
              </div>
            </Popup>
          </Marker>

          {/* Place Markers */}
          {validPlaces.map(place => {
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
                      <span>{place.icon || '📍'}</span>
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

      {/* Radius slider toolbar at bottom */}
      {!hideRadiusSlider && onRadiusChange && (
        <div className="bg-white/95 dark:bg-slate-900/95 px-4 py-3 flex items-center gap-3 border-t border-slate-100 dark:border-slate-800 transition-colors shrink-0">
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
