import { useMemo } from 'react';
import { CATEGORY_MAP, ALL_CATEGORIES } from '../utils/categoryMap';

const BAR_COLORS = [
  'from-indigo-400 to-indigo-600',
  'from-violet-400 to-violet-600',
  'from-blue-400 to-blue-600',
  'from-cyan-400 to-cyan-600',
  'from-emerald-400 to-emerald-600',
  'from-teal-400 to-teal-600',
  'from-amber-400 to-amber-600',
  'from-orange-400 to-orange-600',
  'from-rose-400 to-rose-600',
  'from-pink-400 to-pink-600',
  'from-purple-400 to-purple-600',
  'from-sky-400 to-sky-600',
];

export default function AnalyticsDashboard({ places }) {
  const stats = useMemo(() => {
    return ALL_CATEGORIES.map((key, idx) => {
      const items = places.filter(p => p.category === key);
      const rated = items.filter(p => p.rating);
      return {
        key,
        icon: CATEGORY_MAP[key].icon,
        label: CATEGORY_MAP[key].label,
        color: BAR_COLORS[idx % BAR_COLORS.length],
        total: items.length,
        withWebsite: items.filter(p => p.hasWebsite).length,
        withPhone: items.filter(p => p.hasPhone).length,
        openNow: items.filter(p => p.openNow === true).length,
        avgRating: rated.length
          ? (rated.reduce((s, p) => s + p.rating, 0) / rated.length).toFixed(1)
          : null,
      };
    });
  }, [places]);

  const present = stats.filter(s => s.total > 0);
  const missing = stats.filter(s => s.total === 0);
  const maxCount = Math.max(...present.map(s => s.total), 1);
  const totalWithWeb = places.filter(p => p.hasWebsite).length;
  const totalOpen = places.filter(p => p.openNow === true).length;

  if (!places.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-100">
        <h2 className="text-base font-bold text-gray-900 mb-3">📊 Area Intelligence</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Places found', value: places.length, icon: '📍', color: 'bg-indigo-50 text-indigo-700' },
            { label: 'Have website', value: totalWithWeb, icon: '🌐', color: 'bg-violet-50 text-violet-700' },
            { label: 'Open now', value: totalOpen, icon: '🟢', color: 'bg-emerald-50 text-emerald-700' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className={`${color} rounded-xl p-3 text-center`}>
              <div className="text-xl font-black">{value}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide opacity-75 mt-0.5">{icon} {label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Gap analysis */}
        {missing.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
            <p className="text-xs font-bold text-amber-700 mb-1.5">⚠️ Business Opportunity — Not found nearby</p>
            <div className="flex flex-wrap gap-1.5">
              {missing.map(m => (
                <span key={m.key} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  {m.icon} {m.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Category bars */}
        <div className="space-y-3">
          {present.map(s => (
            <div key={s.key}>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-semibold text-slate-700">{s.icon} {s.label}</span>
                <div className="flex items-center gap-2.5 text-[11px] text-slate-400">
                  <span className="font-bold text-slate-600">{s.total}</span>
                  {s.withWebsite > 0 && <span>🌐 {s.withWebsite}</span>}
                  {s.openNow > 0 && <span className="text-emerald-600 font-medium">🟢 {s.openNow}</span>}
                  {s.avgRating && <span className="text-amber-500">★ {s.avgRating}</span>}
                </div>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full bg-gradient-to-r ${s.color} transition-all duration-700`}
                  style={{ width: `${(s.total / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
