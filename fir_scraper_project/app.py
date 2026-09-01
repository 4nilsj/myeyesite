#!/usr/bin/env python3
"""Simple local web UI for browsing extracted PDF content."""

import html
import json
import logging
import os
import re
import secrets
import sqlite3
import subprocess
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import fitz
from flask import Flask, Response, abort, flash, jsonify, redirect, render_template, request, send_from_directory, url_for
from pypdf import PdfReader

from fir_scraper import FIRScraper, build_cookies_from_env, DEFAULT_COOKIES, DEFAULT_HEADERS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FIRApp")


def _highlight_matches(text: str, query: str) -> str:
    escaped_text = html.escape(text)
    if not query:
        return escaped_text
    escaped_query = html.escape(query)
    pattern = re.compile(re.escape(escaped_query), re.IGNORECASE)
    return pattern.sub(
        lambda m: f"<span class='highlight'>{m.group(0)}</span>",
        escaped_text
    )


app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY") or secrets.token_hex(32)
if not os.getenv("FLASK_SECRET_KEY"):
    logger.warning(
        "FLASK_SECRET_KEY not set — using a random secret for this process "
        "(sessions won't survive a restart). Set FLASK_SECRET_KEY in .env for a stable secret."
    )

BASE_DIR = Path(__file__).resolve().parent
PDF_DIR = BASE_DIR / "pdfs"
TEMPLATE_DIR = BASE_DIR / "templates"
CACHE_FILE = BASE_DIR / ".pdf_cache.json"
DB_FILE = BASE_DIR / "fir_cache.db"
app.template_folder = str(TEMPLATE_DIR)

# --- Station Registry & District Map ---
STATION_MAP: dict[str, str] = {
    "717": "Madbool Station (717)",
    "718": "Kalagi Station (718)",
    "2256": "Cybercrime Station (2256)",
}

STATION_DISTRICT_MAP: dict[str, str] = {
    "717": "23",
    "718": "23",
    "2256": "24",
}


class ScrapeProgressTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.reset()

    def reset(self) -> None:
        with self._lock:
            self.status = "idle"
            self.station_id = ""
            self.station_name = ""
            self.start_fir = 0
            self.end_fir = 0
            self.current_fir = 0
            self.scanned_count = 0
            self.total_scanned = 0
            self.found_count = 0
            self.downloaded_count = 0
            self.total_download = 0
            self.progress_percent = 0
            self.message = "Idle"
            self.logs: list[str] = []
            self.error: str | None = None
            self.updated_at = datetime.now(UTC).isoformat()

    def start_job(self, station_id: str, station_name: str, start_fir: int, end_fir: int) -> None:
        with self._lock:
            self.status = "scanning"
            self.station_id = station_id
            self.station_name = station_name
            self.start_fir = start_fir
            self.end_fir = end_fir
            self.current_fir = start_fir
            self.scanned_count = 0
            self.total_scanned = max(1, end_fir - start_fir + 1)
            self.found_count = 0
            self.downloaded_count = 0
            self.total_download = 0
            self.progress_percent = 0
            self.message = f"Starting scan for {station_name} (#{start_fir:04d} → #{end_fir:04d})..."
            self.logs = [f"🚀 Started extraction for {station_name} (#{start_fir:04d} to #{end_fir:04d})"]
            self.error = None
            self.updated_at = datetime.now(UTC).isoformat()

    def update_scan_progress(self, info: dict[str, Any]) -> None:
        with self._lock:
            self.status = "scanning"
            self.current_fir = info.get("current_fir", self.current_fir)
            step = info.get("step", 1)
            total = info.get("total", self.total_scanned)
            self.scanned_count = step
            counts = info.get("counts", {})
            self.found_count = counts.get("found", self.found_count)
            self.progress_percent = min(70, int((step / total) * 70))
            msg = info.get("message", f"Scanning FIR #{info.get('fir_str', '')}...")
            self.message = msg
            self.logs.append(msg)
            if len(self.logs) > 40:
                self.logs = self.logs[-40:]
            self.updated_at = datetime.now(UTC).isoformat()

    def start_download_phase(self, total_links: int) -> None:
        with self._lock:
            self.status = "downloading"
            self.total_download = total_links
            self.downloaded_count = 0
            self.progress_percent = 70
            msg = f"📥 Found {total_links} matching PDF(s). Downloading files..."
            self.message = msg
            self.logs.append(msg)
            self.updated_at = datetime.now(UTC).isoformat()

    def update_download_progress(self, info: dict[str, Any]) -> None:
        with self._lock:
            self.status = "downloading"
            idx = info.get("current_idx", 1)
            total = info.get("total_links", max(1, self.total_download))
            self.downloaded_count = idx
            self.progress_percent = min(90, 70 + int((idx / total) * 20))
            msg = info.get("message", f"Downloading PDF #{info.get('fir_str', '')}...")
            self.message = msg
            self.logs.append(msg)
            if len(self.logs) > 40:
                self.logs = self.logs[-40:]
            self.updated_at = datetime.now(UTC).isoformat()

    def start_indexing_phase(self) -> None:
        with self._lock:
            self.status = "indexing"
            self.progress_percent = 92
            msg = "🧠 Indexing downloaded FIR PDFs into SQLite + FTS5 full-text database..."
            self.message = msg
            self.logs.append(msg)
            self.updated_at = datetime.now(UTC).isoformat()

    def complete_job(self, new_count: int) -> None:
        with self._lock:
            self.status = "completed"
            self.progress_percent = 100
            msg = f"✅ Finished! Downloaded & indexed {new_count} new FIR document(s)."
            self.message = msg
            self.logs.append(msg)
            self.updated_at = datetime.now(UTC).isoformat()
        # Auto-reset to idle after 8s so subsequent page loads don't re-trigger the redirect
        threading.Timer(8.0, self.reset).start()

    def fail_job(self, error_msg: str) -> None:
        with self._lock:
            self.status = "failed"
            self.error = error_msg
            msg = f"❌ Extraction error: {error_msg}"
            self.message = msg
            self.logs.append(msg)
            self.updated_at = datetime.now(UTC).isoformat()
        # Auto-reset to idle after 15s so the error banner clears
        threading.Timer(15.0, self.reset).start()

    def to_dict(self) -> dict[str, Any]:
        with self._lock:
            return {
                "status": self.status,
                "station_id": self.station_id,
                "station_name": self.station_name,
                "start_fir": self.start_fir,
                "end_fir": self.end_fir,
                "current_fir": self.current_fir,
                "scanned_count": self.scanned_count,
                "total_scanned": self.total_scanned,
                "found_count": self.found_count,
                "downloaded_count": self.downloaded_count,
                "total_download": self.total_download,
                "progress_percent": self.progress_percent,
                "message": self.message,
                "logs": list(self.logs),
                "error": self.error,
                "updated_at": self.updated_at,
            }


progress_tracker = ScrapeProgressTracker()



def _get_station_from_filename(filename: str) -> tuple[str, str]:
    """Extract station_id and station_name from a PDF filename.

    Supports patterns: fir_ps718_0001.pdf -> ('718', 'Kalagi Station (718)')
    Falls back to ('unknown', 'Unknown Station') for unrecognised filenames.
    Legacy files like fir_0025.pdf map to station '717'.
    """
    # New naming convention: fir_ps{id}_{num}.pdf
    match = re.match(r"fir_ps(\d+)_", filename, re.IGNORECASE)
    if match:
        sid = match.group(1)
        name = STATION_MAP.get(sid, f"Station {sid}")
        return sid, name
    # Legacy naming: fir_{num}.pdf -> treat as station 717
    if re.match(r"fir_\d+\.pdf", filename, re.IGNORECASE):
        return "717", STATION_MAP.get("717", "Madbool Station (717)")
    return "unknown", "Unknown Station"

from contextlib import contextmanager


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _init_db() -> None:
    with get_db() as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS fir_documents (
                filename TEXT PRIMARY KEY,
                mtime INTEGER,
                size INTEGER,
                station_id TEXT,
                station_name TEXT,
                complaint_date TEXT,
                parsed_date TEXT,
                location TEXT,
                tq TEXT,
                complainant_name TEXT,
                complainant_address TEXT,
                accused_name TEXT,
                accused_address TEXT,
                victim_name TEXT,
                victim_address TEXT,
                pages INTEGER,
                size_mb REAL,
                ocr_used INTEGER,
                ocr_status TEXT,
                summary TEXT,
                plain_summary TEXT,
                acts_sections TEXT,
                data_json TEXT
            );
        """)
        # Migration: Add acts_sections column if missing in legacy SQLite tables
        try:
            conn.execute("ALTER TABLE fir_documents ADD COLUMN acts_sections TEXT;")
        except sqlite3.OperationalError:
            pass  # Column already exists

        # Recreate FTS virtual table if acts_sections column was missing
        try:
            conn.execute("SELECT acts_sections FROM fir_fts LIMIT 1;")
        except sqlite3.OperationalError:
            conn.execute("DROP TABLE IF EXISTS fir_fts;")

        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS fir_fts USING fts5(
                filename UNINDEXED,
                full_text,
                summary,
                location,
                complainant_name,
                complainant_address,
                acts_sections,
                keywords
            );
        """)
    _migrate_json_to_sqlite()


def _migrate_json_to_sqlite() -> None:
    if not CACHE_FILE.exists():
        return
    logger.info("Migrating .pdf_cache.json to SQLite database (fir_cache.db)...")
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            old_cache = json.load(f)
        for key, entry in old_cache.items():
            data = entry.get("data")
            if isinstance(data, dict):
                mtime = int(entry.get("mtime", 0))
                size = int(entry.get("size", 0))
                _save_record_to_db(data, mtime, size)
        bak_file = CACHE_FILE.with_suffix(".json.bak")
        CACHE_FILE.rename(bak_file)
        logger.info("Successfully imported cache to SQLite database. Archived .pdf_cache.json -> .pdf_cache.json.bak")
    except Exception as exc:
        logger.warning("Error migrating .pdf_cache.json: %s", exc)


def _save_record_to_db(data: dict[str, Any], mtime: int, size: int) -> None:
    filename = data.get("name", "")
    if not filename:
        return
    parsed_dt = _parse_date_value(str(data.get("complaint_date", "")))
    parsed_date_iso = parsed_dt.isoformat() if parsed_dt else ""

    data_json_str = json.dumps(data, ensure_ascii=False)
    keywords_str = " ".join(data.get("keywords", []))

    with get_db() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO fir_documents (
                filename, mtime, size, station_id, station_name,
                complaint_date, parsed_date, location, tq,
                complainant_name, complainant_address, accused_name,
                accused_address, victim_name, victim_address,
                pages, size_mb, ocr_used, ocr_status, summary,
                plain_summary, acts_sections, data_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            filename, mtime, size,
            data.get("station_id", ""), data.get("station_name", ""),
            data.get("complaint_date", ""), parsed_date_iso,
            data.get("location", ""), data.get("tq", ""),
            data.get("complainant_name", ""), data.get("complainant_address", ""),
            data.get("accused_name", ""), data.get("accused_address", ""),
            data.get("victim_name", ""), data.get("victim_address", ""),
            data.get("pages", 0), data.get("size_mb", 0.0),
            1 if data.get("ocr_used") else 0, data.get("ocr_status", ""),
            data.get("summary", ""), data.get("plain_summary", ""),
            data.get("acts_sections", ""),
            data_json_str
        ))

        conn.execute("DELETE FROM fir_fts WHERE filename = ?;", (filename,))
        conn.execute("""
            INSERT INTO fir_fts (
                filename, full_text, summary, location,
                complainant_name, complainant_address, acts_sections, keywords
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            filename, data.get("text", ""), data.get("summary", ""),
            data.get("location", ""), data.get("complainant_name", ""),
            data.get("complainant_address", ""), data.get("acts_sections", ""),
            keywords_str
        ))



def _extract_acts_and_sections(text: str) -> str:
    """Extract Act and Section codes (IPC, BNS, IT Act, etc.) from PDF text."""
    pat = r"(?:2\.\s*(?:ಕಾಯ್ದೆ\s*ಮತ್ತು\s*ಕಲಂಗಳು|act[s]?\s*(?:and|&)\s*section[s]?|act[s]?\s*[:\-]))\s*[:\-]?\s*(.+?)(?=\s*3\.\s*|\n\s*3\.|\n\s*\(a\)|\n\s*ಕೃತ್ಯ|$)"
    match = re.search(pat, text, re.IGNORECASE | re.DOTALL)
    if match:
        cleaned = re.sub(r"\s+", " ", match.group(1)).strip(" .,:;")
        cleaned = re.sub(r"\s*3\..*$", "", cleaned, flags=re.IGNORECASE).strip()
        if cleaned:
            return cleaned

    acts = re.findall(
        r"\b(?:IPC|BNS|IT\s+ACT|INDIAN\s+PENAL\s+CODE|BHARATIYA\s+NYAYA\s+SANHITA|INFORMATION\s+TECHNOLOGY\s+ACT|MOTOR\s+VEHICLES\s+ACT|KARNATAKA\s+POLICE\s+ACT)[^\n;]*",
        text,
        re.IGNORECASE
    )
    if acts:
        return "; ".join(dict.fromkeys(a.strip() for a in acts[:3]))
    return "Not specified"


def _extract_keywords(text: str, limit: int = 10) -> list[str]:
    words = re.findall(r"[A-Za-z\u0C80-\u0CFF]{3,}", text)
    freq: dict[str, int] = {}
    stopwords = {
        "the", "and", "for", "that", "with", "this", "from", "have",
        "were", "will", "your", "http", "https"
    }
    for word in words:
        w_lower = word.lower()
        if w_lower in stopwords:
            continue
        freq[w_lower] = freq.get(w_lower, 0) + 1
    sorted_items = sorted(freq.items(), key=lambda item: (-item[1], item[0]))
    return [word for word, _ in sorted_items[:limit]]


def _parse_summary_fields(summary_text: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in summary_text.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower().replace(" ", "_")
        val_str = value.strip()
        if key and val_str:
            fields[key] = val_str
    return fields


def _extract_tq(value: str) -> str:
    if not value:
        return ""
    match = re.search(
        r"\btq\s*[:\-]?\s*([a-z\u0C80-\u0CFF]+)", value, re.IGNORECASE
    )
    if match:
        return match.group(1).strip().lower()
    return ""


def _extract_complaint_date(text: str) -> str:
    norm = re.sub(r"ದಿನ\s*ಾ?\s*ಂ?\s*ಂಕ", "ದಿನಾಂಕ", text)
    patterns = [
        (
            r"(?:ಪ್ರ\.ವ\.ವ\.\s*|FIR\s+|complaint\s+)?"
            r"ದಿನಾ[ಂ೦ಅ]ಕ\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
        ),
        (
            r"(?:fir\s+date|complaint\s+date|date)\s*[:\-]?\s*"
            r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
        ),
        (
            r"(?:sworn\s+on|d\.o\.o|do\.o)\s*[:\-]?\s*"
            r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
        ),
    ]
    for pattern in patterns:
        match = re.search(pattern, norm, re.IGNORECASE)
        if match:
            return match.group(1)

    matches = re.findall(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b", norm)
    if matches:
        return matches[0]
    return ""


def _parse_date_value(value: str) -> datetime | None:
    if not value:
        return None
    fmts = (
        "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y", "%Y/%m/%d", "%Y-%m-%d"
    )
    for fmt in fmts:
        try:
            dt = datetime.strptime(value, fmt)  # noqa: DTZ007
            return dt.replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


_init_db()

# Sync any PDFs on disk that aren't yet in the DB (runs in background at startup)
def _startup_sync() -> None:
    try:
        n = sync_all_pdfs(force=True)
        if n:
            logger.info("Startup sync: indexed %d new PDF(s) from disk.", n)
    except Exception as exc:
        logger.warning("Startup sync error: %s", exc)


def _clean_summary_val(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value or "").strip(" .,:;")
    cleaned = re.sub(r"\(.*?\)", "", cleaned)
    cleaned = re.sub(
        r"(?:ತಂದೆ/ಗಂಡನ\s*ಹೆಸರು|Father's/Husband's\s*Name).*$",
        "",
        cleaned,
        flags=re.IGNORECASE
    )
    cleaned = re.sub(r"\s*,\s*0$", "", cleaned)
    cleaned = re.sub(
        r"^Date of Issue\s*:?\s*", "", cleaned, flags=re.IGNORECASE
    )
    return cleaned.strip(" .,:;")


def _generate_plain_summary(text: str) -> str:
    if not text.strip():
        return (
            "Complainant Name: Not clearly found\n"
            "Complainant Address: Not clearly found\n"
            "Accused Name: Not clearly found\n"
            "Accused Address: Not clearly found\n"
            "Victim Name: Not clearly found\n"
            "Victim Address: Not clearly found\n"
            "Place of Incident: Not clearly found"
        )

    norm_single = re.sub(r"\s+", " ", text)
    norm = text
    norm = re.sub(r"ದಿನ\s*ಾ?\s*ಂ?\s*ಂಕ", "ದಿನಾಂಕ", norm)
    norm = re.sub(r"ಸಾರ\s*ಾ?\s*ಂ?\s*ಂಶ", "ಸಾರಾಂಶ", norm)

    complainant_name = ""
    complainant_address = ""
    accused_name = ""
    accused_address = ""
    victim_name = ""
    victim_address = ""
    place = ""

    comp_pat = (
        r"Complainant/Informant\s*:\s*([A-Za-z\u0C80-\u0CFF\s\.\,\@]+?)"
        r"(?=\s*(?:\([a-z]\)|Father|\(g\)|\(e\)|\(b\)|\(c\)|\(d\)|\(f\)|\(h\)"
        r"|\(i\)|\(j\)|\(k\)|$))"
    )
    comp_match = re.search(comp_pat, norm_single, re.IGNORECASE)
    if comp_match:
        complainant_name = _clean_summary_val(comp_match.group(1))

    if not complainant_name or complainant_name == "Not clearly found":
        comp_pat2 = (
            r"(?:5\.\s*(?:ಪಿರ್ಯಾದುದಾರ|complainant)|complainant/informant)"
            r".*?\(a\)\s*(?:ಹೆಸರು|name)\s*[:\-]?\s*(.+?)"
            r"(?=\n\s*(?:ತಂದೆ|Father|\([b-z]\)|\(k\)|\n\s*[b-z]\.)|$)"
        )
        comp_match = re.search(comp_pat2, norm, re.IGNORECASE | re.DOTALL)
        if comp_match:
            complainant_name = _clean_summary_val(comp_match.group(1))

    if not complainant_name or complainant_name == "Not clearly found":
        cpc_match = re.search(
            r"(?:ಶ್ರೀ|Sri)\s+([A-Za-z\u0C80-\u0CFF\s]+"
            r"(?:CPC|cpc|PSI|psi)[^\n,]*)",
            norm,
            re.IGNORECASE
        )
        if cpc_match:
            complainant_name = _clean_summary_val(cpc_match.group(1))

    addr_pat = (
        r"Passport\s+No\.?\s*(?:Date\s+of\s+Issue\s*:?)?\s*"
        r"([A-Za-z0-9\u0C80-\u0CFF\s\.\,\(\)\-\/]+?)"
        r"(?=\s*\(k\)\s*Address|\s*\(l\)|\s*\(m\)|\(l\)|\(m\)|$)"
    )
    comp_addr_match = re.search(addr_pat, norm_single, re.IGNORECASE)
    cleaned_addr = (
        _clean_summary_val(comp_addr_match.group(1))
        if comp_addr_match
        else ""
    )
    if comp_addr_match and len(cleaned_addr) > 3:
        complainant_address = cleaned_addr

    if not complainant_address:
        addr_pat2 = (
            r"(?:5\.\s*(?:ಪಿರ್ಯಾದುದಾರ|complainant)|complainant/informant)"
            r".*?\(k\)\s*(?:ವಿಳಾಸ|address)\s*[:\-]?\s*(.+?)"
            r"(?=\n\s*\(l\)|\(l\)|6\.|\n\s*6\.|$)"
        )
        comp_addr_match = re.search(addr_pat2, norm, re.IGNORECASE | re.DOTALL)
        if comp_addr_match:
            complainant_address = _clean_summary_val(comp_addr_match.group(1))

    place_pat = (
        r"(?:4\.\s*\(a\)\s*(?:ಕೃತ್ಯ\s+ನಡೆದ\s+ಸ್ಥಳ|"
        r"place\s+of\s+occur?rence\s+with\s+full\s+address|"
        r"place\s+of\s+occur?rence|place\s+of\s+incident))\s*[:\-]?\s*(.+?)"
        r"(?=\n\s*\([b-z]\)|\([b-z]\)|5\.|\n\s*5\.|$)"
    )
    place_match = re.search(place_pat, norm, re.IGNORECASE | re.DOTALL)
    if place_match:
        place = _clean_summary_val(place_match.group(1))

    if not place or place == "Not clearly found":
        place_pat2 = (
            r"Place of occurence with full address\s*(.+?)"
            r"(?=\s*\(b\)\s*Distance|\s*\(c\)|\s*5\.|$)"
        )
        place_match = re.search(place_pat2, norm_single, re.IGNORECASE)
        if place_match:
            place = _clean_summary_val(place_match.group(1))

    if not place or place == "Not clearly found":
        near_match = re.search(
            r"(?:near|ಸಮೀಪ)\s+(.+?)(?=\s*\(b\)|\s*\(c\)|\s*village|$)",
            norm_single,
            re.IGNORECASE
        )
        if near_match:
            place = _clean_summary_val(near_match.group(1))

    accused_pat = (
        r"(?:6\.\s*(?:ಗೊತ್ತಿರುವ/ಅನುಮಾನಿತ|ಶಂಕಿತ\s*/\s*ಆರೋಪಿತರ|"
        r"details\s+of\s+known/suspected/unknown\s+accused)).*?"
        r"(?=\n\s*[78]\.|\n\s*details\s+of\s+victims|"
        r"particulars\s+of\s+property|10\.\s*f\.i\.r|$)"
    )
    accused_section = re.search(
        accused_pat, norm, re.IGNORECASE | re.DOTALL
    )
    if accused_section:
        accused_text = accused_section.group(0)
        unk_pat = r"unknown|thieves|ಅಪರಿಚಿತ|ತಿಳಿದು\s*ಬಂದಿಲ್ಲ"
        if re.search(unk_pat, accused_text, re.IGNORECASE):
            accused_name = "Unknown / ಅಪರಿಚಿತ"
        else:
            acc_name_pat = (
                r"(?:1\s+|^6\..*?\n\s*)"
                r"([A-Za-z0-9\u0C80-\u0CFF\s/\(\)\.\,]+?)"
                r"(?=\n\s*(?:Male|Female|Adult|Accused|\d+\.|$))"
            )
            acc_name_match = re.search(
                acc_name_pat, accused_text, re.IGNORECASE | re.MULTILINE
            )
            if acc_name_match:
                accused_name = _clean_summary_val(acc_name_match.group(1))
                if len(accused_name) > 150:
                    accused_name = accused_name[:150] + "..."

    if not accused_name:
        acc_sec2_pat = (
            r"details of known/suspected/unknown accused.*?"
            r"(?=details of victims|particulars of property|"
            r"10\. f\.i\.r contents)"
        )
        acc_sec2 = re.search(acc_sec2_pat, norm, re.IGNORECASE | re.DOTALL)
        if acc_sec2:
            acc_text2 = acc_sec2.group(0)
            if re.search(r"unknown|thieves", acc_text2, re.IGNORECASE):
                accused_name = "Unknown"

    victim_pat = (
        r"(?:7\.\s*(?:ನೊಂದವರ|ಸಂತ್ರಸ್ತರ|details\s+of\s+victims)).*?"
        r"(?=\n\s*[89]\.|\n\s*particulars\s+of\s+property|10\.\s*f\.i\.r|$)"
    )
    victim_section = re.search(victim_pat, norm, re.IGNORECASE | re.DOTALL)
    if victim_section:
        victim_text = victim_section.group(0)
        v_name_pat = r"sl\.no\.\s*1\s*(.+?)(?=\s+(?:male|female|unknown)\s+)"
        victim_name_match = re.search(
            v_name_pat, victim_text, re.IGNORECASE | re.DOTALL
        )
        if victim_name_match:
            victim_name = _clean_summary_val(victim_name_match.group(1))
        else:
            v_match = re.search(
                r"(?:1\s+|^7\..*?\n\s*)([A-Za-z0-9\u0C80-\u0CFF\s/\(\)\.\,]+?)"
                r"(?=\n\s*(?:Male|Female|Adult|\d+\.|$))",
                victim_text,
                re.IGNORECASE
            )
            if v_match:
                victim_name = _clean_summary_val(v_match.group(1))

    return "\n".join([
        f"Complainant Name: {complainant_name or 'Not clearly found'}",
        f"Complainant Address: {complainant_address or 'Not clearly found'}",
        f"Accused Name: {accused_name or 'Not clearly found'}",
        f"Accused Address: {accused_address or 'Not clearly found'}",
        f"Victim Name: {victim_name or 'Not clearly found'}",
        f"Victim Address: {victim_address or 'Not clearly found'}",
        f"Place of Incident: {place or 'Not clearly found'}",
    ])


def _should_use_ocr(text: str) -> bool:
    cleaned = text.strip()
    if not cleaned or len(cleaned) < 50:
        return True
    return cleaned.count("\x00") > 2 or cleaned.count("") > 5


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"([\u0C80-\u0CFF])\1+", r"\1", text)
    paragraphs = []
    for paragraph in re.split(r"\n\s*\n", text.strip()):
        cleaned = re.sub(r"\s+", " ", paragraph).strip()
        if cleaned:
            paragraphs.append(cleaned)
    return "\n\n".join(paragraphs)


def _extract_with_pdftotext(pdf_path: Path) -> tuple[str, str]:
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf_path), "-"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
    except FileNotFoundError:
        return "", "pdftotext not available"
    if result.returncode != 0:
        err_msg = result.stderr.strip() or "unknown error"
        return "", f"pdftotext failed: {err_msg}"
    text = _normalize_text(result.stdout)
    if len(text.strip()) < 30:
        return "", "pdftotext returned insufficient text"
    return text, "Extracted via pdftotext"


def _ocr_pdf(pdf_path: Path) -> tuple[str, str]:
    try:
        import pytesseract
        from pdf2image import convert_from_path
    except ImportError as exc:
        return "", f"OCR dependencies unavailable: {exc}"

    poppler_path = None
    brew_prefix = os.environ.get("HOMEBREW_PREFIX")
    if brew_prefix:
        candidate = Path(brew_prefix) / "bin"
        if (candidate / "pdftoppm").exists():
            poppler_path = str(candidate)
    if not poppler_path:
        for candidate in [Path("/opt/homebrew/bin"), Path("/usr/local/bin")]:
            if (candidate / "pdftoppm").exists():
                poppler_path = str(candidate)
                break

    try:
        images = (
            convert_from_path(
                str(pdf_path), dpi=150, poppler_path=poppler_path
            )
            if poppler_path
            else convert_from_path(str(pdf_path), dpi=150)
        )
    except Exception as exc:
        return "", f"OCR conversion unavailable/failed: {exc}"

    for lang in ["kan+eng", "kan", "eng"]:
        try:
            raw_chunks = [
                pytesseract.image_to_string(image, lang=lang)
                for image in images
            ]
            text_chunks = [c for c in raw_chunks if isinstance(c, str)]
            full_text = "\n\n".join(
                chunk.strip() for chunk in text_chunks if chunk.strip()
            )
            if full_text:
                normalized = _normalize_text(full_text)
                if len(normalized.strip()) >= 30:
                    msg = (
                        "OCR text extracted successfully "
                        "using language model: "
                        f"{lang}."
                    )
                    return normalized, msg
        except (pytesseract.TesseractError, RuntimeError) as exc:
            logger.debug("OCR pass failed for lang %s: %s", lang, exc)
            continue
    return "", "OCR completed but no readable text was detected."


def _read_pdf_info(pdf_path: Path) -> dict[str, Any]:
    ocr_used = False
    ocr_status = ""
    pages_list: list[Any] = []

    try:
        with fitz.open(pdf_path) as doc:
            pages_list = [p for p in doc]
            text_chunks = [page.get_text() or "" for page in pages_list]
            full_text = _normalize_text("\n\n".join(text_chunks).strip())
    except (fitz.FileDataError, OSError) as exc:
        full_text = ""
        ocr_status = f"PyMuPDF extraction failed: {exc}"
        pages_list = []
    else:
        ocr_used = False
        ocr_status = "Extracted via PyMuPDF"

    if not full_text or _should_use_ocr(full_text):
        pdftotext_text, pdftotext_status = _extract_with_pdftotext(pdf_path)
        if pdftotext_text:
            full_text = _normalize_text(pdftotext_text)
            ocr_used = False
            ocr_status = pdftotext_status
        else:
            ocr_text, ocr_status = _ocr_pdf(pdf_path)
            if ocr_text:
                full_text = _normalize_text(ocr_text)
                ocr_used = True
            else:
                ocr_used = False

    if not pages_list:
        try:
            reader = PdfReader(str(pdf_path))
            pages_list = [p for p in reader.pages]
        except (ValueError, TypeError, OSError):
            pages_list = []

    paragraphs = [p for p in full_text.split("\n\n") if p.strip()]
    summary = " ".join(paragraphs[:3])[:1200]
    metadata: dict[str, str] = {}
    try:
        raw_meta = PdfReader(str(pdf_path)).metadata
        if raw_meta:
            metadata = {
                str(key): str(value) for key, value in raw_meta.items()
            }
    except (ValueError, TypeError, OSError) as exc:
        logger.debug("Could not read PDF metadata: %s", exc)

    keywords = _extract_keywords(full_text)
    plain_summary = _generate_plain_summary(full_text)
    summary_fields = _parse_summary_fields(plain_summary)
    complaint_date = _extract_complaint_date(full_text)
    acts_sections = _extract_acts_and_sections(full_text)

    tq_text = (
        f"{summary_fields.get('place_of_incident', '')} "
        f"{summary_fields.get('complainant_address', '')} {full_text}"
    )

    station_id, station_name = _get_station_from_filename(pdf_path.name)

    return {
        "name": pdf_path.name,
        "path": pdf_path.name,
        "size_mb": round(pdf_path.stat().st_size / (1024 * 1024), 2),
        "pages": len(pages_list),
        "summary": summary,
        "text": full_text,
        "paragraphs": paragraphs,
        "metadata": metadata,
        "keywords": keywords,
        "plain_summary": plain_summary,
        "summary_fields": summary_fields,
        "location": summary_fields.get("place_of_incident", ""),
        "complainant_name": summary_fields.get("complainant_name", ""),
        "complainant_address": summary_fields.get("complainant_address", ""),
        "accused_name": summary_fields.get("accused_name", ""),
        "accused_address": summary_fields.get("accused_address", ""),
        "victim_name": summary_fields.get("victim_name", ""),
        "victim_address": summary_fields.get("victim_address", ""),
        "complaint_date": complaint_date,
        "tq": _extract_tq(tq_text),
        "ocr_used": ocr_used,
        "ocr_status": ocr_status,
        "station_id": station_id,
        "station_name": station_name,
        "acts_sections": acts_sections,
    }


def get_pdf_info_cached(pdf_path: Path) -> dict[str, Any]:
    try:
        stat = pdf_path.stat()
        mtime = int(stat.st_mtime)
        size = stat.st_size
    except OSError:
        return _read_pdf_info(pdf_path)

    key = pdf_path.name
    with get_db() as conn:
        row = conn.execute(
            "SELECT mtime, size, data_json FROM fir_documents WHERE filename = ?;", (key,)
        ).fetchone()
        if row:
            if row["mtime"] == mtime and row["size"] == size:
                try:
                    data = json.loads(row["data_json"])
                    if isinstance(data, dict) and "acts_sections" in data:
                        return data
                except Exception:
                    pass

    data = _read_pdf_info(pdf_path)
    _save_record_to_db(data, mtime, size)
    return data


def _extract_fir_number_from_filename(filename: str) -> int | None:
    """Extract integer FIR number from filename (e.g. fir_ps718_0005.pdf -> 5)."""
    match = re.search(r"(\d+)\.pdf$", filename, re.IGNORECASE)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            return None
    return None


_LAST_SYNC_TIME = 0.0

def sync_all_pdfs(force: bool = False) -> int:
    """Sync any PDF files on disk that are not yet in the SQLite DB."""
    global _LAST_SYNC_TIME
    now = time.time()
    if not force and (now - _LAST_SYNC_TIME) < 30.0:
        return 0
    _LAST_SYNC_TIME = now

    if not PDF_DIR.exists():
        return 0

    # Only process PDFs that are not already in the DB (avoid re-parsing everything)
    pdf_paths = list(PDF_DIR.glob("*.pdf"))
    with get_db() as conn:
        existing = {r[0] for r in conn.execute("SELECT filename FROM fir_documents;").fetchall()}

    count = 0
    for pdf_path in pdf_paths:
        if pdf_path.name in existing:
            continue  # Already indexed — skip
        try:
            get_pdf_info_cached(pdf_path)
            count += 1
        except Exception as exc:
            logger.warning("Skipping unparseable PDF %s: %s", pdf_path.name, exc)
    return count


def _parse_date_to_sort_key(date_str: str) -> str:
    """Convert DD/MM/YYYY date to YYYY-MM-DD for accurate chronological sorting."""
    if not date_str:
        return ""
    parts = date_str.strip().split("/")
    if len(parts) == 3:
        d, m, y = parts[0].zfill(2), parts[1].zfill(2), parts[2]
        return f"{y}-{m}-{d}"
    return date_str


def list_pdfs(
    query: str = "",
    tq: str = "",
    date_order: str = "fir_desc",
    station_id: str = "",
    start_fir: int | None = None,
    end_fir: int | None = None,
) -> list[dict[str, Any]]:
    # Don't call sync_all_pdfs() here — it's slow and blocks the request.
    # PDFs are indexed immediately after download by the worker thread.
    if not PDF_DIR.exists():
        return []

    query_str = query.strip()
    tq_filter = tq.strip().lower()
    sid_filter = station_id.strip().lower()

    params: list[Any] = []
    where_clauses: list[str] = []

    if sid_filter and sid_filter != "all":
        where_clauses.append("d.station_id = ?")
        params.append(sid_filter)

    if tq_filter:
        where_clauses.append("(LOWER(d.tq) LIKE ? OR LOWER(d.location) LIKE ?)")
        params.append(f"%{tq_filter}%")
        params.append(f"%{tq_filter}%")

    if query_str:
        fts_matches: set[str] = set()
        with get_db() as conn:
            safe_q = re.sub(r"[^\w\s]", "", query_str).strip()
            if safe_q:
                try:
                    rows_fts = conn.execute(
                        "SELECT filename FROM fir_fts WHERE fir_fts MATCH ?;", (f"{safe_q}*",)
                    ).fetchall()
                    fts_matches.update(r["filename"] for r in rows_fts)
                except sqlite3.OperationalError:
                    pass

            like_q = f"%{query_str.lower()}%"
            rows_like = conn.execute("""
                SELECT filename FROM fir_documents
                WHERE LOWER(filename) LIKE ? OR LOWER(summary) LIKE ?
                   OR LOWER(complainant_name) LIKE ? OR LOWER(complainant_address) LIKE ?
                   OR LOWER(location) LIKE ? OR LOWER(acts_sections) LIKE ?;
            """, (like_q, like_q, like_q, like_q, like_q, like_q)).fetchall()
            fts_matches.update(r["filename"] for r in rows_like)

        if fts_matches:
            placeholders = ",".join("?" for _ in fts_matches)
            where_clauses.append(f"d.filename IN ({placeholders})")
            params.extend(fts_matches)
        else:
            return []

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    order_sql = (
        "ORDER BY (CASE WHEN d.parsed_date IS NULL OR d.parsed_date = '' THEN 1 ELSE 0 END), "
        "d.parsed_date DESC, d.filename ASC"
        if date_order == "newest"
        else "ORDER BY (CASE WHEN d.parsed_date IS NULL OR d.parsed_date = '' THEN 1 ELSE 0 END), "
             "d.parsed_date ASC, d.filename ASC"
    )

    sql = f"SELECT data_json FROM fir_documents d {where_sql} {order_sql};"

    records: list[dict[str, Any]] = []
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
        for r in rows:
            try:
                rec = json.loads(r["data_json"])
                filename = rec.get("name", "")
                if start_fir is not None or end_fir is not None:
                    fir_num = _extract_fir_number_from_filename(filename)
                    if fir_num is not None:
                        if start_fir is not None and fir_num < start_fir:
                            continue
                        if end_fir is not None and fir_num > end_fir:
                            continue
                records.append(rec)
            except Exception:
                pass

    def _get_fir_num(r: dict[str, Any]) -> int:
        num = _extract_fir_number_from_filename(r.get("name", ""))
        return num if num is not None else 999999

    def _get_iso_date(r: dict[str, Any]) -> str:
        return _parse_date_to_sort_key(r.get("parsed_date", ""))

    if date_order == "fir_asc":
        records.sort(key=lambda r: _get_fir_num(r))
    elif date_order == "newest":
        records.sort(key=lambda r: (_get_iso_date(r), -_get_fir_num(r)), reverse=True)
    elif date_order == "oldest":
        records.sort(key=lambda r: (_get_iso_date(r), _get_fir_num(r)))
    else:  # fir_desc (default)
        records.sort(key=lambda r: _get_fir_num(r), reverse=True)

    return records


def get_station_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    with get_db() as conn:
        rows = conn.execute(
            "SELECT station_id, COUNT(*) as cnt FROM fir_documents GROUP BY station_id;"
        ).fetchall()
        for r in rows:
            sid = r["station_id"] or "unknown"
            counts[sid] = r["cnt"]
    return counts


def get_station_stats() -> dict[str, dict[str, Any]]:
    """Calculate total saved count, highest FIR number, and unregistered FIR numbers per station."""
    stats: dict[str, dict[str, Any]] = {}
    for sid in STATION_MAP:
        recs = list_pdfs(station_id=sid, date_order="fir_asc")
        nums: list[int] = [
            num
            for r in recs
            if (num := _extract_fir_number_from_filename(r["name"])) is not None
        ]
        highest = max(nums) if nums else 0
        missing = [n for n in range(1, highest + 1) if n not in nums] if highest else []
        stats[sid] = {
            "count": len(recs),
            "highest": highest,
            "missing_count": len(missing),
            "missing_numbers": missing,
        }
    return stats


@app.route("/")
def index():
    query = request.args.get("q", "").strip()
    tq = request.args.get("tq", "").strip()
    date_order = request.args.get("date_order", "fir_desc").strip().lower()
    station_id = request.args.get("station_id", "").strip()

    start_fir_raw = request.args.get("start_fir", "").strip()
    end_fir_raw = request.args.get("end_fir", "").strip()

    start_fir = int(start_fir_raw) if start_fir_raw.isdigit() else None
    end_fir = int(end_fir_raw) if end_fir_raw.isdigit() else None

    records = list_pdfs(query, tq, date_order, station_id, start_fir, end_fir)
    station_counts = get_station_counts()
    station_stats = get_station_stats()
    highest_firs = get_highest_firs_summary()
    return render_template(
        "index.html",
        records=records,
        query=query,
        tq=tq,
        date_order=date_order,
        station_id=station_id,
        start_fir=start_fir,
        end_fir=end_fir,
        station_map=STATION_MAP,
        station_counts=station_counts,
        station_stats=station_stats,
        highest_firs=highest_firs,
    )


@app.route("/pdf/<path:filename>")
def pdf_detail(filename: str):
    pdf_path = (PDF_DIR / filename).resolve()
    if not pdf_path.is_relative_to(PDF_DIR.resolve()):
        abort(404)
    if not pdf_path.exists() or pdf_path.suffix.lower() != ".pdf":
        abort(404)

    query = request.args.get("q", "").strip()
    record = get_pdf_info_cached(pdf_path).copy()
    paras = record.get("paragraphs", [])
    para_list = paras if isinstance(paras, list) else []

    if query:
        highlighted_paragraphs = [
            _highlight_matches(str(para), query) for para in para_list
        ]
        record["highlighted_paragraphs"] = highlighted_paragraphs
    else:
        record["highlighted_paragraphs"] = [
            _highlight_matches(str(para), "") for para in para_list
        ]
    return render_template("detail.html", pdf=record, query=query)


@app.route("/download/<path:filename>")
def download_pdf(filename: str):
    pdf_path = PDF_DIR / filename
    if not pdf_path.exists() or pdf_path.suffix.lower() != ".pdf":
        abort(404)
    response = send_from_directory(PDF_DIR, pdf_path.name, as_attachment=False)
    response.headers["Content-Type"] = "application/pdf"
    response.headers["Content-Disposition"] = (
        f'inline; filename="{pdf_path.name}"'
    )
    return response


def _get_highest_fir_number(station_id: str) -> int:
    """Find the highest integer FIR number saved for a given station."""
    highest = 0
    with get_db() as conn:
        rows = conn.execute(
            "SELECT filename FROM fir_documents WHERE station_id = ? OR (station_id = 'unknown' AND filename LIKE 'fir_%');",
            (station_id,)
        ).fetchall()
        for r in rows:
            num = _extract_fir_number_from_filename(r["filename"])
            if num and num > highest:
                highest = num

    if PDF_DIR.exists():
        for p in PDF_DIR.glob("*.pdf"):
            sid, _ = _get_station_from_filename(p.name)
            if sid == station_id:
                num = _extract_fir_number_from_filename(p.name)
                if num and num > highest:
                    highest = num
    return highest


def get_highest_firs_summary() -> dict[str, int]:
    """Return dictionary mapping station_id to its highest saved FIR number."""
    summary: dict[str, int] = {}
    for sid in STATION_MAP:
        summary[sid] = _get_highest_fir_number(sid)
    return summary


def _get_missing_fir_numbers(station_id: str, start_fir: int, end_fir: int) -> tuple[list[int], list[int]]:
    """Check local pdfs directory and SQLite DB for existing FIRs.
    Returns (missing_firs, existing_firs).
    """
    existing: list[int] = []
    missing: list[int] = []

    for fir_num in range(start_fir, end_fir + 1):
        fir_str = str(fir_num).zfill(4)
        target_name = f"fir_ps{station_id}_{fir_str}.pdf"
        target_path = PDF_DIR / target_name

        legacy_name = f"fir_{fir_str}.pdf"
        legacy_path = PDF_DIR / legacy_name

        if target_path.exists():
            existing.append(fir_num)
        elif station_id == "717" and legacy_path.exists():
            existing.append(fir_num)
        else:
            with get_db() as conn:
                row = conn.execute(
                    "SELECT 1 FROM fir_documents WHERE filename = ? OR filename = ?;",
                    (target_name, legacy_name)
                ).fetchone()
                if row:
                    existing.append(fir_num)
                else:
                    missing.append(fir_num)

    return missing, existing


def _async_scrape_worker(
    url: str,
    headers: dict,
    cookies: dict,
    start_fir: int,
    end_fir: int,
    year: str,
    district_id: str,
    station_id: str,
    captcha: str,
    csrf_token: str,
    missing_firs: list[int],
) -> None:
    station_name = STATION_MAP.get(station_id, f"Station {station_id}")
    progress_tracker.start_job(station_id, station_name, start_fir, end_fir)
    logger.info("Background thread started for Station %s (FIRs %s..%s)", station_id, start_fir, end_fir)

    def scan_callback(info: dict[str, Any]) -> None:
        progress_tracker.update_scan_progress(info)

    def download_callback(info: dict[str, Any]) -> None:
        progress_tracker.update_download_progress(info)

    try:
        scraper = FIRScraper(url, headers=headers, cookies=cookies)
        links = scraper.scan_firs(
            start_fir=start_fir,
            end_fir=end_fir,
            year=year,
            district_id=district_id,
            ps_id=station_id,
            headers=headers,
            cookies=cookies,
            captcha_val=captcha,
            csrf_token=csrf_token,
            progress_callback=scan_callback,
        )
        if links:
            missing_str_set = {str(num).zfill(4) for num in missing_firs}
            target_links = [l for l in links if l[0] in missing_str_set]
            if target_links:
                progress_tracker.start_download_phase(len(target_links))
                scraper.download_pdfs(target_links, ps_id=station_id, progress_callback=download_callback)
                # Index each newly downloaded PDF immediately into SQLite
                progress_tracker.start_indexing_phase()
                indexed = 0
                for fir_str, _link in target_links:
                    # Reconstruct the expected filename the downloader would have saved
                    pdf_name = f"fir_ps{station_id}_{fir_str}.pdf"
                    pdf_path = PDF_DIR / pdf_name
                    if pdf_path.exists():
                        try:
                            get_pdf_info_cached(pdf_path)
                            indexed += 1
                        except Exception as exc:
                            logger.warning("Could not index %s: %s", pdf_name, exc)
                # Fallback: sync any remaining unindexed PDFs
                sync_all_pdfs(force=True)
                progress_tracker.complete_job(indexed or len(target_links))
                logger.info("Background scrape completed: downloaded & indexed %d new FIRs", indexed or len(target_links))
            else:
                progress_tracker.complete_job(0)
        else:
            progress_tracker.complete_job(0)
    except Exception as exc:
        logger.error("Background scrape thread error: %s", exc, exc_info=True)
        progress_tracker.fail_job(str(exc))


@app.route("/fetch_firs", methods=["POST", "GET"])
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

    # Launch background thread so UI responds INSTANTLY
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


@app.route("/extract_new_firs", methods=["POST", "GET"])
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


@app.route("/api/scrape_status")
def scrape_status():
    return jsonify(progress_tracker.to_dict())


@app.route("/api/scrape_progress")
def scrape_progress():
    def event_stream():
        terminal_statuses = {"idle", "completed", "failed"}
        while True:
            data = progress_tracker.to_dict()
            yield f"data: {json.dumps(data)}\n\n"
            if data.get("status") in terminal_statuses:
                # Send one final event then close the stream
                break
            time.sleep(1.0)

    return Response(event_stream(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def get_crime_type_badge(acts_str: str = "", text: str = "") -> str:
    acts_clean = (acts_str or "").upper()

    # Extract legal section segment after U/S, U/s, SECTION, SEC, or ಕಲಂ to prevent matching phone numbers or dates in text
    sec_match = re.search(
        r"(?:U/S|U/s|SECTION|SEC|ಕಲಂ|ಕಾಯ್ದೆ)\s*[:\-]?\s*([A-Za-z0-9\(\)\,\s/-]+)",
        acts_clean
    )
    sec_text = sec_match.group(1) if sec_match else acts_clean

    # 1. BNSS 126 / CrPC 107/151 -> Preventive action for Group Clash / Gang Fight
    if re.search(r"\b126\b|\b126\(|\b129\b|\b130\b|\b170\b|\b107\b|\b151\b", sec_text) and (
        "BNSS" in acts_clean or "CRPC" in acts_clean
    ):
        return "Gang Fight"

    # 2. Attempted Murder / Half Murder: BNS 109, IPC 307
    if re.search(r"\b109\b|\b109\(|\b307\b", sec_text):
        return "Half Murder"

    # 3. Murder: BNS 103, IPC 302
    if re.search(r"\b103\b|\b103\(|\b302\b", sec_text):
        return "Murder"

    # 4. Kidnapping: BNS 137, IPC 363, 364, 365, 366
    if re.search(r"\b137\b|\b137\(|\b363\b|\b364\b|\b365\b|\b366\b", sec_text):
        return "Kidnapping"

    # 5. Theft: BNS 303, 305, IPC 378, 379, 380, 381
    if re.search(r"\b303\b|\b303\(|\b305\b|\b305\(|\b378\b|\b379\b|\b380\b|\b381\b", sec_text):
        return "Theft"

    # 6. Accident: BNS 281, 106, IPC 279, 304A, MV Act 187, 184, 185
    if re.search(r"\b281\b|\b106\b|\b106\(|\b279\b|\b304A\b|\b187\b|\b184\b|\b185\b", sec_text):
        return "Accident"

    # 7. Gang Fight / Rioting / Unlawful Assembly: BNS 189, 190, 191, IPC 143, 147, 148, 149
    if re.search(r"\b189\b|\b190\b|\b191\b|\b143\b|\b147\b|\b148\b|\b149\b", sec_text):
        return "Gang Fight"

    # 8. Assault / Physical Fight: BNS 115, 117, 118, IPC 323, 324, 325, 326
    if re.search(r"\b115\b|\b117\b|\b118\b|\b323\b|\b324\b|\b325\b|\b326\b", sec_text):
        return "Assault / Fight"

    # 9. Cyber Scam / Fraud: IT Act 66C, 66D, BNS 318, 319, IPC 419, 420
    if re.search(r"\b66C\b|\b66D\b|\b318\b|\b319\b|\b419\b|\b420\b", sec_text) or "INFORMATION TECHNOLOGY" in acts_clean:
        return "Cyber Scam"

    # 10. Robbery / Dacoity: BNS 309, 310, IPC 392, 395
    if re.search(r"\b309\b|\b310\b|\b392\b|\b395\b", sec_text):
        return "Robbery"

    # 11. Land Dispute / Trespass: BNS 329, 331, IPC 447, 448, 451, 452
    if re.search(r"\b329\b|\b331\b|\b447\b|\b448\b|\b451\b|\b452\b", sec_text):
        return "Land Dispute / Trespass"

    # 12. Threats & Abuse: BNS 351, 352, 353, IPC 504, 506, 509
    if re.search(r"\b351\b|\b352\b|\b353\b|\b504\b|\b506\b|\b509\b", sec_text):
        return "Threats & Abuse"

    # 13. Excise / Illegal Liquor
    if "EXCISE" in acts_clean or "LIQUOR" in acts_clean or (re.search(r"\b32\b|\b34\b", sec_text) and "EXCISE" in acts_clean):
        return "Illegal Liquor"

    # 14. Gambling
    if "GAMBLING" in acts_clean or (re.search(r"\b78\b|\b87\b", sec_text) and "GAMBLING" in acts_clean):
        return "Gambling"

    # 15. Woman Harassment: BNS 74, 75, 76, 78, IPC 354, 354D
    if "POCSO" in acts_clean or (
        re.search(r"\b74\b|\b74\(|\b75\b|\b75\(|\b76\b|\b76\(|\b78\b|\b78\(|\b354\b|\b354D\b", sec_text)
        and ("BNS" in acts_clean or "IPC" in acts_clean or "WOMAN" in acts_clean)
    ):
        return "Woman Harassment"

    # 16. Domestic Cruelty: BNS 85, IPC 498A
    if re.search(r"\b85\b|\b85\(|\b498A\b", sec_text) and ("BNS" in acts_clean or "IPC" in acts_clean):
        return "Domestic Cruelty"

    return "General Offense"


@app.context_processor
def utility_processor():
    return dict(get_crime_type=get_crime_type_badge)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5002"))
    threading.Thread(target=_startup_sync, daemon=True).start()
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
