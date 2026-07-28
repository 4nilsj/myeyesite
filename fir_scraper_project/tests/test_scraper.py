import unittest
import os
import shutil
import tempfile
import sys
from pathlib import Path

# Ensure root project directory is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fir_scraper import FIRScraper, build_cookies_from_env, DEFAULT_BASE_URL, DEFAULT_HEADERS


class TestFIRScraper(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(self.temp_dir, ignore_errors=True))

    def test_build_cookies_from_env(self):
        # Set dummy env vars
        os.environ["FIR_COOKIE_PHPSESSID"] = "test_sess_123"
        os.environ["FIR_COOKIE_XSRF_TOKEN"] = "test_xsrf_456"
        os.environ["FIR_COOKIE_CEGKAR"] = "test_cegkar_789"
        os.environ["FIR_COOKIE_CUSTOM_VAL"] = "custom_123"

        cookies = build_cookies_from_env()
        self.assertEqual(cookies.get("PHPSESSID"), "test_sess_123")
        self.assertEqual(cookies.get("XSRF-TOKEN"), "test_xsrf_456")
        self.assertEqual(cookies.get("cegkar"), "test_cegkar_789")
        self.assertEqual(cookies.get("custom-val"), "custom_123")

    def test_scraper_init_and_directories(self):
        scraper = FIRScraper(
            base_url=DEFAULT_BASE_URL,
            logs_dir=os.path.join(self.temp_dir, "logs"),
            pdfs_dir=os.path.join(self.temp_dir, "pdfs"),
            headers=DEFAULT_HEADERS,
            cookies={"PHPSESSID": "mock_sess"},
        )
        self.assertTrue(scraper.logs_dir.exists())
        self.assertTrue(scraper.pdfs_dir.exists())
        self.assertTrue((scraper.logs_dir / "html_samples").exists())
        self.assertEqual(scraper.cookies.get("PHPSESSID"), "mock_sess")
        self.assertIsNotNone(scraper.session)


if __name__ == "__main__":
    unittest.main()
