import unittest
import shutil
import tempfile
import sys
from pathlib import Path
import fitz

# Ensure root project directory is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app
from app import app as flask_app, _init_db, _save_record_to_db


class TestFlaskApp(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(self.temp_dir, ignore_errors=True))

        # Patch app environment
        self.test_db_path = Path(self.temp_dir) / "test_fir_cache.db"
        self.test_pdf_dir = Path(self.temp_dir) / "pdfs"
        self.test_pdf_dir.mkdir(parents=True, exist_ok=True)

        self.original_db_file = app.DB_FILE
        self.original_pdf_dir = app.PDF_DIR

        app.DB_FILE = self.test_db_path
        app.PDF_DIR = self.test_pdf_dir

        _init_db()

        flask_app.config["TESTING"] = True
        flask_app.config["WTF_CSRF_ENABLED"] = False
        self.client = flask_app.test_client()

    def tearDown(self):
        app.DB_FILE = self.original_db_file
        app.PDF_DIR = self.original_pdf_dir

    def _create_valid_pdf_bytes(self) -> bytes:
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((50, 50), "Sample PDF Text Content for Unit Testing")
        pdf_bytes = doc.tobytes()
        doc.close()
        return pdf_bytes

    def test_index_route(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"FIR Intelligence &amp; PDF Explorer", response.data)

    def test_index_route_with_query_filter(self):
        response = self.client.get("/?q=theft&station_id=717")
        self.assertEqual(response.status_code, 200)

    def test_pdf_detail_not_found(self):
        response = self.client.get("/pdf/nonexistent_file.pdf")
        self.assertEqual(response.status_code, 404)

    def test_pdf_detail_success(self):
        # Insert test PDF record
        rec = {
            "name": "fir_ps717_0001.pdf",
            "station_id": "717",
            "station_name": "Madbool Station (717)",
            "complaint_date": "10/05/2024",
            "parsed_date": "2024-05-10",
            "location": "Madbool Road",
            "tq": "chittapur",
            "complainant_name": "Ramesh",
            "complainant_address": "Madbool",
            "accused_name": "Unknown",
            "accused_address": "Madbool",
            "victim_name": "Ramesh",
            "victim_address": "Madbool",
            "pages": 1,
            "size_mb": 0.1,
            "ocr_used": 0,
            "ocr_status": "clean",
            "summary": "Sample summary content",
            "plain_summary": "Sample summary content",
            "acts_sections": "379 IPC",
            "text": "Sample PDF full text for testing detail route",
        }
        _save_record_to_db(rec, mtime=1700000000, size=100000)

        # Create valid PDF file on disk
        pdf_file = self.test_pdf_dir / "fir_ps717_0001.pdf"
        pdf_file.write_bytes(self._create_valid_pdf_bytes())

        response = self.client.get("/pdf/fir_ps717_0001.pdf?q=sample")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"fir_ps717_0001.pdf", response.data)

    def test_download_pdf_not_found(self):
        response = self.client.get("/download/missing_file.pdf")
        self.assertEqual(response.status_code, 404)

    def test_download_pdf_success(self):
        pdf_file = self.test_pdf_dir / "fir_ps717_0002.pdf"
        pdf_bytes = self._create_valid_pdf_bytes()
        pdf_file.write_bytes(pdf_bytes)

        response = self.client.get("/download/fir_ps717_0002.pdf")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, pdf_bytes)

    def test_fetch_firs_invalid_range(self):
        # End FIR less than start FIR
        response = self.client.post(
            "/fetch_firs",
            data={
                "station_id": "717",
                "start_fir": "10",
                "end_fir": "5",
            },
            follow_redirects=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Start FIR number cannot be greater than End FIR number", response.data)

    @unittest.mock.patch("routes.api._async_scrape_worker")
    def test_extract_new_firs_post(self, mock_worker):
        response = self.client.post(
            "/extract_new_firs",
            data={"station_id": "717", "batch_size": "5"},
            follow_redirects=True,
        )
        self.assertEqual(response.status_code, 200)

    def test_scrape_status_api(self):
        response = self.client.get("/api/scrape_status")
        self.assertEqual(response.status_code, 200)
        json_data = response.get_json()
        self.assertIsNotNone(json_data)
        self.assertIn("status", json_data)
        self.assertIn("progress_percent", json_data)

    def test_progress_tracker_state(self):
        app.progress_tracker.start_job("717", "Madbool Station", 1, 10)
        state = app.progress_tracker.to_dict()
        self.assertEqual(state["status"], "scanning")
        self.assertEqual(state["start_fir"], 1)
        self.assertEqual(state["end_fir"], 10)

        app.progress_tracker.complete_job(3)
        completed_state = app.progress_tracker.to_dict()
        self.assertEqual(completed_state["status"], "completed")
        self.assertEqual(completed_state["progress_percent"], 100)


if __name__ == "__main__":
    unittest.main()
