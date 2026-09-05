"""SQLite database connection, schema setup, migration, and persistence."""

import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

from core import config
from core.config import _extract_fir_number_from_filename

logger = logging.getLogger("FIRApp")


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


@contextmanager
def get_db():
    """Yield a high-performance SQLite connection configured with WAL and caching."""
    conn = sqlite3.connect(config.DB_FILE, timeout=15)
    conn.row_factory = sqlite3.Row
    # Configure performance PRAGMAs
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA cache_size = -64000;")  # 64MB cache
    conn.execute("PRAGMA temp_store = MEMORY;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _init_db() -> None:
    """Initialize database schema, apply migrations, and create performance indexes."""
    with get_db() as conn:
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
                data_json TEXT,
                fir_num INTEGER
            );
        """)

        # Migration: Add acts_sections column if missing
        try:
            conn.execute("ALTER TABLE fir_documents ADD COLUMN acts_sections TEXT;")
        except sqlite3.OperationalError:
            pass

        # Migration: Add fir_num column if missing
        try:
            conn.execute("ALTER TABLE fir_documents ADD COLUMN fir_num INTEGER;")
        except sqlite3.OperationalError:
            pass

        # Performance Indexes
        conn.execute("CREATE INDEX IF NOT EXISTS idx_fir_station_num ON fir_documents(station_id, fir_num DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_fir_parsed_date ON fir_documents(parsed_date DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_fir_station ON fir_documents(station_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_fir_num ON fir_documents(fir_num);")

        # Backfill fir_num for rows where fir_num is NULL
        rows_null = conn.execute("SELECT filename FROM fir_documents WHERE fir_num IS NULL;").fetchall()
        if rows_null:
            updates = []
            for r in rows_null:
                fn = r["filename"]
                num = _extract_fir_number_from_filename(fn)
                if num is not None:
                    updates.append((num, fn))
            if updates:
                conn.executemany("UPDATE fir_documents SET fir_num = ? WHERE filename = ?;", updates)

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
    if not config.CACHE_FILE.exists():
        return
    logger.info("Migrating .pdf_cache.json to SQLite database (%s)...", config.DB_FILE)
    try:
        with open(config.CACHE_FILE, "r", encoding="utf-8") as f:
            old_cache = json.load(f)
        for key, entry in old_cache.items():
            data = entry.get("data")
            if isinstance(data, dict):
                mtime = int(entry.get("mtime", 0))
                size = int(entry.get("size", 0))
                _save_record_to_db(data, mtime, size)
        bak_file = config.CACHE_FILE.with_suffix(".json.bak")
        config.CACHE_FILE.rename(bak_file)
        logger.info("Successfully imported cache to SQLite database. Archived .pdf_cache.json -> .pdf_cache.json.bak")
    except Exception as exc:
        logger.warning("Error migrating .pdf_cache.json: %s", exc)


def _save_record_to_db(data: dict[str, Any], mtime: int, size: int) -> None:
    filename = data.get("name", "")
    if not filename:
        return
    parsed_dt = _parse_date_value(str(data.get("complaint_date", "")))
    parsed_date_iso = parsed_dt.isoformat() if parsed_dt else ""

    fir_num = _extract_fir_number_from_filename(filename)

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
                plain_summary, acts_sections, data_json, fir_num
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
            data_json_str,
            fir_num,
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
