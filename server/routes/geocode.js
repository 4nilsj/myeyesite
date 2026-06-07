const express = require('express');
const axios = require('axios');
const router = express.Router();
const cache = require('../utils/redisCache');

// PIN code → lat/lng
router.get('/:pincode', async (req, res) => {
  const { pincode } = req.params;

  if (!/^[1-9][0-9]{5}$/.test(pincode)) {
    return res.status(400).json({ error: 'Invalid PIN code. Must be 6 digits starting with 1-9.' });
  }

  const cacheKey = `geo:${pincode}`;
  try {
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      console.log(`[Cache] Hit for PIN code: ${pincode}`);
      return res.json(cachedData);
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address: `${pincode}, India`,
        components: `country:IN|postal_code:${pincode}`,
        key: process.env.GOOGLE_SERVER_API_KEY,
      },
    });

    if (response.data.status !== 'OK') {
      return res.status(404).json({ error: `PIN code not found (${response.data.status})` });
    }

    const result = response.data.results[0];
    const { lat, lng } = result.geometry.location;
    const components = result.address_components;

    const get = (type) => components.find(c => c.types.includes(type))?.long_name || null;

    const responseData = {
      lat,
      lng,
      pincode,
      locality: get('locality') || get('sublocality') || get('administrative_area_level_3'),
      district: get('administrative_area_level_3') || get('administrative_area_level_2'),
      state: get('administrative_area_level_1'),
      formattedAddress: result.formatted_address,
    };

    // Cache results for 30 days (2592000 seconds)
    await cache.set(cacheKey, responseData, 30 * 24 * 60 * 60);

    res.json(responseData);
  } catch (err) {
    console.error('[geocode]', err.message);
    res.status(500).json({ error: 'Geocoding failed. Check your API key.' });
  }
});

// lat/lng → PIN code (for "Near Me" feature)
router.get('/reverse/lookup', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });

  // Use 4 decimal places for precision (~11 meters) to allow high cache hit rate for nearby checks
  const latKey = parseFloat(lat).toFixed(4);
  const lngKey = parseFloat(lng).toFixed(4);
  const cacheKey = `geo:reverse:${latKey}:${lngKey}`;

  try {
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      console.log(`[Cache] Hit for reverse geocode: ${latKey}, ${lngKey}`);
      return res.json(cachedData);
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        latlng: `${lat},${lng}`,
        result_type: 'postal_code',
        key: process.env.GOOGLE_SERVER_API_KEY,
      },
    });

    if (response.data.status !== 'OK' || !response.data.results.length) {
      return res.status(404).json({ error: 'Could not determine PIN code for this location' });
    }

    const result = response.data.results[0];
    const pinComponent = result.address_components.find(c => c.types.includes('postal_code'));
    const pincode = pinComponent?.long_name;

    if (!pincode || !/^[1-9][0-9]{5}$/.test(pincode)) {
      return res.status(404).json({ error: 'No valid Indian PIN code found at this location' });
    }

    const responseData = { pincode, formattedAddress: result.formatted_address };

    // Cache results for 30 days
    await cache.set(cacheKey, responseData, 30 * 24 * 60 * 60);

    res.json(responseData);
  } catch (err) {
    console.error('[reverse-geocode]', err.message);
    res.status(500).json({ error: 'Reverse geocoding failed' });
  }
});

module.exports = router;
