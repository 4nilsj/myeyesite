# FIR Scraper Project

This folder contains a standalone Python scraper for scanning FIR numbers and downloading matching PDFs.

## Setup

1. Create a virtual environment (optional but recommended)
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies
   ```bash
   pip install -r requirements.txt
   ```
3. Copy the example environment file and fill in your values
   ```bash
   cp .env.example .env
   ```

## Run

### As a script

```bash
python3 fir_scraper.py --start-fir 1 --end-fir 10
```

### As an installed CLI command

```bash
pip install -e .
fir-scrape --start-fir 1 --end-fir 10
```

You can also provide values directly:

```bash
python3 fir_scraper.py --start-fir 1 --end-fir 10 --captcha YOUR_CAPTCHA --csrf-token YOUR_CSRF_TOKEN
```

## Output

- Logs are stored in the `logs/` folder
- Downloaded PDFs are stored in the `pdfs/` folder
- The web viewer reads PDFs from the same `pdfs/` folder

### Where to put PDFs

Drop your PDF files inside this folder:

- [fir_scraper_project/pdfs](fir_scraper_project/pdfs)
