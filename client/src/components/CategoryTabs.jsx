import { CATEGORY_MAP } from '../utils/categoryMap';

export default function CategoryTabs({ active, onChange, counts }) {
  const categories = Object.entries(CATEGORY_MAP);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {categories.map(([key, { label, icon }]) => {
        const count = key === 'all'
          ? Object.values(counts || {}).reduce((a, b) => a + b, 0)
          : counts?.[key] || 0;
        const isActive = active === key;

        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold
                        whitespace-nowrap transition-all duration-200 border
                        ${isActive
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200/60'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50'
                        }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
            {count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center
                ${isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
