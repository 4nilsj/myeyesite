import { useState } from 'react';
import { fetchMarket } from '../utils/api';
import { CATEGORY_MAP } from '../utils/categoryMap';

const SATURATION_COLOR = {
  empty:     'bg-gray-100 text-gray-500',
  low:       'bg-green-100 text-green-700',
  moderate:  'bg-yellow-100 text-yellow-700',
  high:      'bg-orange-100 text-orange-700',
  saturated: 'bg-red-100 text-red-700',
};

export default function MarketResearch({ pincode }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState('');
  const [error, setError] = useState('');

  const run = async () => {
    if (!pincode) return;
    setLoading(true);
    setError('');
    try {
      const result = await fetchMarket(pincode, 3000, brand);
      setData(result);
    } catch (e) {
      setError('Market research failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-1">🔬 Market Research Mode</h2>
      <p className="text-sm text-gray-500 mb-4">
        Analyse market density, saturation and real-estate scores for PIN {pincode}
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={brand}
          onChange={e => setBrand(e.target.value)}
          placeholder="Optional: check a brand (e.g. Apollo, HDFC)"
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
        />
        <button
          onClick={run}
          disabled={loading || !pincode}
          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white
                     text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
        >
          {loading ? 'Analysing…' : 'Analyse'}
        </button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {data && (
        <div className="space-y-6">
          {/* Overall score */}
          <div className="flex items-center gap-4 bg-purple-50 rounded-xl p-4">
            <div className="text-4xl font-black text-purple-700">{data.overallScore}/10</div>
            <div>
              <p className="font-bold text-gray-900">Area Score</p>
              <p className="text-sm text-gray-500">{data.locality}, {data.state}</p>
            </div>
          </div>

          {/* Proximity scores */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">🏠 Real-Estate Proximity Scores</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(data.scores).map(([cat, score]) => (
                <div key={cat} className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-xl font-black text-blue-600">{score}/10</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {CATEGORY_MAP[cat]?.icon} {CATEGORY_MAP[cat]?.label || cat}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Market saturation */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">📈 Market Saturation</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.saturation).map(([cat, level]) => (
                <span key={cat}
                  className={`text-xs font-medium px-3 py-1 rounded-full ${SATURATION_COLOR[level]}`}>
                  {CATEGORY_MAP[cat]?.icon} {CATEGORY_MAP[cat]?.label}: {level}
                </span>
              ))}
            </div>
          </div>

          {/* Missing categories */}
          {data.missing?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-sm text-amber-700">
                ⚠️ <strong>Business opportunity:</strong>{' '}
                {data.missing.map(c => `${CATEGORY_MAP[c]?.icon || ''} ${CATEGORY_MAP[c]?.label || c}`).join(', ')} not found nearby
              </p>
            </div>
          )}

          {/* Brand check result */}
          {data.brandResults !== null && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-2">🔍 Brand: "{brand}"</h3>
              {data.brandResults.length === 0 ? (
                <p className="text-sm text-green-600 font-medium">
                  ✅ Not found in this area — potential market opportunity!
                </p>
              ) : (
                <div className="space-y-2">
                  {data.brandResults.map((b, i) => (
                    <div key={i} className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <span>{b.name} <span className="text-gray-400">({b.category})</span></span>
                      <a href={b.gmapsLink} target="_blank" rel="noreferrer"
                        className="text-blue-600 text-xs hover:underline">Maps ↗</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Density details */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">📊 Category Density</h3>
            <div className="space-y-2">
              {Object.entries(data.density)
                .filter(([, d]) => d.count > 0)
                .sort(([, a], [, b]) => b.count - a.count)
                .map(([cat, d]) => (
                  <div key={cat} className="flex justify-between items-center text-sm">
                    <span>{CATEGORY_MAP[cat]?.icon} {CATEGORY_MAP[cat]?.label}</span>
                    <span className="text-gray-500">
                      {d.count} found
                      {d.avgRating && ` · ★${d.avgRating}`}
                      {d.withWebsite > 0 && ` · 🌐${d.withWebsite}`}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
