const express = require('express');
const axios = require('axios');
const router = express.Router();
const CATEGORY_MAP = require('../utils/categoryMap');
const cache = require('../utils/redisCache');

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

// ─── Nearby Search ─────────────────────────────────────────────────────────────
router.get('/nearby', async (req, res) => {
  const { lat, lng, radius = 5000, category = 'all' } = req.query;

  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });

  // Use 3 decimal places (~110 meters) to group nearby search coordinates for better cache hits
  const latKey = parseFloat(lat).toFixed(3);
  const lngKey = parseFloat(lng).toFixed(3);
  const cacheKey = `nearby:${latKey}:${lngKey}:${radius}:${category}`;

  try {
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      console.log(`[Cache] Hit for nearby search: ${cacheKey}`);
      return res.json(cachedData);
    }

    const placeType = CATEGORY_MAP[category]?.type;
    const params = {
      location: `${lat},${lng}`,
      radius: Math.min(Number(radius), 50000), // max 50km
      key: process.env.GOOGLE_SERVER_API_KEY,
    };
    if (placeType) params.type = placeType;

    const response = await axios.get(`${PLACES_BASE}/nearbysearch/json`, { params });

    if (response.data.status === 'REQUEST_DENIED') {
      return res.status(403).json({ error: 'API key invalid or Places API not enabled' });
    }
    if (response.data.status === 'ZERO_RESULTS') {
      const emptyResult = { places: [], total: 0, category };
      await cache.set(cacheKey, emptyResult, 24 * 60 * 60);
      return res.json(emptyResult);
    }

    const meta = CATEGORY_MAP[category] || { icon: '📍', label: category };

    const places = response.data.results.map(p => ({
      placeId: p.place_id,
      name: p.name,
      lat: p.geometry.location.lat,
      lng: p.geometry.location.lng,
      address: p.vicinity || 'Address not available',
      rating: p.rating || null,
      userRatingsTotal: p.user_ratings_total || 0,
      priceLevel: p.price_level ?? null,
      openNow: p.opening_hours?.open_now ?? null,
      permanentlyClosed: p.permanently_closed || false,
      photoRef: p.photos?.[0]?.photo_reference || null,
      category,
      icon: meta.icon,
      label: meta.label,
      gmapsLink: `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
      // Details loaded lazily on demand
      phone: null,
      website: null,
      hasWebsite: false,
      hasPhone: false,
      detailsLoaded: false,
    }));

    const responseData = { places, total: places.length, category };

    // Cache nearby search for 24 hours
    await cache.set(cacheKey, responseData, 24 * 60 * 60);

    res.json(responseData);
  } catch (err) {
    console.error('[nearby]', err.message);
    res.status(500).json({ error: 'Nearby search failed' });
  }
});

// ─── Place Details (called on-demand when user clicks a card) ──────────────────
router.get('/details/:placeId', async (req, res) => {
  const { placeId } = req.params;
  const cacheKey = `details:${placeId}`;

  try {
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      console.log(`[Cache] Hit for place details: ${placeId}`);
      return res.json(cachedData);
    }

    const response = await axios.get(`${PLACES_BASE}/details/json`, {
      params: {
        place_id: placeId,
        fields: [
          'name',
          'formatted_address',
          'formatted_phone_number',
          'international_phone_number',
          'website',
          'opening_hours',
          'rating',
          'user_ratings_total',
          'reviews',
          'photos',
          'price_level',
          'url',
          'business_status',
        ].join(','),
        key: process.env.GOOGLE_SERVER_API_KEY,
      },
    });

    if (response.data.status !== 'OK') {
      console.error('[details] Google API error:', response.data.status, response.data.error_message || '');
      const hint = response.data.status === 'REQUEST_DENIED'
        ? 'Check that Places API is enabled in Google Cloud and the server API key is correct.'
        : '';
      return res.status(400).json({
        error: `Google API error: ${response.data.status}. ${hint}`.trim(),
        status: response.data.status,
      });
    }

    const p = response.data.result;
    const phone = p.formatted_phone_number || p.international_phone_number || null;

    const responseData = {
      placeId,
      phone,
      website: p.website || null,
      hasWebsite: !!p.website,
      hasPhone: !!phone,
      address: p.formatted_address,
      openingHours: p.opening_hours?.weekday_text || null,
      openNow: p.opening_hours?.open_now ?? null,
      rating: p.rating || null,
      userRatingsTotal: p.user_ratings_total || 0,
      reviews: (p.reviews || []).slice(0, 2).map(r => ({
        text: r.text?.slice(0, 150) || '',
        rating: r.rating,
        author: r.author_name,
        time: r.relative_time_description,
      })),
      photoRefs: (p.photos || []).slice(0, 4).map(ph => ph.photo_reference),
      gmapsLink: p.url || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
      permanentlyClosed: p.business_status === 'CLOSED_PERMANENTLY',
      detailsLoaded: true,
    };

    // Cache place details for 7 days
    await cache.set(cacheKey, responseData, 7 * 24 * 60 * 60);

    res.json(responseData);
  } catch (err) {
    console.error('[details]', err.message);
    res.status(500).json({ error: 'Place details fetch failed' });
  }
});

// ─── Photo Proxy (keeps API key server-side) ────────────────────────────────────
router.get('/photo', async (req, res) => {
  const { ref, width = 600 } = req.query;
  if (!ref) return res.status(400).json({ error: 'ref is required' });

  try {
    const response = await axios.get(`${PLACES_BASE}/photo`, {
      params: {
        maxwidth: width,
        photo_reference: ref,
        key: process.env.GOOGLE_SERVER_API_KEY,
      },
      responseType: 'stream',
    });
    response.data.pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Photo fetch failed' });
  }
});

module.exports = router;
