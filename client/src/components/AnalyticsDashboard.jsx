import { useMemo } from 'react';
import { CATEGORY_MAP, ALL_CATEGORIES } from '../utils/categoryMap';

export default function AnalyticsDashboard({ places }) {
  const stats = useMemo(() => {
    return ALL_CATEGORIES.map(key => {
      const items = places.filter(p => p.category === key);
      const rated = items.filter(p => p.rating);
      return {
        key,
        icon: CATEGORY_MAP[key].icon,
        label: CATEGORY_MAP[key].label,
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

  if (places.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">📊 Area Intelligence</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {places.length} places found · {totalWithWeb} have a website
          </p>
        </div>
      </div>

      {/* Gap analysis warning */}
      {missing.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-sm text-amber-700">
          ⚠️ <strong>Not found nearby:</strong>{' '}
          {missing.map(m => `${m.icon} ${m.label}`).join(', ')}
        </div>
      )}

      {/* Category bars */}
      <div className="space-y-3">
        {present.map(s => (
          <div key={s.key}>
            <div className="flex justify-between text-sm mb-1">
              <span>{s.icon} <strong>{s.label}</strong></span>
              <span className="text-gray-400 text-xs flex gap-3">
                <span>{s.total} total</span>
                {s.withWebsite > 0 && <span>🌐 {s.withWebsite}</span>}
                {s.openNow > 0 && <span>🟢 {s.openNow} open</span>}
                {s.avgRating && <span>★ {s.avgRating}</span>}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(s.total / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
