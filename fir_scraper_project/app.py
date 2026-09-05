#!/usr/bin/env python3
"""FIR Intelligence & PDF Explorer - Web Application Entrypoint."""

import logging
import os
import secrets
import sys
import threading
from pathlib import Path

from flask import Flask

from core import classifier, config, db, extractor, repository, tracker
from core.classifier import get_crime_type_badge
from core.config import (
    BASE_DIR,
    CACHE_FILE,
    DB_FILE,
    PDF_DIR,
    STATION_DISTRICT_MAP,
    STATION_MAP,
    TEMPLATE_DIR,
    _extract_fir_number_from_filename,
    _get_station_from_filename,
    _highlight_matches,
    _parse_date_to_sort_key,
)
from core.db import (
    _init_db,
    _migrate_json_to_sqlite,
    _parse_date_value,
    _save_record_to_db,
    get_db,
)
from core.extractor import (
    _clean_summary_val,
    _extract_acts_and_sections,
    _extract_complaint_date,
    _extract_keywords,
    _extract_tq,
    _extract_with_pdftotext,
    _generate_plain_summary,
    _normalize_text,
    _ocr_pdf,
    _parse_summary_fields,
    _read_pdf_info,
    _should_use_ocr,
    get_pdf_info_cached,
    sync_all_pdfs,
)
from core.repository import (
    _get_highest_fir_number,
    _get_missing_fir_numbers,
    get_highest_firs_summary,
    get_station_counts,
    get_station_stats,
    list_pdfs,
)
from core.tracker import ScrapeProgressTracker, progress_tracker
from routes.api import register_api_routes
from routes.web import register_web_routes
from services.scraper_service import _async_scrape_worker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FIRApp")

# Module proxy to intercept dynamic attribute patching (e.g. app.DB_FILE in unit tests)
class _AppModule(sys.modules[__name__].__class__):
    def __setattr__(self, name, value):
        if name == "DB_FILE":
            config.DB_FILE = value
        elif name == "PDF_DIR":
            config.PDF_DIR = value
        elif name == "CACHE_FILE":
            config.CACHE_FILE = value
        super().__setattr__(name, value)


sys.modules[__name__].__class__ = _AppModule


def create_app() -> Flask:
    """Create and configure the Flask application."""
    application = Flask(__name__)
    application.secret_key = os.getenv("FLASK_SECRET_KEY") or secrets.token_hex(32)
    if not os.getenv("FLASK_SECRET_KEY"):
        logger.warning(
            "FLASK_SECRET_KEY not set — using a random secret for this process "
            "(sessions won't survive a restart). Set FLASK_SECRET_KEY in .env for a stable secret."
        )

    application.template_folder = str(TEMPLATE_DIR)

    @application.context_processor
    def utility_processor():
        return dict(get_crime_type=get_crime_type_badge)

    register_web_routes(application)
    register_api_routes(application)
    return application


app = create_app()


def _startup_sync() -> None:
    """Sync any PDFs on disk that aren't yet in the DB (runs in background at startup)."""
    try:
        n = sync_all_pdfs(force=True)
        if n:
            logger.info("Startup sync: indexed %d new PDF(s) from disk.", n)
    except Exception as exc:
        logger.warning("Startup sync error: %s", exc)


# Initialize SQLite database on module import
_init_db()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5002"))
    threading.Thread(target=_startup_sync, daemon=True).start()
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
