import { CATEGORY_MAP } from '../utils/categoryMap';

export default function CategoryTabs({ active, onChange, counts }) {
  const categories = Object.entries(CATEGORY_MAP);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide py-1">
      {categories.map(([key, { label, icon }]) => {
        const count = key === 'all'
          ? Object.values(counts || {}).reduce((a, b) => a + b, 0)
          : counts?.[key] || 0;
        const isActive = active === key;

        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold
                        whitespace-nowrap transition-all duration-200 border cursor-pointer select-none
                        ${isActive
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/30'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-slate-800'
                        }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
            {count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center
                ${isActive ? 'bg-white/25 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
