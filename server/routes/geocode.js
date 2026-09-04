const express = require('express');
const axios = require('axios');
const router = express.Router();
const cache = require('../utils/cache');
const { searchPostalDirectory } = require('../utils/indianPostalIndex');

const USE_FSQ = () => process.env.PLACES_PROVIDER === 'foursquare';

// Prefer IPv4 for Google calls — prevents TCP connection reset on dual-stack networks
const gAxios = axios.create({ family: 4, timeout: 10000 });

// ─── Nominatim (free, used when PLACES_PROVIDER=foursquare) ────────────────────
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const NOM_HEADERS = { 'User-Agent': 'PincodeExplorer/1.0 (personal-project)' };

async function geocodeNominatim(query, isPincode = true) {
  const params = isPincode
    ? { postalcode: query, countrycodes: 'in', format: 'json', addressdetails: 1, limit: 1 }
    : { q: `${query}, India`, countrycodes: 'in', format: 'json', addressdetails: 1, limit: 1 };

  const response = await axios.get(`${NOMINATIM}/search`, {
    headers: NOM_HEADERS,
    params,
  });
  if (!response.data.length) throw Object.assign(new Error('Location not found in India'), { status: 404 });

  const result = response.data[0];
  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);
  const addr = result.address || {};
  const pincode = addr.postcode ? addr.postcode.replace(/\D/g, '').slice(0, 6) : null;

  const bb = result.boundingbox; // [south, north, west, east]
  let suggestedRadius = 5000;
  if (bb && bb.length === 4) {
    const dLat = (parseFloat(bb[1]) - lat) * Math.PI / 180;
    const dLng = (parseFloat(bb[3]) - lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat * Math.PI / 180) * Math.cos(parseFloat(bb[1]) * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const distToCorner = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    suggestedRadius = Math.max(1000, Math.min(25000, Math.round(distToCorner / 500) * 500));
  }

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
async function geocodeGoogle(query, isPincode = true) {
  const params = {
    key: process.env.GOOGLE_SERVER_API_KEY,
  };

  if (isPincode) {
    params.address = `${query}, India`;
    params.components = `country:IN|postal_code:${query}`;
  } else {
    params.address = `${query}, India`;
    params.components = 'country:IN';
  }

  const response = await gAxios.get('https://maps.googleapis.com/maps/api/geocode/json', { params });
  if (response.data.status !== 'OK' || !response.data.results.length) {
    throw Object.assign(new Error(`Location not found (${response.data.status})`), { status: 404 });
  }

  const result = response.data.results[0];
  const { lat, lng } = result.geometry.location;
  const components = result.address_components || [];
  const get = (type) => components.find(c => c.types.includes(type))?.long_name || null;

  let pincode = get('postal_code');

  // If initial geocode didn't return a direct postal code, reverse geocode coordinates to find PIN
  if (!pincode || !/^[1-9][0-9]{5}$/.test(pincode)) {
    try {
      const rev = await gAxios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          latlng: `${lat},${lng}`,
          result_type: 'postal_code',
          key: process.env.GOOGLE_SERVER_API_KEY,
        },
      });
      if (rev.data.status === 'OK' && rev.data.results.length) {
        pincode = rev.data.results[0].address_components?.find(c => c.types.includes('postal_code'))?.long_name;
      }
    } catch {
      // Fallback
    }
  }

  const vp = result.geometry.viewport;
  let suggestedRadius = 5000;
  if (vp && vp.northeast) {
    const dLat = (vp.northeast.lat - lat) * Math.PI / 180;
    const dLng = (vp.northeast.lng - lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat * Math.PI / 180) * Math.cos(vp.northeast.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const distToCorner = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    suggestedRadius = Math.max(1000, Math.min(25000, Math.round(distToCorner / 500) * 500));
  }

  return {
    lat, lng, pincode,
    locality: get('locality') || get('sublocality') || get('sublocality_level_1') || get('administrative_area_level_3'),
    district: get('administrative_area_level_3') || get('administrative_area_level_2'),
    state: get('administrative_area_level_1'),
    formattedAddress: result.formatted_address,
    suggestedRadius,
  };
}

// ─── Static Routes (Placed before /:pincode) ───────────────────────────────────

// Autocomplete suggestions (Local database + dynamic Google Autocomplete)
router.get('/suggest', async (req, res) => {
  const query = req.query.q || '';
  if (!query || query.trim().length < 2) {
    return res.json({ suggestions: [] });
  }

  const q = query.trim();
  const localMatches = searchPostalDirectory(q, 8);

  // If we already have strong local matches or query is numeric digits, return immediately
  if (localMatches.length >= 4 || /^\d+$/.test(q)) {
    return res.json({ suggestions: localMatches });
  }

  // If textual and Google Places API key available, query Google Places Autocomplete for extra accuracy
  if (process.env.GOOGLE_SERVER_API_KEY && q.length >= 3) {
    const cacheKey = `geo:suggest:${q.toLowerCase()}`;
    try {
      const cached = await cache.get(cacheKey);
      if (cached) return res.json(cached);

      const resp = await gAxios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
        params: {
          input: q,
          components: 'country:in',
          types: 'geocode',
          key: process.env.GOOGLE_SERVER_API_KEY,
        },
      });

      const googleItems = (resp.data.predictions || []).slice(0, 5).map(p => ({
        name: p.structured_formatting?.main_text || p.description,
        locality: p.structured_formatting?.secondary_text || '',
        state: '',
        pincode: '',
        placeId: p.place_id,
        isGooglePrediction: true,
      }));

      // Combine local matches and Google predictions
      const combined = [...localMatches];
      for (const g of googleItems) {
        if (!combined.some(c => c.name.toLowerCase() === g.name.toLowerCase())) {
          combined.push(g);
        }
      }

      const result = { suggestions: combined.slice(0, 8) };
      await cache.set(cacheKey, result, 7 * 24 * 60 * 60);
      return res.json(result);
    } catch {
      // Fall back to local matches
    }
  }

  return res.json({ suggestions: localMatches });
});

// Search by free-text area/landmark/locality
router.get('/search/locality', async (req, res) => {
  const query = req.query.q;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  const q = query.trim();
  // If query is an exact 6-digit PIN code, handle accordingly
  if (/^[1-9][0-9]{5}$/.test(q)) {
    const cacheKey = `geo:${q}`;
    try {
      const cached = await cache.get(cacheKey);
      if (cached) return res.json(cached);
      const data = USE_FSQ() ? await geocodeNominatim(q, true) : await geocodeGoogle(q, true);
      await cache.set(cacheKey, data, 30 * 24 * 60 * 60);
      return res.json(data);
    } catch (err) {
      return res.status(404).json({ error: err.message || 'PIN code not found.' });
    }
  }

  const cacheKey = `geo:locality:${q.toLowerCase()}`;
  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      console.log(`[Cache] Hit for locality: ${q}`);
      return res.json(cached);
    }

    const data = USE_FSQ() ? await geocodeNominatim(q, false) : await geocodeGoogle(q, false);
    await cache.set(cacheKey, data, 30 * 24 * 60 * 60);
    res.json(data);
  } catch (err) {
    console.error('[locality-geocode]', err.message);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Area not found. Try a nearby landmark or 6-digit PIN.' });
  }
});

// Reverse geocoding (GPS Lat/Lng -> PIN)
router.get('/reverse/lookup', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });

  const latKey = parseFloat(lat).toFixed(4);
  const lngKey = parseFloat(lng).toFixed(4);
  const cacheKey = `geo:reverse:${latKey}:${lngKey}`;

  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      console.log(`[Cache] Hit for reverse: ${latKey},${lngKey}`);
      return res.json(cached);
    }

    let pincode, formattedAddress;

    if (USE_FSQ()) {
      const r = await axios.get(`${NOMINATIM}/reverse`, {
        headers: NOM_HEADERS,
        params: { lat, lon: lng, format: 'json', addressdetails: 1, zoom: 16 },
      });
      pincode = r.data?.address?.postcode;
      formattedAddress = r.data?.display_name;
    } else {
      const r = await gAxios.get('https://maps.googleapis.com/maps/api/geocode/json', {
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

// Direct PIN code lookup
router.get('/:pincode', async (req, res) => {
  const { pincode } = req.params;
  if (!/^[1-9][0-9]{5}$/.test(pincode)) {
    return res.status(400).json({ error: 'Invalid PIN code. Must be 6 digits starting with 1-9.' });
  }

  const cacheKey = `geo:${pincode}`;
  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      console.log(`[Cache] Hit for PIN: ${pincode}`);
      return res.json(cached);
    }

    const data = USE_FSQ() ? await geocodeNominatim(pincode, true) : await geocodeGoogle(pincode, true);
    await cache.set(cacheKey, data, 30 * 24 * 60 * 60);
    res.json(data);
  } catch (err) {
    console.error('[geocode]', err.message);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Geocoding failed.' });
  }
});

module.exports = router;
