const rateLimit = require('express-rate-limit');

// Nearby search and geocode — hits Google API on cache miss, keep conservative
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: { error: 'Too many requests. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Place details — cached 7 days server-side; background fetch needs room for ~720 calls on first run
const detailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 800 : 5000,
  message: { error: 'Detail request limit reached. Please wait.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { searchLimiter, detailLimiter };
