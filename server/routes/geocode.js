const express = require('express');
const axios = require('axios');
const router = express.Router();
const cache = require('../utils/redisCache');

const USE_FSQ = () => process.env.PLACES_PROVIDER === 'foursquare';

// ─── Nominatim (free, used when PLACES_PROVIDER=foursquare) ────────────────────
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const NOM_HEADERS = { 'User-Agent': 'PincodeExplorer/1.0 (personal-project)' };

async function geocodeNominatim(pincode) {
  const response = await axios.get(`${NOMINATIM}/search`, {
    headers: NOM_HEADERS,
    params: { postalcode: pincode, countrycodes: 'in', format: 'json', addressdetails: 1, limit: 1 },
  });
  if (!response.data.length) throw Object.assign(new Error('PIN code not found'), { status: 404 });

  const result = response.data[0];
  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);
  const addr = result.address || {};

  const bb = result.boundingbox; // [south, north, west, east]
  const dLat = (parseFloat(bb[1]) - lat) * Math.PI / 180;
  const dLng = (parseFloat(bb[3]) - lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat * Math.PI / 180) * Math.cos(parseFloat(bb[1]) * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const distToCorner = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const suggestedRadius = Math.max(1000, Math.min(25000, Math.round(distToCorner / 500) * 500));

  return {
    lat, lng, pincode,
    locality: addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city_district || addr.city || null,
    district: addr.county || addr.state_district || null,
    state: addr.state || null,
    formattedAddress: result.display_name,
    suggestedRadius,
  };
}

// ─── Google Geocoding (default) ────────────────────────────────────────────────
async function geocodeGoogle(pincode) {
  const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
    params: {
      address: `${pincode}, India`,
      components: `country:IN|postal_code:${pincode}`,
      key: process.env.GOOGLE_SERVER_API_KEY,
    },
  });
  if (response.data.status !== 'OK') throw Object.assign(new Error(`PIN code not found (${response.data.status})`), { status: 404 });

  const result = response.data.results[0];
  const { lat, lng } = result.geometry.location;
  const components = result.address_components;
  const get = (type) => components.find(c => c.types.includes(type))?.long_name || null;

  const vp = result.geometry.viewport;
  const dLat = (vp.northeast.lat - lat) * Math.PI / 180;
  const dLng = (vp.northeast.lng - lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat * Math.PI / 180) * Math.cos(vp.northeast.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const distToCorner = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const suggestedRadius = Math.max(1000, Math.min(25000, Math.round(distToCorner / 500) * 500));

  return {
    lat, lng, pincode,
    locality: get('locality') || get('sublocality') || get('administrative_area_level_3'),
    district: get('administrative_area_level_3') || get('administrative_area_level_2'),
    state: get('administrative_area_level_1'),
    formattedAddress: result.formatted_address,
    suggestedRadius,
  };
}

// ─── Routes ────────────────────────────────────────────────────────────────────
router.get('/:pincode', async (req, res) => {
  const { pincode } = req.params;
  if (!/^[1-9][0-9]{5}$/.test(pincode)) {
    return res.status(400).json({ error: 'Invalid PIN code. Must be 6 digits starting with 1-9.' });
  }

  const cacheKey = `geo:${pincode}`;
  try {
    const cached = await cache.get(cacheKey);
    if (cached) { console.log(`[Cache] Hit for PIN: ${pincode}`); return res.json(cached); }

    const data = USE_FSQ() ? await geocodeNominatim(pincode) : await geocodeGoogle(pincode);
    await cache.set(cacheKey, data, 30 * 24 * 60 * 60);
    res.json(data);
  } catch (err) {
    console.error('[geocode]', err.message);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Geocoding failed.' });
  }
});

router.get('/reverse/lookup', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });

  const latKey = parseFloat(lat).toFixed(4);
  const lngKey = parseFloat(lng).toFixed(4);
  const cacheKey = `geo:reverse:${latKey}:${lngKey}`;

  try {
    const cached = await cache.get(cacheKey);
    if (cached) { console.log(`[Cache] Hit for reverse: ${latKey},${lngKey}`); return res.json(cached); }

    let pincode, formattedAddress;

    if (USE_FSQ()) {
      const r = await axios.get(`${NOMINATIM}/reverse`, {
        headers: NOM_HEADERS,
        params: { lat, lon: lng, format: 'json', addressdetails: 1, zoom: 16 },
      });
      pincode = r.data?.address?.postcode;
      formattedAddress = r.data?.display_name;
    } else {
      const r = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: { latlng: `${lat},${lng}`, result_type: 'postal_code', key: process.env.GOOGLE_SERVER_API_KEY },
      });
      if (r.data.status !== 'OK' || !r.data.results.length) throw new Error('Not found');
      const result = r.data.results[0];
      pincode = result.address_components.find(c => c.types.includes('postal_code'))?.long_name;
      formattedAddress = result.formatted_address;
    }

    if (!pincode || !/^[1-9][0-9]{5}$/.test(pincode)) {
      return res.status(404).json({ error: 'No valid Indian PIN code found at this location' });
    }

    const data = { pincode, formattedAddress };
    await cache.set(cacheKey, data, 30 * 24 * 60 * 60);
    res.json(data);
  } catch (err) {
    console.error('[reverse-geocode]', err.message);
    res.status(500).json({ error: 'Reverse geocoding failed.' });
  }
});

module.exports = router;
