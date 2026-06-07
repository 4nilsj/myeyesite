const express = require('express');
const axios = require('axios');
const router = express.Router();
const CATEGORY_MAP = require('../utils/categoryMap');
const cache = require('../utils/redisCache');

const SELF_URL = () => `http://localhost:${process.env.PORT || 5000}`;

// Scoring weights — how many places of each type = 10/10 for real-estate use case
const SCORE_WEIGHTS = {
  schools:     { ideal: 5,  weight: 10 },
  hospitals:   { ideal: 3,  weight: 10 },
  restaurants: { ideal: 15, weight: 7  },
  banks:       { ideal: 4,  weight: 7  },
  malls:       { ideal: 2,  weight: 6  },
  colleges:    { ideal: 2,  weight: 5  },
  pharmacy:    { ideal: 3,  weight: 5  },
  clinics:     { ideal: 3,  weight: 4  },
};

router.get('/:pincode', async (req, res) => {
  const { pincode } = req.params;
  const { brand, radius = 3000 } = req.query;

  const brandKey = brand ? brand.trim().toLowerCase() : '';
  const cacheKey = `market:${pincode}:${brandKey}:${radius}`;

  try {
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      console.log(`[Cache] Hit for market search: ${cacheKey}`);
      return res.json(cachedData);
    }

    // 1. Geocode the PIN
    const geoRes = await axios.get(`${SELF_URL()}/api/geocode/${pincode}`);
    const { lat, lng, locality, state } = geoRes.data;

    // 2. Fetch all categories in parallel
    const categoryKeys = Object.keys(CATEGORY_MAP);
    const fetches = await Promise.allSettled(
      categoryKeys.map(cat =>
        axios.get(`${SELF_URL()}/api/places/nearby`, {
          params: { lat, lng, radius, category: cat },
        }).then(r => ({ cat, places: r.data.places || [] }))
      )
    );

    const density = {};
    fetches.forEach((result, i) => {
      const cat = categoryKeys[i];
      const places = result.status === 'fulfilled' ? result.value.places : [];
      density[cat] = {
        count: places.length,
        withWebsite: places.filter(p => p.hasWebsite).length,
        avgRating: places.length
          ? (places.reduce((s, p) => s + (p.rating || 0), 0) / places.length).toFixed(1)
          : null,
        topPlaces: places
          .sort((a, b) => (b.rating || 0) - (a.rating || 0))
          .slice(0, 3)
          .map(p => ({ name: p.name, rating: p.rating, gmapsLink: p.gmapsLink })),
      };
    });

    // 3. Real-estate proximity scores
    const scores = {};
    Object.entries(SCORE_WEIGHTS).forEach(([cat, { ideal }]) => {
      const count = density[cat]?.count || 0;
      scores[cat] = Math.min(10, Math.round((count / ideal) * 10));
    });

    const weightedSum = Object.entries(scores).reduce((sum, [cat, score]) => {
      return sum + score * (SCORE_WEIGHTS[cat]?.weight || 5);
    }, 0);
    const totalWeight = Object.values(SCORE_WEIGHTS).reduce((s, w) => s + w.weight, 0);
    const overallScore = Math.round(weightedSum / totalWeight);

    // 4. Market saturation
    const saturation = {};
    categoryKeys.forEach(cat => {
      const count = density[cat]?.count || 0;
      saturation[cat] = count === 0 ? 'empty'
        : count <= 2  ? 'low'
        : count <= 8  ? 'moderate'
        : count <= 15 ? 'high'
        : 'saturated';
    });

    // 5. Brand check
    let brandResults = null;
    if (brand) {
      const allPlaces = fetches
        .filter(f => f.status === 'fulfilled')
        .flatMap(f => f.value.places);
      brandResults = allPlaces.filter(p =>
        p.name.toLowerCase().includes(brand.toLowerCase())
      ).map(p => ({ name: p.name, category: p.category, gmapsLink: p.gmapsLink }));
    }

    const responseData = {
      pincode, lat, lng, locality, state,
      density,
      scores,
      overallScore,
      saturation,
      brandResults,
      missing: categoryKeys.filter(cat => (density[cat]?.count || 0) === 0),
    };

    // Cache market results for 24 hours
    await cache.set(cacheKey, responseData, 24 * 60 * 60);

    res.json(responseData);

  } catch (err) {
    console.error('[market]', err.message);
    res.status(500).json({ error: 'Market research failed: ' + err.message });
  }
});

module.exports = router;
