import { CATEGORY_MAP } from '../utils/categoryMap';

export default function CategoryTabs({ active, onChange, counts }) {
  const categories = Object.entries(CATEGORY_MAP);

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {categories.map(([key, { label, icon }]) => {
        const count = key === 'all'
          ? Object.values(counts || {}).reduce((a, b) => a + b, 0)
          : counts?.[key] || 0;
        const isActive = active === key;

        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium
                        whitespace-nowrap transition-all border
                        ${isActive
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                        }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
            {count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
                ${isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
