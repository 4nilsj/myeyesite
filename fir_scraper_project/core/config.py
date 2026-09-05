"""Configuration, constants, station registry, and string helpers."""

import html
import logging
import os
import re
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FIRApp")

BASE_DIR = Path(__file__).resolve().parent.parent
PDF_DIR = BASE_DIR / "pdfs"
TEMPLATE_DIR = BASE_DIR / "templates"
CACHE_FILE = BASE_DIR / ".pdf_cache.json"
DB_FILE = BASE_DIR / "fir_cache.db"
LOGS_DIR = BASE_DIR / "logs"

# Station Registry & District Map
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


def _get_station_from_filename(filename: str) -> tuple[str, str]:
    """Extract station_id and station_name from a PDF filename.

    Supports patterns: fir_ps718_0001.pdf -> ('718', 'Kalagi Station (718)')
    Falls back to ('unknown', 'Unknown Station') for unrecognised filenames.
    Legacy files like fir_0025.pdf map to station '717'.
    """
    match = re.match(r"fir_ps(\d+)_", filename, re.IGNORECASE)
    if match:
        sid = match.group(1)
        name = STATION_MAP.get(sid, f"Station {sid}")
        return sid, name
    if re.match(r"fir_\d+\.pdf", filename, re.IGNORECASE):
        return "717", STATION_MAP.get("717", "Madbool Station (717)")
    return "unknown", "Unknown Station"


def _extract_fir_number_from_filename(filename: str) -> int | None:
    """Extract integer FIR number from filename (e.g. fir_ps718_0005.pdf -> 5)."""
    match = re.search(r"(\d+)\.pdf$", filename, re.IGNORECASE)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            return None
    return None


def _parse_date_to_sort_key(date_str: str) -> str:
    """Convert DD/MM/YYYY date to YYYY-MM-DD for accurate chronological sorting."""
    if not date_str:
        return ""
    parts = date_str.strip().split("/")
    if len(parts) == 3:
        d, m, y = parts[0].zfill(2), parts[1].zfill(2), parts[2]
        return f"{y}-{m}-{d}"
    return date_str
