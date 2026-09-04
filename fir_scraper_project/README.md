# 🛡️ FIR Intelligence & PDF Explorer

A comprehensive intelligence platform and scraper for Karnataka State Police FIR (First Information Report) documents. This tool provides automated scanning, batch downloading, OCR text extraction, SQLite FTS5 full-text search, crime classification, entity extraction, and a dark-mode web analytics dashboard.

---

## 📑 Table of Contents
1. [Key Features](#-key-features)
2. [Web UI Dashboard Guide](#-web-ui-dashboard-guide)
3. [Quick Start & Running](#-quick-start--running)
   - [Running the Web UI](#1-running-the-web-ui)
   - [Running the Scraper CLI](#2-running-the-scraper-cli)
   - [Running Automated Tests](#3-running-automated-tests)
4. [Configuration (.env)](#-configuration-env)
5. [Architecture & Data Storage](#-architecture--data-storage)
6. [Folder Structure](#-folder-structure)

---

## 🌟 Key Features

- **Automated FIR Scraping**: Scans FIR ranges across police stations, solving CSRF and session validations.
- **Fast Full-Text Search (SQLite FTS5)**: Real-time keyword search across full FIR text, summaries, complainant/accused names, and acts.
- **Crime Category Tagging**: Automatically detects and badges offences (e.g., *Murder/Attempt*, *Robbery*, *Cybercrime*, *Illegal Liquor*, *POCSO/Woman Harassment*, *Land Disputes*, *Theft/Burglary*).
- **Intelligent Entity Extraction**: Parses bilingual Kannada & English FIRs for Complainant, Accused, Victims, Incident Location, Dates, and IPC/BNS Acts & Sections.
- **Dual PDF Processing**: Fast digital text parsing with automatic OCR fallback (`pytesseract` / `PyMuPDF`) for scanned copies.
- **Modern Web Dashboard**: Glassmorphism UI with real-time stats, filtering, PDF viewer, and in-browser scraping triggers.

---

## 🖥️ Web UI Dashboard Guide

The web dashboard is served via Flask and accessible at **`http://localhost:5002`**.

### Dashboard Features:
| Feature | Description |
| :--- | :--- |
| **Search & Highlight** | Fast search matching filenames, extracted parties, or text snippets with highlighted query tokens. |
| **Station Filtering** | Filter records by Police Station (e.g. *717 Madbool*, *718 Kalagi*, *2256 Cybercrime*). |
| **Crime Classification** | Visual color-coded badges mapping IPC & BNS sections to human-readable crime types. |
| **Detail Inspector** | View structured metadata alongside an interactive inline PDF preview. |
| **In-Browser Scraper** | Trigger scraper jobs directly from the UI header modal without touching the terminal. |
| **Sync / Re-index** | One-click button to synchronize new PDFs dropped into `pdfs/` directly into the SQLite database. |
| **Data Export** | Export filtered or complete datasets to CSV and JSON formats. |

---

## 🚀 Quick Start & Running

### Prerequisites & Installation

```bash
# 1. Clone/navigate to project
cd fir_scraper_project

# 2. Set up virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy environment configuration
cp .env.example .env
```

---

### 1. Running the Web UI

To start the local web explorer:

```bash
# Start on default port 5002
python3 app.py

# Or specify a custom port:
PORT=8080 python3 app.py
```

Open your browser at: **[http://localhost:5002](http://localhost:5002)**

---

### 2. Running the Scraper CLI

Ensure your `.env` contains an active `FIR_CAPTCHA` and `FIR_CSRF_TOKEN` before scraping.

#### Using the `run.sh` Convenience Helper:

```bash
# Scrape Madbool Station (ID 717) for FIRs 1 to 50
./run.sh --station madbool --start-fir 1 --end-fir 50

# Scrape Kalagi Station (ID 718)
./run.sh --station kalagi --start-fir 1 --end-fir 30

# Scrape Cybercrime Station (ID 2256)
./run.sh --station cybercrime --start-fir 1 --end-fir 20

# Run all configured stations sequentially
./run.sh --all --start-fir 1 --end-fir 10
```

#### Running `fir_scraper.py` directly:

```bash
python3 fir_scraper.py --start-fir 1 --end-fir 50 --ps-id 717
```

---

### 3. Running Automated Tests

Run the unit test suite to verify extraction, database caching, and routes:

```bash
# Run all tests
python3 -m unittest discover -s tests

# Or using the helper script
./run.sh --test
```

---

## ⚙️ Configuration (`.env`)

Configure your session variables in `.env`:

```ini
# Captcha text from the active KSP search session
FIR_CAPTCHA=RKELR

# CSRF token from hidden input form field
FIR_CSRF_TOKEN=1be9b9bbe415ddff5aeebff6c29523f7ab8fb5f40c95c421cb5aceed0f5a4f9d

# Active session cookies from browser
FIR_COOKIE_PHPSESSID=mmek5vakg578uacv5fnr7kpvjo
FIR_COOKIE_XSRF_TOKEN=...
FIR_COOKIE_CEGKAR=...

# Defaults
FIR_YEAR=2026
FIR_DISTRICT_ID=23
FIR_PS_ID=717
FIR_URL=https://ksp.karnataka.gov.in/fir_search_new_api.php
```

---

## 🏗️ Architecture & Data Storage

- **PDF Storage (`pdfs/`)**: Raw downloaded FIR documents are stored as `fir_ps<STATION_ID>_<FIR_NUM>.pdf`.
- **Database (`fir_cache.db`)**: High-performance SQLite database with `fir_documents` table and a `fir_fts` Full-Text Search index (FTS5).
- **Log Files (`logs/`)**: Operational logs and scrape histories.

---

## 📁 Folder Structure

```
fir_scraper_project/
├── app.py                # Flask Web UI & REST API server
├── fir_scraper.py        # Core scraping engine & downloader
├── run.sh                # CLI execution wrapper & helper
├── fir_cache.db          # SQLite Database + FTS5 Full-Text Index
├── requirements.txt      # Python package dependencies
├── .env.example          # Environment variables template
├── templates/            # Jinja2 HTML Templates
│   ├── index.html        # Dashboard, Analytics & Search Explorer
│   └── detail.html       # Individual FIR detail & PDF viewer
├── tests/                # Automated unit test suite
│   ├── test_app.py       # Web app route tests
│   ├── test_db.py        # SQLite FTS & sync tests
│   └── test_helpers.py   # Entity extraction tests
├── pdfs/                 # Downloaded FIR PDF documents
└── logs/                 # Execution logs
```
