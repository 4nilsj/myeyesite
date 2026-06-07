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
  html: '<div style="width:16px;height:16px;background:#4F46E5;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function placeIcon(icon) {
  return L.divIcon({
    className: '',
    html: `<div style="font-size:20px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35))">${icon}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

// Recenter map when PIN code changes
function RecenterMap({ center }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    const key = `${center.lat},${center.lng}`;
    if (key !== prev.current) {
      map.setView([center.lat, center.lng], map.getZoom());
      prev.current = key;
    }
  }, [center.lat, center.lng, map]);
  return null;
}

export default function MapView({ center, radius, places, onRadiusChange }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        style={{ width: '100%', height: '460px' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        <RecenterMap center={center} />

        {/* Search radius circle */}
        <Circle
          center={[center.lat, center.lng]}
          radius={radius}
          pathOptions={{ color: '#4F46E5', fillColor: '#4F46E5', fillOpacity: 0.06, weight: 2, dashArray: '6 4' }}
        />

        {/* Center pin */}
        <Marker position={[center.lat, center.lng]} icon={centerIcon}>
          <Popup>
            <span className="text-xs font-semibold text-indigo-700">📍 Search centre</span>
          </Popup>
        </Marker>

        {/* Place markers */}
        {places.map(place => (
          <Marker
            key={place.placeId}
            position={[place.lat, place.lng]}
            icon={placeIcon(place.icon)}
          >
            <Popup minWidth={180}>
              <div className="text-sm space-y-1">
                <p className="font-bold text-gray-900 leading-snug">{place.name}</p>
                <p className="text-gray-500 text-xs">{place.address}</p>
                {place.rating && (
                  <p className="text-amber-500 text-xs font-semibold">★ {place.rating}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <a href={place.gmapsLink} target="_blank" rel="noreferrer"
                    className="text-xs text-indigo-600 hover:underline font-medium">
                    Open in Maps ↗
                  </a>
                  {place.website && (
                    <a href={place.website} target="_blank" rel="noreferrer"
                      className="text-xs text-indigo-600 hover:underline font-medium">
                      🌐 Website
                    </a>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Radius slider */}
      <div className="bg-white px-4 py-3 flex items-center gap-3 border-t border-slate-100">
        <span className="text-xs text-slate-500 shrink-0">Search radius</span>
        <input
          type="range"
          min={500}
          max={20000}
          step={500}
          value={radius}
          onChange={e => onRadiusChange(Number(e.target.value))}
          className="flex-1 accent-indigo-600"
        />
        <span className="text-xs font-semibold text-slate-700 shrink-0 w-16 text-right">
          {radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}
        </span>
      </div>
    </div>
  );
}
