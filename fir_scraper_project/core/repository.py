"""Data access layer for high-performance querying, search, and station statistics."""

import json
import logging
import re
import sqlite3
from typing import Any

from core import config
from core.config import (
    STATION_MAP,
    _extract_fir_number_from_filename,
    _get_station_from_filename,
    _parse_date_to_sort_key,
)
from core.db import get_db

logger = logging.getLogger("FIRApp")


def list_pdfs(
    query: str = "",
    tq: str = "",
    date_order: str = "fir_desc",
    station_id: str = "",
    start_fir: int | None = None,
    end_fir: int | None = None,
) -> list[dict[str, Any]]:
    """Retrieve and filter FIR documents using indexed SQL queries and FTS5 search."""
    if not config.PDF_DIR.exists():
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

    if start_fir is not None:
        where_clauses.append("d.fir_num >= ?")
        params.append(start_fir)

    if end_fir is not None:
        where_clauses.append("d.fir_num <= ?")
        params.append(end_fir)

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

    if date_order == "fir_asc":
        order_sql = "ORDER BY d.fir_num ASC, d.filename ASC"
    elif date_order == "newest":
        order_sql = (
            "ORDER BY (CASE WHEN d.parsed_date IS NULL OR d.parsed_date = '' THEN 1 ELSE 0 END), "
            "d.parsed_date DESC, d.fir_num DESC, d.filename ASC"
        )
    elif date_order == "oldest":
        order_sql = (
            "ORDER BY (CASE WHEN d.parsed_date IS NULL OR d.parsed_date = '' THEN 1 ELSE 0 END), "
            "d.parsed_date ASC, d.fir_num ASC, d.filename ASC"
        )
    else:  # fir_desc (default)
        order_sql = "ORDER BY d.fir_num DESC, d.filename ASC"

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
    else:  # fir_desc
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


def _get_highest_fir_number(station_id: str) -> int:
    """Find the highest integer FIR number saved for a given station using indexed SQL."""
    highest = 0
    with get_db() as conn:
        if station_id == "717":
            row = conn.execute(
                "SELECT MAX(fir_num) FROM fir_documents WHERE station_id = '717' OR (station_id = 'unknown' AND filename LIKE 'fir_%');"
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT MAX(fir_num) FROM fir_documents WHERE station_id = ?;", (station_id,)
            ).fetchone()
        if row and row[0] is not None:
            highest = int(row[0])

    pdf_dir = config.PDF_DIR
    if pdf_dir.exists():
        for p in pdf_dir.glob("*.pdf"):
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
    """Check local pdfs directory and SQLite DB for existing FIRs via a single batch query.

    Returns (missing_firs, existing_firs).
    """
    pdf_dir = config.PDF_DIR
    disk_files = {p.name for p in pdf_dir.glob("*.pdf")} if pdf_dir.exists() else set()

    with get_db() as conn:
        if station_id == "717":
            rows = conn.execute("""
                SELECT fir_num, filename FROM fir_documents
                WHERE (station_id = '717' OR (station_id = 'unknown' AND filename LIKE 'fir_%'))
                  AND fir_num BETWEEN ? AND ?;
            """, (start_fir, end_fir)).fetchall()
        else:
            rows = conn.execute("""
                SELECT fir_num, filename FROM fir_documents
                WHERE station_id = ? AND fir_num BETWEEN ? AND ?;
            """, (station_id, start_fir, end_fir)).fetchall()
        db_nums = {r["fir_num"] for r in rows if r["fir_num"] is not None}

    existing: list[int] = []
    missing: list[int] = []

    for fir_num in range(start_fir, end_fir + 1):
        fir_str = str(fir_num).zfill(4)
        target_name = f"fir_ps{station_id}_{fir_str}.pdf"
        legacy_name = f"fir_{fir_str}.pdf"

        if target_name in disk_files:
            existing.append(fir_num)
        elif station_id == "717" and legacy_name in disk_files:
            existing.append(fir_num)
        elif fir_num in db_nums:
            existing.append(fir_num)
        else:
            missing.append(fir_num)

    return missing, existing
