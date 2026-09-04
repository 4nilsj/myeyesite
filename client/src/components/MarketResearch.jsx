import { useState } from 'react';
import { fetchMarket } from '../utils/api';
import { CATEGORY_MAP } from '../utils/categoryMap';

const SATURATION_COLOR = {
  empty:     'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
  low:       'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40',
  moderate:  'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40',
  high:      'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border border-orange-200/60 dark:border-orange-800/40',
  saturated: 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/40',
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
      setError('Market research failed. Check PIN code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 transition-colors duration-200">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">🔬</span>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Market Intelligence & Saturation</h2>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
        Analyze commercial density, real-estate accessibility scores, and brand presence for PIN <span className="font-semibold text-indigo-600 dark:text-indigo-400">{pincode}</span>
      </p>

      <div className="flex gap-2 mb-5">
        <input
          type="text"
          value={brand}
          onChange={e => setBrand(e.target.value)}
          placeholder="Optional: Check brand presence (e.g. Apollo, Starbucks, HDFC, Zudio)"
          className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800
                     text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500
                     focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition-all"
        />
        <button
          onClick={run}
          disabled={loading || !pincode}
          className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white
                     text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors shadow-sm shadow-indigo-200 dark:shadow-none cursor-pointer"
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {error && (
        <p className="text-rose-500 text-xs font-medium bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-200 dark:border-rose-900 mb-4">
          ⚠️ {error}
        </p>
      )}

      {data && (
        <div className="space-y-6 pt-2">
          {/* Overall score banner */}
          <div className="flex items-center gap-4 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl p-5">
            <div className="text-4xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
              {data.overallScore}<span className="text-xl font-normal text-indigo-400">/10</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white">Commercial Accessibility Score</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{data.locality}, {data.state}</p>
            </div>
          </div>

          {/* Proximity scores */}
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-3">🏠 Real-Estate Proximity Index</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Object.entries(data.scores).map(([cat, score]) => (
                <div key={cat} className="bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">{score}/10</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex items-center justify-center gap-1">
                    <span>{CATEGORY_MAP[cat]?.icon}</span>
                    <span className="truncate">{CATEGORY_MAP[cat]?.label || cat}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Market saturation */}
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-3">📈 Market Saturation</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.saturation).map(([cat, level]) => (
                <span
                  key={cat}
                  className={`text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 ${SATURATION_COLOR[level]}`}
                >
                  <span>{CATEGORY_MAP[cat]?.icon}</span>
                  <span>{CATEGORY_MAP[cat]?.label}:</span>
                  <span className="uppercase tracking-wider text-[10px] font-bold">{level}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Missing categories */}
          {data.missing?.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl p-4">
              <p className="text-sm text-amber-800 dark:text-amber-300 font-semibold mb-1 flex items-center gap-1.5">
                <span>⚠️</span> High Opportunity Gap
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {data.missing.map(c => `${CATEGORY_MAP[c]?.icon || ''} ${CATEGORY_MAP[c]?.label || c}`).join(', ')} were not detected in this vicinity.
              </p>
            </div>
          )}

          {/* Brand check result */}
          {data.brandResults !== null && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-2">🔍 Brand Presence: "{brand}"</h3>
              {data.brandResults.length === 0 ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/40">
                  ✅ Not currently found in this area — prime opportunity for market expansion!
                </p>
              ) : (
                <div className="space-y-2">
                  {data.brandResults.map((b, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/80 rounded-xl px-3.5 py-2.5 text-sm border border-slate-100 dark:border-slate-800"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {b.name} <span className="text-slate-400 dark:text-slate-500 text-xs">({b.category})</span>
                      </span>
                      <a
                        href={b.gmapsLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:underline"
                      >
                        Directions ↗
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
