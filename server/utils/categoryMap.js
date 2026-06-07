const CATEGORY_MAP = {
  hotels:      { type: 'lodging',               fsqId: '19014', label: 'Hotels',        icon: '🏨' },
  hospitals:   { type: 'hospital',              fsqId: '15014', label: 'Hospitals',     icon: '🏥' },
  restaurants: { type: 'restaurant',            fsqId: '13065', label: 'Restaurants',   icon: '🍽️' },
  schools:     { type: 'school',                fsqId: '12058', label: 'Schools',       icon: '🏫' },
  colleges:    { type: 'university',            fsqId: '12009', label: 'Colleges',      icon: '🎓' },
  historic:    { type: 'tourist_attraction',    fsqId: '16032', label: 'Historic',      icon: '🏛️' },
  malls:       { type: 'shopping_mall',         fsqId: '17069', label: 'Malls',         icon: '🛍️' },
  banks:       { type: 'bank',                  fsqId: '11082', label: 'Banks',         icon: '🏦' },
  govt:        { type: 'local_government_office',fsqId:'12047', label: 'Govt Offices',  icon: '🏢' },
  clinics:     { type: 'doctor',                fsqId: '15054', label: 'Clinics',       icon: '🩺' },
  pharmacy:    { type: 'pharmacy',              fsqId: '15069', label: 'Pharmacy',      icon: '💊' },
  police:      { type: 'police',                fsqId: '12120', label: 'Police',        icon: '👮' },
};

module.exports = CATEGORY_MAP;
