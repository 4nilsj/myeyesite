# 📍 PinCode Explorer — Local Setup Guide

## Prerequisites

Make sure you have these installed:
- **Node.js** v18 or above → https://nodejs.org
- **npm** (comes with Node)
- A Google Cloud account with the APIs enabled (see below)

---

## Step 1: Get Google API Keys

1. Go to https://console.cloud.google.com
2. Create a new project: `pincode-explorer`
3. Enable these APIs (APIs & Services → Library):
   - ✅ Places API
   - ✅ Geocoding API
   - ✅ Maps JavaScript API

4. Create **two API keys** (APIs & Services → Credentials → Create Credentials → API Key):

   | Key name | Restrict to |
   |---|---|
   | `pincode-server-key` | Places API + Geocoding API |
   | `pincode-browser-key` | Maps JavaScript API only |

5. Set a **budget alert** at $10 (Billing → Budgets & Alerts) — safety net.

---

## Step 2: Configure Environment Files

### Backend
```bash
cd server
cp .env.example .env
```
Open `server/.env` and paste your server key:
```
PORT=5000
GOOGLE_SERVER_API_KEY=paste_your_server_key_here
```

### Frontend
```bash
cd client
cp .env.example .env
```
Open `client/.env` and paste your browser key:
```
VITE_GOOGLE_MAPS_KEY=paste_your_browser_key_here
```

---

## Step 3: Install Dependencies

Open **two terminal windows**.

**Terminal 1 — Backend:**
```bash
cd pincode-explorer/server
npm install
```

**Terminal 2 — Frontend:**
```bash
cd pincode-explorer/client
npm install
```

---

## Step 4: Run the App

**Terminal 1 — Start backend:**
```bash
cd pincode-explorer/server
npm run dev
```
You should see:
```
🚀 PinCode Explorer API running at http://localhost:5000
```

**Terminal 2 — Start frontend:**
```bash
cd pincode-explorer/client
npm run dev
```
You should see:
```
  VITE v5.x.x  ready in 300ms
  ➜  Local:   http://localhost:5173/
```

---

## Step 5: Open in Browser

Go to → **http://localhost:5173**

Try a PIN code: `411001` (Pune), `110001` (Delhi), `400001` (Mumbai)

---

## Project Structure

```
pincode-explorer/
├── server/                  ← Node.js + Express API
│   ├── index.js             ← Entry point (port 5000)
│   ├── routes/
│   │   ├── geocode.js       ← PIN → coordinates + reverse geocode
│   │   ├── places.js        ← Nearby search + place details + photo proxy
│   │   └── market.js        ← Market research + brand check
│   ├── middleware/
│   │   ├── cache.js         ← In-memory cache (node-cache)
│   │   └── rateLimit.js     ← Rate limiting
│   ├── utils/
│   │   └── categoryMap.js   ← Category → Google place type mapping
│   └── .env                 ← Your server API key (never commit this)
│
└── client/                  ← React + Vite + Tailwind
    ├── src/
    │   ├── App.jsx           ← Main app with state management
    │   ├── components/
    │   │   ├── SearchBar.jsx          ← PIN input + Near Me button
    │   │   ├── CategoryTabs.jsx       ← Filter tabs with counts
    │   │   ├── FilterBar.jsx          ← Toggle filters (website, open, rating)
    │   │   ├── ResultCard.jsx         ← Place card with lazy details
    │   │   ├── MapView.jsx            ← Google Map with markers + directions
    │   │   ├── AnalyticsDashboard.jsx ← Area stats + gap analysis
    │   │   └── MarketResearch.jsx     ← Market mode + brand checker
    │   └── utils/
    │       ├── api.js         ← All API calls to backend
    │       └── categoryMap.js ← Frontend category config
    └── .env                   ← Your browser API key (never commit this)
```

---

## Features Available Locally

- 🔍 Search by PIN code
- 📍 Near Me (auto-detect PIN from location)
- 🏨 12 categories: Hotels, Hospitals, Restaurants, Schools, Colleges, Historic, Malls, Banks, Govt, Clinics, Pharmacy, Police
- 🗺️ Google Map with place markers + draggable search radius
- 🔽 Lazy-loading place details (click "Details ▼" on any card)
- 📞 WhatsApp link for each place
- 🌐 Website toggle filter
- 📞 Phone + Website (lead gen) toggle
- 🟢 Open Now filter
- ⭐ Minimum rating filter
- 📊 Analytics dashboard with gap analysis
- 🔬 Market Research mode with real-estate scores
- 🔍 Brand checker (e.g. check if Apollo exists in a PIN area)
- ★ Save places to localStorage (persists across sessions)
- 🕐 Search history (last 10 PINs)
- 🔗 Shareable URL (bookmarkable searches)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `REQUEST_DENIED` error | Check your server API key in `server/.env` |
| Map not loading | Check your browser API key in `client/.env`; make sure Maps JS API is enabled |
| `CORS` error | Make sure backend is running on port 5000 |
| `npm run dev` fails | Make sure Node.js v18+ is installed: `node --version` |
| Place photos not loading | Normal — not all places have photos on Google |

---

## API Cost Reminder

Each unique PIN+category search costs ~$0.037. With caching:
- Same PIN searched twice = **$0 second time** (served from cache)
- Place details = fetched only when you click "Details ▼"
- Your $200/month Google credit covers thousands of unique searches

Set a billing alert at $10 in Google Cloud Console for safety.
