"""Asynchronous scraper execution service and background worker."""

import logging
from typing import Any

from core import config
from core.config import STATION_MAP
from core.extractor import get_pdf_info_cached, sync_all_pdfs
from core.tracker import progress_tracker
from fir_scraper import FIRScraper

logger = logging.getLogger("FIRApp")


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
                pdf_dir = config.PDF_DIR
                for fir_str, _link in target_links:
                    pdf_name = f"fir_ps{station_id}_{fir_str}.pdf"
                    pdf_path = pdf_dir / pdf_name
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
