import unittest
import sys
from pathlib import Path

# Ensure root project directory is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import (
    _highlight_matches,
    _get_station_from_filename,
    _extract_fir_number_from_filename,
    _parse_date_to_sort_key,
    _extract_acts_and_sections,
    _extract_keywords,
    _parse_summary_fields,
    _extract_tq,
    _extract_complaint_date,
    _parse_date_value,
    get_crime_type_badge,
    _should_use_ocr,
)


class TestAppHelpers(unittest.TestCase):
    def test_highlight_matches(self):
        self.assertEqual(_highlight_matches("Hello World", ""), "Hello World")
        self.assertEqual(
            _highlight_matches("Hello World", "world"),
            "Hello <span class='highlight'>World</span>",
        )
        self.assertEqual(
            _highlight_matches("<script>alert(1)</script>", "script"),
            "&lt;<span class='highlight'>script</span>&gt;alert(1)&lt;/<span class='highlight'>script</span>&gt;",
        )

    def test_get_station_from_filename(self):
        self.assertEqual(
            _get_station_from_filename("fir_ps717_0005.pdf"),
            ("717", "Madbool Station (717)"),
        )
        self.assertEqual(
            _get_station_from_filename("fir_ps718_0123.pdf"),
            ("718", "Kalagi Station (718)"),
        )
        self.assertEqual(
            _get_station_from_filename("fir_ps2256_0042.pdf"),
            ("2256", "Cybercrime Station (2256)"),
        )
        self.assertEqual(
            _get_station_from_filename("fir_0025.pdf"),
            ("717", "Madbool Station (717)"),
        )
        self.assertEqual(
            _get_station_from_filename("unknown_file.pdf"),
            ("unknown", "Unknown Station"),
        )

    def test_extract_fir_number_from_filename(self):
        self.assertEqual(_extract_fir_number_from_filename("fir_ps717_0005.pdf"), 5)
        self.assertEqual(_extract_fir_number_from_filename("fir_ps718_0123.pdf"), 123)
        self.assertEqual(_extract_fir_number_from_filename("sample_9999.pdf"), 9999)
        self.assertIsNone(_extract_fir_number_from_filename("invalid_file.txt"))
        self.assertIsNone(_extract_fir_number_from_filename(""))

    def test_parse_date_to_sort_key(self):
        self.assertEqual(_parse_date_to_sort_key("15/08/2024"), "2024-08-15")
        self.assertEqual(_parse_date_to_sort_key("1/2/2024"), "2024-02-01")
        self.assertEqual(_parse_date_to_sort_key("invalid-date"), "invalid-date")
        self.assertEqual(_parse_date_to_sort_key(""), "")

    def test_extract_acts_and_sections(self):
        text = "2. Acts & Sections: IPC 379 and IT Act 66D\n3. Incident details"
        extracted = _extract_acts_and_sections(text)
        self.assertIn("IPC 379", extracted)

        text_fallback = "Accused registered under IPC 302 and IT ACT 66C."
        extracted_fallback = _extract_acts_and_sections(text_fallback)
        self.assertIn("IPC 302", extracted_fallback)

    def test_extract_keywords(self):
        text = "The victim reported theft of mobile phone and online cyber fraud transferred via UPI payment."
        keywords = _extract_keywords(text, limit=5)
        self.assertTrue(isinstance(keywords, list))
        self.assertTrue(len(keywords) <= 5)

    def test_parse_summary_fields(self):
        summary_text = """
        Complainant: John Doe
        Address: 123 Main St, Kalagi
        Incident Date: 12/05/2024
        """
        parsed = _parse_summary_fields(summary_text)
        self.assertEqual(parsed.get("complainant"), "John Doe")
        self.assertEqual(parsed.get("address"), "123 Main St, Kalagi")

    def test_extract_tq(self):
        self.assertEqual(_extract_tq("Dist: Kalaburagi, Tq: Chittapur"), "chittapur")
        self.assertEqual(_extract_tq("No taluk here"), "")

    def test_extract_complaint_date(self):
        text = "Date and Time of FIR: 25/12/2023 at 14:30 hrs"
        date_str = _extract_complaint_date(text)
        self.assertEqual(date_str, "25/12/2023")

    def test_parse_date_value(self):
        parsed = _parse_date_value("2024-08-15")
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed.year, 2024)
        self.assertEqual(parsed.month, 8)
        self.assertEqual(parsed.day, 15)

        parsed_slash = _parse_date_value("15/08/2024")
        self.assertIsNotNone(parsed_slash)
        self.assertEqual(parsed_slash.year, 2024)

        self.assertIsNone(_parse_date_value("invalid"))

    def test_get_crime_type_badge(self):
        self.assertEqual(get_crime_type_badge("379 IPC", "stolen bike theft"), "Theft")
        self.assertEqual(get_crime_type_badge("66D IT Act", "online scam money"), "Cyber Scam")
        self.assertEqual(get_crime_type_badge("302 IPC", "murder case"), "Murder")
        self.assertEqual(get_crime_type_badge("279 337 IPC", "accident vehicle clash"), "Accident")
        self.assertEqual(get_crime_type_badge("323 504 506 IPC", "assault and fight"), "Assault / Fight")
        self.assertEqual(get_crime_type_badge("504 506 IPC", "threatened and abused"), "Threats & Abuse")

    def test_should_use_ocr(self):
        self.assertTrue(_should_use_ocr(""))
        self.assertTrue(_should_use_ocr("Short text"))
        self.assertTrue(_should_use_ocr("Clean text with null chars \x00 \x00 \x00"))


if __name__ == "__main__":
    unittest.main()
