const express = require('express');
const axios = require('axios');
const router = express.Router();
const CATEGORY_MAP = require('../utils/categoryMap');
const cache = require('../utils/cache');
const { searchLimiter, detailLimiter } = require('../middleware/rateLimit');

const USE_FSQ = () => process.env.PLACES_PROVIDER === 'foursquare';

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';
const FSQ_BASE    = 'https://api.foursquare.com/v3';

// Use IPv4 for all outbound API calls — prevents "connection reset by peer" on
// dual-stack networks where Google sometimes drops the IPv6 stream mid-transfer.
const gAxios = axios.create({ family: 4, timeout: 15000 });

const fsqHeaders = () => ({ Authorization: process.env.FOURSQUARE_API_KEY, Accept: 'application/json' });
const normalizeRating = (r) => r ? parseFloat((r / 2).toFixed(1)) : null;

// ═══════════════════════════════════════════════════════════════════════════════
// NEARBY SEARCH
// ═══════════════════════════════════════════════════════════════════════════════

async function nearbyGoogle(lat, lng, radius, category) {
  const meta = CATEGORY_MAP[category];
  const params = {
    location: `${lat},${lng}`,
    radius: Math.min(Number(radius), 50000),
    key: process.env.GOOGLE_SERVER_API_KEY,
  };
  if (meta.type) params.type = meta.type;

  const response = await gAxios.get(`${PLACES_BASE}/nearbysearch/json`, { params });
  if (response.data.status === 'REQUEST_DENIED') throw Object.assign(new Error('API key invalid or Places API not enabled'), { code: 403 });
  if (response.data.status === 'ZERO_RESULTS') return [];

  let rawResults = [...response.data.results];
  let nextPageToken = response.data.next_page_token;

  while (nextPageToken && rawResults.length < 60) {
    await new Promise(r => setTimeout(r, 2000));
    const pageResp = await gAxios.get(`${PLACES_BASE}/nearbysearch/json`, {
      params: { pagetoken: nextPageToken, key: process.env.GOOGLE_SERVER_API_KEY },
    });
    if (pageResp.data.status !== 'OK') break;
    rawResults = rawResults.concat(pageResp.data.results || []);
    nextPageToken = pageResp.data.next_page_token;
  }

  return rawResults.map(p => ({
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
    phone: null, website: null, hasWebsite: false, hasPhone: false, detailsLoaded: false,
  }));
}

async function nearbyFoursquare(lat, lng, radius, category) {
  const meta = CATEGORY_MAP[category];
  const response = await axios.get(`${FSQ_BASE}/places/search`, {
    headers: fsqHeaders(),
    params: {
      ll: `${lat},${lng}`,
      radius: Math.min(Number(radius), 50000),
      categories: meta.fsqId,
      limit: 50,
      fields: 'fsq_id,name,location,geocodes,categories,distance,photos,rating,stats',
    },
  });

  return (response.data.results || [])
    .filter(p => p.geocodes?.main)
    .map(p => {
      const photo = p.photos?.[0];
      const coords = p.geocodes.main;
      return {
        placeId: p.fsq_id,
        name: p.name,
        lat: coords.latitude,
        lng: coords.longitude,
        address: p.location?.formatted_address || p.location?.address || 'Address not available',
        rating: normalizeRating(p.rating),
        userRatingsTotal: p.stats?.total_ratings || 0,
        priceLevel: null,
        openNow: null,
        permanentlyClosed: false,
        photoRef: photo ? `${photo.prefix}400x300${photo.suffix}` : null,
        category,
        icon: meta.icon,
        label: meta.label,
        gmapsLink: `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`,
        phone: null, website: null, hasWebsite: false, hasPhone: false, detailsLoaded: false,
      };
    });
}

router.get('/nearby', searchLimiter, async (req, res) => {
  const { lat, lng, radius = 5000, category = 'all' } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });
  if (!CATEGORY_MAP[category]) return res.status(400).json({ error: `Unknown category: ${category}` });

  const latKey = parseFloat(lat).toFixed(3);
  const lngKey = parseFloat(lng).toFixed(3);
  const provider = USE_FSQ() ? 'fsq' : 'g';
  const cacheKey = `${provider}:nearby:${latKey}:${lngKey}:${radius}:${category}`;

  try {
    const cached = await cache.get(cacheKey);
    if (cached) { console.log(`[Cache] Hit nearby: ${cacheKey}`); return res.json(cached); }

    const places = USE_FSQ()
      ? await nearbyFoursquare(lat, lng, radius, category)
      : await nearbyGoogle(lat, lng, radius, category);

    const seen = new Set();
    const unique = places.filter(p => { if (seen.has(p.placeId)) return false; seen.add(p.placeId); return true; });

    const responseData = { places: unique, total: unique.length, category };
    await cache.set(cacheKey, responseData, 24 * 60 * 60);
    res.json(responseData);
  } catch (err) {
    console.error('[nearby]', err.message);
    if (err.code === 403) return res.status(403).json({ error: err.message });
    res.status(500).json({ error: 'Nearby search failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT (website + phone + open_now) — fetched for visible cards
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/contact/:placeId', detailLimiter, async (req, res) => {
  const { placeId } = req.params;
  const provider = USE_FSQ() ? 'fsq' : 'g';
  const cacheKey = `${provider}:contact:${placeId}`;

  try {
    const cached = await cache.get(cacheKey);
    if (cached) { console.log(`[Cache] Hit contact: ${placeId}`); return res.json(cached); }

    let result;

    if (USE_FSQ()) {
      const r = await axios.get(`${FSQ_BASE}/places/${placeId}`, {
        headers: fsqHeaders(),
        params: { fields: 'tel,website,hours' },
      });
      const p = r.data;
      result = { placeId, website: p.website || null, phone: p.tel || null, hasWebsite: !!p.website, hasPhone: !!p.tel, openNow: p.hours?.open_now ?? null };
    } else {
      // Google: use Place Details with just contact + basic fields ($0.020/call)
      const r = await gAxios.get(`${PLACES_BASE}/details/json`, {
        params: {
          place_id: placeId,
          fields: 'website,formatted_phone_number,international_phone_number,opening_hours',
          key: process.env.GOOGLE_SERVER_API_KEY,
        },
      });
      if (r.data.status !== 'OK') return res.status(400).json({ error: `Google API error: ${r.data.status}` });
      const p = r.data.result;
      const phone = p.formatted_phone_number || p.international_phone_number || null;
      result = { placeId, website: p.website || null, phone, hasWebsite: !!p.website, hasPhone: !!phone, openNow: p.opening_hours?.open_now ?? null };
    }

    await cache.set(cacheKey, result, 7 * 24 * 60 * 60);
    res.json(result);
  } catch (err) {
    console.error('[contact]', err.message);
    res.status(500).json({ error: 'Contact fetch failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FULL DETAILS (on "Details ▼" click)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/details/:placeId', detailLimiter, async (req, res) => {
  const { placeId } = req.params;
  const provider = USE_FSQ() ? 'fsq' : 'g';
  const cacheKey = `${provider}:details:${placeId}`;

  try {
    const cached = await cache.get(cacheKey);
    if (cached) { console.log(`[Cache] Hit details: ${placeId}`); return res.json(cached); }

    let result;

    if (USE_FSQ()) {
      const [detailsRes, tipsRes] = await Promise.allSettled([
        axios.get(`${FSQ_BASE}/places/${placeId}`, {
          headers: fsqHeaders(),
          params: { fields: 'name,tel,website,hours,rating,stats,photos,location,price,description' },
        }),
        axios.get(`${FSQ_BASE}/places/${placeId}/tips`, {
          headers: fsqHeaders(),
          params: { limit: 3, fields: 'text,created_at,user' },
        }),
      ]);

      if (detailsRes.status !== 'fulfilled') return res.status(400).json({ error: 'Failed to fetch place details' });
      const p = detailsRes.value.data;
      const tips = tipsRes.status === 'fulfilled' ? (tipsRes.value.data.results || []) : [];

      result = {
        placeId,
        phone: p.tel || null,
        website: p.website || null,
        hasWebsite: !!p.website,
        hasPhone: !!p.tel,
        address: p.location?.formatted_address || null,
        openingHours: p.hours?.display ? [p.hours.display] : null,
        openNow: p.hours?.open_now ?? null,
        rating: normalizeRating(p.rating),
        userRatingsTotal: p.stats?.total_ratings || 0,
        reviews: tips.map(t => ({
          text: (t.text || '').slice(0, 150),
          rating: null,
          author: t.user ? [t.user.first_name, t.user.last_name].filter(Boolean).join(' ') || 'Visitor' : 'Visitor',
          time: t.created_at ? new Date(t.created_at * 1000).toLocaleDateString('en-IN') : '',
        })),
        photoRefs: (p.photos || []).slice(0, 4).map(ph => `${ph.prefix}800x600${ph.suffix}`),
        gmapsLink: p.location?.formatted_address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.location.formatted_address)}`
          : null,
        permanentlyClosed: false,
        detailsLoaded: true,
      };
    } else {
      const r = await gAxios.get(`${PLACES_BASE}/details/json`, {
        params: {
          place_id: placeId,
          fields: ['name','formatted_address','formatted_phone_number','international_phone_number','website','opening_hours','rating','user_ratings_total','reviews','photos','price_level','url','business_status'].join(','),
          key: process.env.GOOGLE_SERVER_API_KEY,
        },
      });

      if (r.data.status !== 'OK') {
        const hint = r.data.status === 'REQUEST_DENIED' ? 'Check that Places API is enabled and the server API key is correct.' : '';
        return res.status(400).json({ error: `Google API error: ${r.data.status}. ${hint}`.trim(), status: r.data.status });
      }

      const p = r.data.result;
      const phone = p.formatted_phone_number || p.international_phone_number || null;
      result = {
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
        reviews: (p.reviews || []).slice(0, 2).map(r => ({ text: r.text?.slice(0, 150) || '', rating: r.rating, author: r.author_name, time: r.relative_time_description })),
        photoRefs: (p.photos || []).slice(0, 4).map(ph => ph.photo_reference),
        gmapsLink: p.url || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
        permanentlyClosed: p.business_status === 'CLOSED_PERMANENTLY',
        detailsLoaded: true,
      };
    }

    await cache.set(cacheKey, result, 7 * 24 * 60 * 60);
    res.json(result);
  } catch (err) {
    console.error('[details]', err.message);
    res.status(500).json({ error: 'Place details fetch failed' });
  }
});

// ─── Photo Proxy (Google only — Foursquare photos are direct URLs) ─────────────
router.get('/photo', async (req, res) => {
  if (USE_FSQ()) return res.status(404).json({ error: 'Photo proxy not needed for Foursquare' });
  const { ref, width = 600 } = req.query;
  if (!ref) return res.status(400).json({ error: 'ref is required' });
  try {
    const response = await gAxios.get(`${PLACES_BASE}/photo`, {
      params: { maxwidth: width, photo_reference: ref, key: process.env.GOOGLE_SERVER_API_KEY },
      responseType: 'stream',
      maxRedirects: 5,          // follow Google's redirect to the actual CDN image
    });

    // Forward content-type so the browser knows it's an image
    const ct = response.headers['content-type'];
    if (ct) res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    // Destroy the upstream stream if the client disconnects early
    req.on('close', () => response.data.destroy());

    response.data.on('error', (streamErr) => {
      console.error('[photo-proxy] stream error:', streamErr.message);
      if (!res.headersSent) res.status(502).json({ error: 'Photo stream failed' });
      else res.destroy();
    });

    response.data.pipe(res);
  } catch (err) {
    console.error('[photo-proxy]', err.code || err.message);
    if (!res.headersSent) res.status(502).json({ error: 'Photo fetch failed' });
  }
});

module.exports = router;
