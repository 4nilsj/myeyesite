import unittest
import shutil
import tempfile
import sys
from pathlib import Path

# Ensure root project directory is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app
from app import (
    _init_db,
    _save_record_to_db,
    list_pdfs,
    get_station_counts,
    get_station_stats,
    _get_highest_fir_number,
    _get_missing_fir_numbers,
    get_db,
)


class TestDatabaseOperations(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(self.temp_dir, ignore_errors=True))

        # Patch app environment for isolated test database and pdf directory
        self.test_db_path = Path(self.temp_dir) / "test_fir_cache.db"
        self.test_pdf_dir = Path(self.temp_dir) / "pdfs"
        self.test_pdf_dir.mkdir(parents=True, exist_ok=True)

        self.original_db_file = app.DB_FILE
        self.original_pdf_dir = app.PDF_DIR

        app.DB_FILE = self.test_db_path
        app.PDF_DIR = self.test_pdf_dir

        # Initialize schema
        _init_db()

    def tearDown(self):
        app.DB_FILE = self.original_db_file
        app.PDF_DIR = self.original_pdf_dir

    def test_db_initialization(self):
        with get_db() as conn:
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = [row[0] for row in cursor.fetchall()]
            self.assertIn("fir_documents", tables)
            self.assertIn("fir_fts", tables)

    def test_save_record_and_list_pdfs(self):
        sample_record = {
            "name": "fir_ps717_0001.pdf",
            "station_id": "717",
            "station_name": "Madbool Station (717)",
            "complaint_date": "10/05/2024",
            "parsed_date": "2024-05-10",
            "location": "Madbool Main Road",
            "tq": "chittapur",
            "complainant_name": "Ramesh Kumar",
            "complainant_address": "Madbool",
            "accused_name": "Unknown",
            "accused_address": "Madbool",
            "victim_name": "Ramesh Kumar",
            "victim_address": "Madbool",
            "pages": 2,
            "size_mb": 0.5,
            "ocr_used": 0,
            "ocr_status": "clean",
            "summary": "Theft of bike on main road",
            "plain_summary": "Theft of bike on main road",
            "acts_sections": "379 IPC",
            "text": "Full text content of theft complaint for test",
        }

        _save_record_to_db(sample_record, mtime=1700000000, size=500000)

        # List records
        records = list_pdfs()
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["name"], "fir_ps717_0001.pdf")
        self.assertEqual(records[0]["station_id"], "717")

        # Test search query
        search_results = list_pdfs(query="theft")
        self.assertEqual(len(search_results), 1)

        search_no_results = list_pdfs(query="nonexistent_keyword")
        self.assertEqual(len(search_no_results), 0)

    def test_get_station_counts_and_stats(self):
        rec1 = {
            "name": "fir_ps717_0001.pdf",
            "station_id": "717",
            "station_name": "Madbool Station (717)",
            "complaint_date": "01/01/2024",
            "parsed_date": "2024-01-01",
            "location": "Loc 1",
            "tq": "tq1",
            "complainant_name": "C1",
            "complainant_address": "A1",
            "accused_name": "",
            "accused_address": "",
            "victim_name": "",
            "victim_address": "",
            "pages": 1,
            "size_mb": 0.1,
            "ocr_used": 0,
            "ocr_status": "clean",
            "summary": "Summary 1",
            "plain_summary": "Summary 1",
            "acts_sections": "379 IPC",
            "text": "Text 1",
        }
        rec3 = {
            "name": "fir_ps717_0003.pdf",
            "station_id": "717",
            "station_name": "Madbool Station (717)",
            "complaint_date": "03/01/2024",
            "parsed_date": "2024-01-03",
            "location": "Loc 3",
            "tq": "tq1",
            "complainant_name": "C3",
            "complainant_address": "A3",
            "accused_name": "",
            "accused_address": "",
            "victim_name": "",
            "victim_address": "",
            "pages": 1,
            "size_mb": 0.1,
            "ocr_used": 0,
            "ocr_status": "clean",
            "summary": "Summary 3",
            "plain_summary": "Summary 3",
            "acts_sections": "379 IPC",
            "text": "Text 3",
        }

        _save_record_to_db(rec1, mtime=1700000000, size=100000)
        _save_record_to_db(rec3, mtime=1700000002, size=100000)

        counts = get_station_counts()
        self.assertEqual(counts.get("717"), 2)

        stats = get_station_stats()
        self.assertEqual(stats["717"]["highest"], 3)
        self.assertEqual(stats["717"]["missing_numbers"], [2])

    def test_highest_and_missing_fir_numbers(self):
        rec = {
            "name": "fir_ps718_0005.pdf",
            "station_id": "718",
            "station_name": "Kalagi Station (718)",
            "complaint_date": "05/01/2024",
            "parsed_date": "2024-01-05",
            "location": "Kalagi",
            "tq": "kalagi",
            "complainant_name": "C5",
            "complainant_address": "A5",
            "accused_name": "",
            "accused_address": "",
            "victim_name": "",
            "victim_address": "",
            "pages": 1,
            "size_mb": 0.1,
            "ocr_used": 0,
            "ocr_status": "clean",
            "summary": "Test 5",
            "plain_summary": "Test 5",
            "acts_sections": "379 IPC",
            "text": "Test 5",
        }
        _save_record_to_db(rec, mtime=1700000005, size=100000)

        highest = _get_highest_fir_number("718")
        self.assertEqual(highest, 5)

        missing, existing = _get_missing_fir_numbers("718", start_fir=1, end_fir=5)
        self.assertEqual(existing, [5])
        self.assertEqual(missing, [1, 2, 3, 4])


if __name__ == "__main__":
    unittest.main()
