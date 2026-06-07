export const CATEGORY_MAP = {
  all:         { label: 'All',           icon: '🗺️' },
  hotels:      { label: 'Hotels',        icon: '🏨' },
  hospitals:   { label: 'Hospitals',     icon: '🏥' },
  restaurants: { label: 'Restaurants',   icon: '🍽️' },
  schools:     { label: 'Schools',       icon: '🏫' },
  colleges:    { label: 'Colleges',      icon: '🎓' },
  historic:    { label: 'Historic',      icon: '🏛️' },
  malls:       { label: 'Malls',         icon: '🛍️' },
  banks:       { label: 'Banks',         icon: '🏦' },
  govt:        { label: 'Govt Offices',  icon: '🏢' },
  clinics:     { label: 'Clinics',       icon: '🩺' },
  pharmacy:    { label: 'Pharmacy',      icon: '💊' },
  police:      { label: 'Police',        icon: '👮' },
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_MAP).filter(k => k !== 'all');
