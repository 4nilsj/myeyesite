"""API routes for triggering scrapers, polling status, and streaming SSE progress."""

import json
import os
import threading
import time

from flask import Blueprint, Response, flash, jsonify, redirect, request, url_for

from core.config import STATION_DISTRICT_MAP, STATION_MAP
from core.repository import _get_highest_fir_number, _get_missing_fir_numbers
from core.tracker import progress_tracker
from fir_scraper import (
    DEFAULT_COOKIES,
    DEFAULT_HEADERS,
    build_cookies_from_env,
)
from services.scraper_service import _async_scrape_worker

api_bp = Blueprint("api", __name__)


def fetch_firs():
    if request.method == "GET":
        return redirect(url_for("index"))

    station_id = request.form.get("station_id", "717").strip()
    try:
        start_fir = int(request.form.get("start_fir", 1))
        end_fir = int(request.form.get("end_fir", 1))
    except ValueError:
        flash("Invalid FIR numbers provided.", "danger")
        return redirect(url_for("index", station_id=station_id))

    year = request.form.get("year", "2026").strip()

    if start_fir > end_fir:
        flash("Start FIR number cannot be greater than End FIR number.", "warning")
        return redirect(url_for("index", station_id=station_id))

    missing_firs, existing_firs = _get_missing_fir_numbers(station_id, start_fir, end_fir)

    if not missing_firs:
        flash(
            f"ℹ️ All requested FIRs ({len(existing_firs)} total: FIR {start_fir:04d} → {end_fir:04d}) "
            f"already exist locally in database. Showing requested FIR range below!",
            "info"
        )
        return redirect(url_for("index", station_id=station_id, start_fir=start_fir, end_fir=end_fir))

    captcha = os.getenv("FIR_CAPTCHA", "").strip()
    csrf_token = os.getenv("FIR_CSRF_TOKEN", "").strip()

    if not captcha or not csrf_token:
        flash(
            "⚠️ FIR_CAPTCHA or FIR_CSRF_TOKEN is missing in .env! "
            "Please update session credentials in .env before fetching missing FIRs.",
            "danger"
        )
        return redirect(url_for("index", station_id=station_id, start_fir=start_fir, end_fir=end_fir))

    district_id = STATION_DISTRICT_MAP.get(station_id, "23")
    url = os.getenv("FIR_URL", "https://ksp.karnataka.gov.in/fir_search_new_api.php")
    cookies = build_cookies_from_env() or DEFAULT_COOKIES

    worker_thread = threading.Thread(
        target=_async_scrape_worker,
        args=(
            url,
            DEFAULT_HEADERS,
            cookies,
            min(missing_firs),
            max(missing_firs),
            year,
            district_id,
            station_id,
            captcha,
            csrf_token,
            missing_firs,
        ),
        daemon=True,
    )
    worker_thread.start()

    flash(
        f"⚡ Started fetching {len(missing_firs)} missing FIR(s) from portal in background! "
        f"({len(existing_firs)} FIRs loaded instantly from local cache). Refresh in a few seconds to see new downloads.",
        "success"
    )

    return redirect(url_for("index", station_id=station_id, start_fir=start_fir, end_fir=end_fir))


def extract_new_firs():
    if request.method == "GET":
        return redirect(url_for("index"))

    station_id = request.form.get("station_id", "717").strip()
    try:
        batch_size = int(request.form.get("batch_size", 10))
    except ValueError:
        batch_size = 10

    year = request.form.get("year", "2026").strip()

    highest = _get_highest_fir_number(station_id)
    start_fir = highest + 1
    end_fir = start_fir + batch_size - 1

    station_name = STATION_MAP.get(station_id, f"Station {station_id}")

    captcha = os.getenv("FIR_CAPTCHA", "").strip()
    csrf_token = os.getenv("FIR_CSRF_TOKEN", "").strip()

    if not captcha or not csrf_token:
        flash(
            f"⚠️ FIR_CAPTCHA or FIR_CSRF_TOKEN missing in .env! "
            f"Please update credentials in .env before extracting new FIRs (FIR {start_fir:04d} → {end_fir:04d}).",
            "danger"
        )
        return redirect(url_for("index", station_id=station_id, start_fir=start_fir, end_fir=end_fir))

    district_id = STATION_DISTRICT_MAP.get(station_id, "23")
    url = os.getenv("FIR_URL", "https://ksp.karnataka.gov.in/fir_search_new_api.php")
    cookies = build_cookies_from_env() or DEFAULT_COOKIES

    missing_firs = list(range(start_fir, end_fir + 1))

    worker_thread = threading.Thread(
        target=_async_scrape_worker,
        args=(
            url,
            DEFAULT_HEADERS,
            cookies,
            start_fir,
            end_fir,
            year,
            district_id,
            station_id,
            captcha,
            csrf_token,
            missing_firs,
        ),
        daemon=True,
    )
    worker_thread.start()

    flash(
        f"⚡ Auto-detected next FIR range! Highest saved for {station_name}: #{highest:04d}. "
        f"Started extracting next {batch_size} new FIRs (FIR {start_fir:04d} → {end_fir:04d}) in background!",
        "success"
    )

    return redirect(url_for("index", station_id=station_id, start_fir=start_fir, end_fir=end_fir))


def scrape_status():
    return jsonify(progress_tracker.to_dict())


def scrape_progress():
    def event_stream():
        terminal_statuses = {"idle", "completed", "failed"}
        while True:
            data = progress_tracker.to_dict()
            yield f"data: {json.dumps(data)}\n\n"
            if data.get("status") in terminal_statuses:
                break
            time.sleep(1.0)

    return Response(
        event_stream(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def register_api_routes(app):
    """Register API routes directly on Flask app to maintain backward-compatible endpoints."""
    app.add_url_rule("/fetch_firs", view_func=fetch_firs, methods=["POST", "GET"], endpoint="fetch_firs")
    app.add_url_rule("/extract_new_firs", view_func=extract_new_firs, methods=["POST", "GET"], endpoint="extract_new_firs")
    app.add_url_rule("/api/scrape_status", view_func=scrape_status, endpoint="scrape_status")
    app.add_url_rule("/api/scrape_progress", view_func=scrape_progress, endpoint="scrape_progress")
