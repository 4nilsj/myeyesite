# PinCode Explorer

Discover hotels, hospitals, restaurants, schools, and more for any Indian PIN code — with an interactive map, market research tools, and lead-gen filters.

**Live repo:** https://github.com/4nilsj/myeyesite

---

## Prerequisites

- **Node.js** v18+ — https://nodejs.org
- **npm** (bundled with Node)
- A Google Cloud account with the APIs below enabled

---

## Step 1: Clone the repo

```bash
git clone https://github.com/4nilsj/myeyesite.git
cd myeyesite
```

---

## Step 2: Get Google API Keys

1. Go to https://console.cloud.google.com and create a project
2. Enable these APIs (APIs & Services → Library):
   - Places API
   - Geocoding API
   - Maps JavaScript API
3. Create **two API keys** (Credentials → Create Credentials → API Key):

   | Key | Restrict to |
   |-----|-------------|
   | Server key | Places API + Geocoding API |
   | Browser key | Maps JavaScript API only |

4. Recommended: set a billing alert at $10 (Billing → Budgets & Alerts)

---

## Step 3: Configure environment files

**Backend:**
```bash
cd server
cp .env.example .env
```
Edit `server/.env`:
```
PORT=5001
GOOGLE_SERVER_API_KEY=your_server_key_here
```

**Frontend:**
```bash
cd ../client
cp .env.example .env
```
Edit `client/.env`:
```
VITE_GOOGLE_MAPS_KEY=your_browser_key_here
```

---

## Step 4: Install dependencies

```bash
# from project root
cd server && npm install
cd ../client && npm install
```

---

## Step 5: Run the app

Open two terminals:

**Terminal 1 — backend:**
```bash
cd server
npm run dev
# → API running at http://localhost:5001
```

**Terminal 2 — frontend:**
```bash
cd client
npm run dev
# → App running at http://localhost:5173
```

Then open **http://localhost:5173** and try a PIN: `110001` (Delhi), `400001` (Mumbai), `411001` (Pune).

---

## Project structure

```
myeyesite/
├── server/                    Node.js + Express API
│   ├── index.js               Entry point
│   ├── routes/
│   │   ├── geocode.js         PIN → lat/lng + reverse geocode
│   │   ├── places.js          Nearby search, place details, photo proxy
│   │   └── market.js          Market research + brand checker
│   ├── middleware/
│   │   └── rateLimit.js       Rate limiting
│   └── utils/
│       ├── categoryMap.js     Category → Google place type mapping
│       └── redisCache.js      In-memory cache (node-cache fallback)
│
└── client/                    React + Vite + Tailwind CSS
    └── src/
        ├── App.jsx            Main app state + data fetching
        ├── components/
        │   ├── SearchBar.jsx
        │   ├── CategoryTabs.jsx
        │   ├── FilterBar.jsx
        │   ├── ResultCard.jsx
        │   ├── MapView.jsx
        │   ├── AnalyticsDashboard.jsx
        │   └── MarketResearch.jsx
        └── utils/
            ├── api.js
            ├── categoryMap.js
            └── debounce.js
```

---

## Features

- Search by PIN code or auto-detect via GPS
- 12 place categories: Hotels, Hospitals, Restaurants, Schools, Colleges, Historic, Malls, Banks, Government, Clinics, Pharmacy, Police
- Interactive Google Map with draggable search radius
- Lazy-loaded place details (phone, website, hours, reviews)
- Filters: open now, min rating, has website, lead-gen (website + phone)
- Analytics dashboard with category gap analysis
- Market research mode with real-estate opportunity scores
- Brand presence checker
- Save places to localStorage, search history, shareable URLs
- CSV / JSON export

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `REQUEST_DENIED` | Check `GOOGLE_SERVER_API_KEY` in `server/.env` |
| Map not loading | Check `VITE_GOOGLE_MAPS_KEY` in `client/.env`; ensure Maps JS API is enabled |
| CORS error | Make sure the backend is running on port 5001 |
| `npm run dev` fails | Requires Node.js v18+: run `node --version` |

---

## API cost note

Each unique PIN + category search costs ~$0.037. Results are cached for 24 hours so repeat searches are free. Place details are fetched on demand only when a card is expanded. The $200/month Google free credit covers thousands of unique searches.
