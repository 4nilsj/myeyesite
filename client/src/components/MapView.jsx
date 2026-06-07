import { useState, useRef, useCallback } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Circle,
  InfoWindow,
  DirectionsRenderer,
} from '@react-google-maps/api';

const LIBRARIES = ['places'];
const MAP_STYLES = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] }, // hide default POI clutter
];

export default function MapView({ center, radius, places, onRadiusChange }) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  });

  const [selected, setSelected] = useState(null);
  const [directions, setDirections] = useState(null);
  const mapRef = useRef(null);

  const getDirections = useCallback((dest) => {
    setDirections(null);
    const svc = new window.google.maps.DirectionsService();
    svc.route(
      {
        origin: new window.google.maps.LatLng(center.lat, center.lng),
        destination: new window.google.maps.LatLng(dest.lat, dest.lng),
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK') setDirections(result);
      }
    );
  }, [center]);

  if (loadError) return (
    <div className="h-96 bg-red-50 rounded-2xl flex items-center justify-center text-red-500">
      Map failed to load. Check your browser API key.
    </div>
  );

  if (!isLoaded) return (
    <div className="h-96 bg-gray-100 rounded-2xl skeleton" />
  );

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '460px' }}
        center={center}
        zoom={13}
        onLoad={map => { mapRef.current = map; }}
        options={{
          styles: MAP_STYLES,
          streetViewControl: true,
          fullscreenControl: true,
          mapTypeControl: false,
          zoomControlOptions: {
            position: window.google.maps.ControlPosition.RIGHT_CENTER,
          },
        }}
      >
        {/* Search radius circle — editable so user can drag to resize */}
        <Circle
          center={center}
          radius={radius}
          options={{
            strokeColor: '#3B82F6',
            strokeOpacity: 0.7,
            strokeWeight: 2,
            fillColor: '#3B82F6',
            fillOpacity: 0.05,
            editable: true,
          }}
          onRadiusChanged={function () {
            if (typeof this.getRadius === 'function') {
              onRadiusChange(Math.round(this.getRadius()));
            }
          }}
        />

        {/* Center pin */}
        <Marker
          position={center}
          icon={{
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="%233B82F6"><circle cx="12" cy="12" r="8" fill="%233B82F6" stroke="white" stroke-width="2"/></svg>'
            ),
            scaledSize: { width: 24, height: 24 },
          }}
          title="PIN code center"
        />

        {/* Place markers */}
        {places.map(place => (
          <Marker
            key={place.placeId}
            position={{ lat: place.lat, lng: place.lng }}
            label={{ text: place.icon, fontSize: '18px' }}
            onClick={() => setSelected(place)}
          />
        ))}

        {/* Info window */}
        {selected && (
          <InfoWindow
            position={{ lat: selected.lat, lng: selected.lng }}
            onCloseClick={() => setSelected(null)}
          >
            <div className="text-sm max-w-[200px]">
              <p className="font-bold text-gray-900">{selected.name}</p>
              <p className="text-gray-500 text-xs mt-0.5">{selected.address}</p>
              {selected.rating && (
                <p className="text-yellow-500 text-xs mt-1">★ {selected.rating}</p>
              )}
              <div className="flex gap-2 mt-2">
                <a
                  href={selected.gmapsLink}
                  target="_blank" rel="noreferrer"
                  className="text-blue-600 text-xs hover:underline"
                >
                  Open Maps ↗
                </a>
                <button
                  onClick={() => getDirections(selected)}
                  className="text-green-600 text-xs hover:underline"
                >
                  Directions
                </button>
              </div>
            </div>
          </InfoWindow>
        )}

        {/* Directions overlay */}
        {directions && (
          <DirectionsRenderer
            directions={directions}
            options={{ suppressMarkers: true }}
          />
        )}
      </GoogleMap>

      {/* Radius control below map */}
      <div className="bg-white px-4 py-3 flex items-center gap-3 border-t border-gray-100">
        <span className="text-xs text-gray-500 shrink-0">Search radius</span>
        <input
          type="range"
          min={500}
          max={20000}
          step={500}
          value={radius}
          onChange={e => onRadiusChange(Number(e.target.value))}
          className="flex-1 accent-blue-600"
        />
        <span className="text-xs font-semibold text-gray-700 shrink-0 w-16 text-right">
          {radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}
        </span>
      </div>
    </div>
  );
}
