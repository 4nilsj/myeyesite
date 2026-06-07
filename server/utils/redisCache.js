const NodeCache = require('node-cache');

// Pure in-memory cache — no Redis needed for local development
const memoryCache = new NodeCache({ stdTTL: 86400, checkperiod: 120 });

const initCache = async () => {
  console.log('[Cache] Using in-memory cache (node-cache)');
};

const get = async (key) => {
  const val = memoryCache.get(key);
  return val !== undefined ? val : null;
};

const set = async (key, value, ttlSeconds = 86400) => {
  memoryCache.set(key, value, ttlSeconds);
};

module.exports = { initCache, get, set };
