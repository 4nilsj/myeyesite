require('dotenv').config();
const express = require('express');
const cors = require('cors');

const geocodeRouter = require('./routes/geocode');
const placesRouter  = require('./routes/places');
const marketRouter  = require('./routes/market');

const { initCache } = require('./utils/redisCache');
const { searchLimiter, detailLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:5173' })); // Vite dev server
app.use(express.json());

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/geocode', searchLimiter, geocodeRouter);
app.use('/api/places', searchLimiter, placesRouter);
app.use('/api/market', searchLimiter, marketRouter);

// ─── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 PinCode Explorer API running at http://localhost:${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  if (!process.env.GOOGLE_SERVER_API_KEY) {
    console.warn('\n⚠️  WARNING: GOOGLE_SERVER_API_KEY not set in .env\n');
  }
});

// Initialize Cache on startup
initCache().catch(err => {
  console.error('Failed to initialize cache:', err.message);
});
