import shutil
import sys
import tempfile
import time
import unittest
from pathlib import Path

# Ensure root project directory is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app
from core.db import _init_db, _save_record_to_db, get_db
from core.repository import (
    _get_highest_fir_number,
    _get_missing_fir_numbers,
    list_pdfs,
)


class TestPerformanceAndIndexing(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(self.temp_dir, ignore_errors=True))

        self.test_db_path = Path(self.temp_dir) / "test_perf.db"
        self.test_pdf_dir = Path(self.temp_dir) / "pdfs"
        self.test_pdf_dir.mkdir(parents=True, exist_ok=True)

        self.original_db_file = app.DB_FILE
        self.original_pdf_dir = app.PDF_DIR

        app.DB_FILE = self.test_db_path
        app.PDF_DIR = self.test_pdf_dir

        _init_db()

    def tearDown(self):
        app.DB_FILE = self.original_db_file
        app.PDF_DIR = self.original_pdf_dir

    def test_database_indexes_exist(self):
        """Verify that compound and performance indexes are created on fir_documents."""
        with get_db() as conn:
            rows = conn.execute("PRAGMA index_list(fir_documents);").fetchall()
            index_names = {r["name"] for r in rows}
            self.assertIn("idx_fir_station_num", index_names)
            self.assertIn("idx_fir_parsed_date", index_names)
            self.assertIn("idx_fir_station", index_names)
            self.assertIn("idx_fir_num", index_names)

    def test_fir_num_auto_extracted_and_stored(self):
        """Verify that fir_num integer is automatically populated in the database table."""
        rec = {
            "name": "fir_ps718_0042.pdf",
            "station_id": "718",
            "station_name": "Kalagi Station (718)",
            "complaint_date": "15/08/2024",
            "parsed_date": "2024-08-15",
            "location": "Kalagi Market",
            "complainant_name": "Vijay",
            "acts_sections": "303 BNS",
            "summary": "Theft case",
            "plain_summary": "Theft case",
        }
        _save_record_to_db(rec, mtime=1700000000, size=10000)

        with get_db() as conn:
            row = conn.execute(
                "SELECT fir_num, station_id FROM fir_documents WHERE filename = 'fir_ps718_0042.pdf';"
            ).fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row["fir_num"], 42)
            self.assertEqual(row["station_id"], "718")

    def test_fast_highest_fir_lookup(self):
        """Verify O(1) indexed lookup for highest FIR number."""
        for num in [5, 12, 45, 99, 23]:
            rec = {
                "name": f"fir_ps717_{num:04d}.pdf",
                "station_id": "717",
                "station_name": "Madbool Station (717)",
                "complaint_date": "01/01/2024",
                "parsed_date": "2024-01-01",
                "acts_sections": "379 IPC",
                "summary": "Sample",
                "plain_summary": "Sample",
            }
            _save_record_to_db(rec, mtime=1700000000, size=10000)

        highest = _get_highest_fir_number("717")
        self.assertEqual(highest, 99)

    def test_batch_missing_fir_resolution(self):
        """Verify that missing and existing FIRs are computed in a single batch query."""
        # Insert FIRs 1, 3, 5
        for num in [1, 3, 5]:
            rec = {
                "name": f"fir_ps718_{num:04d}.pdf",
                "station_id": "718",
                "station_name": "Kalagi Station (718)",
                "acts_sections": "379 IPC",
                "summary": "Sample",
                "plain_summary": "Sample",
            }
            _save_record_to_db(rec, mtime=1700000000, size=10000)

        # Check range 1 to 6
        missing, existing = _get_missing_fir_numbers("718", start_fir=1, end_fir=6)
        self.assertEqual(existing, [1, 3, 5])
        self.assertEqual(missing, [2, 4, 6])

    def test_sql_level_fir_range_filtering(self):
        """Verify list_pdfs respects start_fir and end_fir via SQL pushdown."""
        for num in range(1, 11):
            rec = {
                "name": f"fir_ps717_{num:04d}.pdf",
                "station_id": "717",
                "station_name": "Madbool Station (717)",
                "acts_sections": "379 IPC",
                "summary": f"Incident {num}",
                "plain_summary": f"Incident {num}",
            }
            _save_record_to_db(rec, mtime=1700000000, size=10000)

        # Filter range 3 to 7
        results = list_pdfs(station_id="717", start_fir=3, end_fir=7, date_order="fir_asc")
        self.assertEqual(len(results), 5)
        names = [r["name"] for r in results]
        self.assertEqual(
            names,
            [
                "fir_ps717_0003.pdf",
                "fir_ps717_0004.pdf",
                "fir_ps717_0005.pdf",
                "fir_ps717_0006.pdf",
                "fir_ps717_0007.pdf",
            ],
        )


if __name__ == "__main__":
    unittest.main()
