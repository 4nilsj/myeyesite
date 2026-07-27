#!/usr/bin/env python3
"""Scrape FIR links and download matched PDFs from a portal."""

import argparse
import json
import logging
import os
import ssl
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
import urllib3
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

load_dotenv()

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DEFAULT_BASE_URL = "https://ksp.karnataka.gov.in/fir_search_new_api.php"
DEFAULT_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-GB,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://ksp.karnataka.gov.in",
    "Referer": "https://ksp.karnataka.gov.in/firsearch/en",
}
DEFAULT_COOKIES: dict[str, str] = {}


def build_cookies_from_env() -> dict[str, str]:
    """Assemble a cookies dict from individual FIR_COOKIE_* environment variables.

    Maps:
        FIR_COOKIE_PHPSESSID   -> PHPSESSID
        FIR_COOKIE_XSRF_TOKEN  -> XSRF-TOKEN
        FIR_COOKIE_CEGKAR      -> cegkar
    Additional FIR_COOKIE_<NAME> vars are included as-is (lowercased key).
    """
    mapping = {
        "FIR_COOKIE_PHPSESSID": "PHPSESSID",
        "FIR_COOKIE_XSRF_TOKEN": "XSRF-TOKEN",
        "FIR_COOKIE_CEGKAR": "cegkar",
    }
    cookies: dict[str, str] = {}
    for env_key, cookie_name in mapping.items():
        value = os.getenv(env_key, "")
        if value:
            cookies[cookie_name] = value
    # Also pick up any extra FIR_COOKIE_* vars not in the mapping above
    for key, value in os.environ.items():
        if key.startswith("FIR_COOKIE_") and key not in mapping and value:
            cookie_name = key[len("FIR_COOKIE_"):].lower().replace("_", "-")
            cookies.setdefault(cookie_name, value)
    return cookies


class TLSAdapter(HTTPAdapter):
    """Adapter to lower SSL security level for compatibility with legacy systems."""

    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.set_ciphers("DEFAULT:@SECLEVEL=0")
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


class FIRScraper:
    def __init__(self, base_url: str, logs_dir: str = "logs", pdfs_dir: str = "pdfs", headers: dict[str, str] | None = None, cookies: dict[str, str] | None = None):
        self.base_url = base_url
        self.host = urlparse(base_url).hostname or ""
        self.script_dir = Path(__file__).resolve().parent
        self.logs_dir = self.script_dir / logs_dir
        self.pdfs_dir = self.script_dir / pdfs_dir
        self.headers = headers or {}
        self.cookies = cookies or {}
        self._setup_directories()
        self.logger = self._setup_logging()
        self.session = self._setup_session()
        self.results_file = self.logs_dir / "fir_results.txt"

    def _setup_directories(self) -> None:
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.pdfs_dir.mkdir(parents=True, exist_ok=True)
        (self.logs_dir / "html_samples").mkdir(parents=True, exist_ok=True)

    def _setup_logging(self) -> logging.Logger:
        logger = logging.getLogger("FIRScraper")
        logger.setLevel(logging.DEBUG)
        if logger.handlers:
            return logger

        debug_file = self.logs_dir / "fir_debug.txt"
        file_handler = logging.FileHandler(debug_file, encoding="utf-8")
        file_handler.setLevel(logging.DEBUG)

        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.INFO)

        formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)

        logger.addHandler(file_handler)
        logger.addHandler(console_handler)
        return logger

    def _setup_session(self) -> requests.Session:
        session = requests.Session()
        if self.headers:
            session.headers.update(self.headers)

        retry_strategy = Retry(
            total=3,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "POST", "OPTIONS"],
            backoff_factor=1,
        )

        adapter = TLSAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    def _save_html_sample(self, html: str, fir_num: str) -> None:
        sample_path = self.logs_dir / "html_samples" / f"{fir_num}.html"
        try:
            sample_path.write_text(html, encoding="utf-8")
            self.logger.debug("Saved HTML sample for FIR %s to %s", fir_num, sample_path)
        except OSError as exc:
            self.logger.error("Failed to save HTML sample for FIR %s: %s", fir_num, exc)

    def _append_result(self, line: str) -> None:
        with self.results_file.open("a", encoding="utf-8") as handle:
            handle.write(f"{line}\n")

    # ── Response classification helpers ──────────────────────────────────
    @staticmethod
    def _is_fir_not_found(soup: BeautifulSoup) -> bool:
        """Return True if the portal says the FIR does not exist."""
        # Check for "FIR Not Found!" heading or alert
        for tag in soup.find_all(["h2", "h3", "div"]):
            text = tag.get_text(strip=True).lower()
            if "fir not found" in text or "no record found" in text:
                return True
        return False

    @staticmethod
    def _is_session_expired(soup: BeautifulSoup, response_text: str) -> bool:
        """Return True if the response looks like a login/captcha page (session expired)."""
        t = response_text.lower()
        return any([
            "invalid captcha" in t,
            "session expired" in t,
            "please login" in t,
            "captcha verification" in t,
            'name="captcha"' in t and 'name="csrf_token"' in t,
            'name="random_captcha"' in t,
        ])

    def scan_firs(self, start_fir: int, end_fir: int, year: str, district_id: str, ps_id: str, headers: dict[str, str], cookies: dict[str, str], captcha_val: str, csrf_token: str) -> list[tuple[str, str]]:
        self.logger.info("Starting FIR scan from %s to %s for year %s", start_fir, end_fir, year)
        found_links: list[tuple[str, str]] = []

        counts = {"found": 0, "not_found": 0, "no_link": 0, "error": 0, "session": 0}

        for fir_num in range(start_fir, end_fir + 1):
            fir_str = str(fir_num).zfill(4)
            data = {
                "district_id": district_id,
                "ps_id": ps_id,
                "fir_num": fir_str,
                "year": year,
                "knen": "en",
                "random_captcha": captcha_val,
                "captcha": captcha_val,
                "csrf_token": csrf_token,
            }

            self.logger.info("Checking FIR %s", fir_str)
            try:
                response = self.session.post(
                    self.base_url,
                    headers=headers,
                    cookies=cookies,
                    data=data,
                    timeout=30,
                    verify=False,
                    allow_redirects=False,
                )
                if response.status_code == 302:
                    location = response.headers.get("Location", "")
                    self.logger.warning(
                        "⚠️  SESSION EXPIRED or invalid CAPTCHA for FIR %s — redirected to: %s. "
                        "Please refresh credentials in .env and retry.",
                        fir_str, location,
                    )
                    counts["session"] += 1
                    # If first FIR already redirected, abort early — all will fail
                    if fir_num == start_fir:
                        self.logger.error(
                            "❌ Aborting scan: session appears invalid from the very first request. "
                            "Update CAPTCHA, CSRF token, and cookies in .env."
                        )
                        break
                    continue
                response.raise_for_status()
            except requests.exceptions.RequestException as exc:
                self.logger.error("Request failed for FIR %s: %s", fir_str, exc)
                now_str = datetime.now(UTC).isoformat()
                self._append_result(f"{now_str}\t{fir_str}\tERROR\t{exc}")
                counts["error"] += 1
                continue

            soup = BeautifulSoup(response.text, "html.parser")

            # ── Classify the response ─────────────────────────────────────
            if self._is_session_expired(soup, response.text):
                self.logger.warning(
                    "⚠️  FIR %s: Response looks like a login/captcha page — session may be expired.",
                    fir_str,
                )
                counts["session"] += 1
                if fir_num == start_fir:
                    self.logger.error(
                        "❌ Aborting scan: session is invalid from the very first request. "
                        "Please update CAPTCHA, CSRF token, and cookies in .env then retry."
                    )
                    break
                continue

            if self._is_fir_not_found(soup):
                self.logger.debug("FIR %s: Not registered at this station.", fir_str)
                counts["not_found"] += 1
                continue

            anchors = [anchor.get("href") for anchor in soup.find_all("a") if anchor.get("href")]

            if not anchors:
                self.logger.warning(
                    "FIR %s: Page returned content but no PDF link found. Saving HTML sample for review.",
                    fir_str,
                )
                self._save_html_sample(response.text, fir_str)
                counts["no_link"] += 1
                continue

            for href in anchors:
                self.logger.info("✅ Found PDF link for FIR %s: %s", fir_str, href)
                found_links.append((fir_str, href))
                self._append_result(href)
            counts["found"] += 1

        # ── Scan summary ──────────────────────────────────────────────────
        total = end_fir - start_fir + 1
        print("")
        print("━" * 54)
        print("  📊 Scan Summary")
        print("━" * 54)
        print(f"  Total checked  : {total}")
        print(f"  ✅ PDFs found   : {counts['found']}")
        print(f"  ❌ Not at station: {counts['not_found']}")
        print(f"  ⚠️  No PDF link  : {counts['no_link']}")
        print(f"  🔐 Session errors: {counts['session']}")
        print(f"  💥 Request errors: {counts['error']}")
        print("━" * 54)
        print("")

        return found_links


    def download_pdfs(self, links: list[tuple[str, str]], ps_id: str = "") -> None:
        self.logger.info("Starting PDF download for %s items", len(links))
        station_suffix = f"_ps{ps_id}" if ps_id else ""

        for idx, (fir_str, href) in enumerate(links, start=1):
            full_url = urljoin(self.base_url, href)

            if urlparse(full_url).hostname != self.host:
                self.logger.warning("Skipping cross-host URL: %s", full_url)
                continue

            self.logger.info("Fetching [%s/%s]: %s", idx, len(links), full_url)
            try:
                response = self.session.get(full_url, headers=self.headers, cookies=self.cookies, stream=True, timeout=30, verify=False)
                response.raise_for_status()

                content_type = response.headers.get("Content-Type", "").lower()
                content_disp = response.headers.get("Content-Disposition", "").lower()
                is_pdf = "pdf" in content_type or ".pdf" in content_disp or href.lower().endswith(".pdf")
                if not is_pdf:
                    self.logger.info("Skipping non-PDF content for %s", full_url)
                    continue

                filename = f"fir{station_suffix}_{fir_str}.pdf"
                destination = self.pdfs_dir / filename

                with destination.open("wb") as handle:
                    for chunk in response.iter_content(chunk_size=65536):
                        handle.write(chunk)

                self.logger.info(
                    "Successfully saved PDF to: %s (Station: %s)",
                    destination,
                    ps_id or "default",
                )
            except requests.exceptions.RequestException as exc:
                self.logger.error("Failed to fetch %s: %s", full_url, exc)
            except OSError as exc:
                self.logger.error("Failed to save file for %s: %s", full_url, exc)


# ── Station Registry ─────────────────────────────────────────────────────────
STATION_MAP: dict[str, str] = {
    # Friendly name aliases → ps_id
    "madbool": "717",
    "kgf": "717",
    "kalagi": "718",
    "cybercrime": "2256",
    "cyber": "2256",
    # Raw IDs (pass-through)
    "717": "717",
    "718": "718",
    "2256": "2256",
}

STATION_LABELS: dict[str, str] = {
    "717": "Madbool Station (717)",
    "718": "Kalagi Station (718)",
    "2256": "Cybercrime Station (2256)",
}


def resolve_station(value: str) -> str:
    """Resolve a station name alias or raw ID to a numeric ps_id string."""
    return STATION_MAP.get(value.lower(), value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Scan FIR numbers and download matching PDFs.\n\n"
            "Station presets (--station):\n"
            "  madbool    → ps-id 717  (Madbool Station)      → fir_ps717_XXXX.pdf\n"
            "  kalagi     → ps-id 718  (Kalagi Station)       → fir_ps718_XXXX.pdf\n"
            "  cybercrime → ps-id 2256 (Cybercrime Station)   → fir_ps2256_XXXX.pdf\n"
            "  <raw id>   → any numeric police station ID\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--start-fir", type=int, help="Starting FIR number (required)")
    parser.add_argument("--end-fir", type=int, help="Ending FIR number (required)")
    parser.add_argument(
        "--year",
        default=os.getenv("FIR_YEAR", "2026"),
        help="Year to submit in the request (default: 2026)",
    )
    parser.add_argument(
        "--district-id",
        default=os.getenv("FIR_DISTRICT_ID", "23"),
        help="District ID (default: 23)",
    )
    parser.add_argument(
        "--station",
        default=None,
        metavar="NAME_OR_ID",
        help=(
            "Police station alias or raw ID. "
            "Aliases: kgf (717), kalagi (718), cybercrime (2256). "
            "Overrides --ps-id and FIR_PS_ID env var."
        ),
    )
    parser.add_argument(
        "--ps-id",
        default=os.getenv("FIR_PS_ID", "717"),
        help="Raw police station ID (default: 717). Use --station for named presets.",
    )
    parser.add_argument(
        "--url",
        default=os.getenv("FIR_URL", DEFAULT_BASE_URL),
        help="Target FIR search URL",
    )
    parser.add_argument(
        "--captcha",
        default=os.getenv("FIR_CAPTCHA", ""),
        help="Captcha value (required). Set FIR_CAPTCHA in .env",
    )
    parser.add_argument(
        "--csrf-token",
        default=os.getenv("FIR_CSRF_TOKEN", ""),
        help="CSRF token (required). Set FIR_CSRF_TOKEN in .env",
    )
    parser.add_argument(
        "--cookies-json",
        default=os.getenv("FIR_COOKIES_JSON", ""),
        help="JSON string of cookies to use",
    )
    parser.add_argument(
        "--headers-json",
        default=os.getenv("FIR_HEADERS_JSON", ""),
        help="JSON string of headers to use",
    )
    parser.add_argument(
        "--no-prompt",
        action="store_true",
        help="Do not prompt for FIR numbers when they are missing; exit instead",
    )
    return parser.parse_args()


def parse_json(value: str) -> dict[str, str]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON supplied: {exc}") from exc
    if not isinstance(parsed, dict):
        raise SystemExit("Expected a JSON object for cookies/headers")
    return {str(key): str(val) for key, val in parsed.items()}


def prompt_for_firs(args: argparse.Namespace) -> None:
    if args.start_fir is None:
        args.start_fir = int(input("Enter starting FIR number: "))
    if args.end_fir is None:
        args.end_fir = int(input("Enter ending FIR number: "))


def _print_station_banner(ps_id: str, start_fir: int, end_fir: int, year: str) -> None:
    label = STATION_LABELS.get(ps_id, f"Station {ps_id}")
    print("")
    print("━" * 54)
    print(f"  📍 Station  : {label}")
    print(f"  📅 Year     : {year}")
    print(f"  🔢 FIR Range: {str(start_fir).zfill(4)} → {str(end_fir).zfill(4)}")
    print(f"  📄 Filenames: fir_ps{ps_id}_XXXX.pdf")
    print("━" * 54)
    print("")


def main() -> int:
    args = parse_args()

    # Resolve station: --station takes priority over --ps-id / FIR_PS_ID
    if args.station:
        ps_id = resolve_station(args.station)
    else:
        ps_id = resolve_station(args.ps_id)

    try:
        if args.start_fir is None or args.end_fir is None:
            if args.no_prompt:
                raise SystemExit(
                    "Please provide --start-fir and --end-fir, "
                    "or remove --no-prompt to enable interactive input."
                )
            prompt_for_firs(args)

        if args.start_fir > args.end_fir:
            print("Error: Starting FIR cannot be greater than ending FIR.")
            return 1

        if not args.captcha:
            raise SystemExit("Captcha is required. Set FIR_CAPTCHA in .env or pass --captcha")
        if not args.csrf_token:
            raise SystemExit("CSRF token is required. Set FIR_CSRF_TOKEN in .env or pass --csrf-token")

        _print_station_banner(ps_id, args.start_fir, args.end_fir, args.year)

        headers = parse_json(args.headers_json) or DEFAULT_HEADERS
        # Use explicit --cookies-json if provided, otherwise build from FIR_COOKIE_* env vars
        cookies = parse_json(args.cookies_json) or build_cookies_from_env() or DEFAULT_COOKIES

        scraper = FIRScraper(args.url, headers=headers, cookies=cookies)
        links = scraper.scan_firs(
            start_fir=args.start_fir,
            end_fir=args.end_fir,
            year=args.year,
            district_id=args.district_id,
            ps_id=ps_id,
            headers=headers,
            cookies=cookies,
            captcha_val=args.captcha,
            csrf_token=args.csrf_token,
        )

        if links:
            scraper.download_pdfs(links, ps_id=ps_id)
        else:
            scraper.logger.info("No links found during scan.")
        return 0
    except ValueError:
        print("Error: Please enter valid integer FIR numbers.")
        return 1
    except KeyboardInterrupt:
        print("\nProcess interrupted by user.")
        return 1
    except Exception as exc:
        logger = logging.getLogger("FIRScraper")
        if not logger.handlers:
            logging.basicConfig(level=logging.INFO)
            logger = logging.getLogger()
        logger.critical("An unexpected error occurred: %s", exc, exc_info=True)
        return 1



if __name__ == "__main__":
    main()
