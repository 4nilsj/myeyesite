const rateLimit = require('express-rate-limit');

// Nearby search and geocode — hits Google API on cache miss, keep conservative
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: { error: 'Too many requests. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Place details — served from 7-day server cache after first fetch, so the real
// cost is only on cache misses. Limit is per 15-min window; one full search can
// produce up to 720 background detail calls so the limit must exceed that comfortably.
const detailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 3000 : 10000,
  message: { error: 'Detail request limit reached. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { searchLimiter, detailLimiter };
