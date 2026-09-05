"""Thread-safe scrape progress tracker."""

import threading
from datetime import UTC, datetime
from typing import Any


class ScrapeProgressTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.reset()

    def reset(self) -> None:
        with self._lock:
            self.status = "idle"
            self.station_id = ""
            self.station_name = ""
            self.start_fir = 0
            self.end_fir = 0
            self.current_fir = 0
            self.scanned_count = 0
            self.total_scanned = 0
            self.found_count = 0
            self.downloaded_count = 0
            self.total_download = 0
            self.progress_percent = 0
            self.message = "Idle"
            self.logs: list[str] = []
            self.error: str | None = None
            self.updated_at = datetime.now(UTC).isoformat()

    def start_job(self, station_id: str, station_name: str, start_fir: int, end_fir: int) -> None:
        with self._lock:
            self.status = "scanning"
            self.station_id = station_id
            self.station_name = station_name
            self.start_fir = start_fir
            self.end_fir = end_fir
            self.current_fir = start_fir
            self.scanned_count = 0
            self.total_scanned = max(1, end_fir - start_fir + 1)
            self.found_count = 0
            self.downloaded_count = 0
            self.total_download = 0
            self.progress_percent = 0
            self.message = f"Starting scan for {station_name} (#{start_fir:04d} → #{end_fir:04d})..."
            self.logs = [f"🚀 Started extraction for {station_name} (#{start_fir:04d} to #{end_fir:04d})"]
            self.error = None
            self.updated_at = datetime.now(UTC).isoformat()

    def update_scan_progress(self, info: dict[str, Any]) -> None:
        with self._lock:
            self.status = "scanning"
            self.current_fir = info.get("current_fir", self.current_fir)
            step = info.get("step", 1)
            total = info.get("total", self.total_scanned)
            self.scanned_count = step
            counts = info.get("counts", {})
            self.found_count = counts.get("found", self.found_count)
            self.progress_percent = min(70, int((step / total) * 70))
            msg = info.get("message", f"Scanning FIR #{info.get('fir_str', '')}...")
            self.message = msg
            self.logs.append(msg)
            if len(self.logs) > 40:
                self.logs = self.logs[-40:]
            self.updated_at = datetime.now(UTC).isoformat()

    def start_download_phase(self, total_links: int) -> None:
        with self._lock:
            self.status = "downloading"
            self.total_download = total_links
            self.downloaded_count = 0
            self.progress_percent = 70
            msg = f"📥 Found {total_links} matching PDF(s). Downloading files..."
            self.message = msg
            self.logs.append(msg)
            self.updated_at = datetime.now(UTC).isoformat()

    def update_download_progress(self, info: dict[str, Any]) -> None:
        with self._lock:
            self.status = "downloading"
            idx = info.get("current_idx", 1)
            total = info.get("total_links", max(1, self.total_download))
            self.downloaded_count = idx
            self.progress_percent = min(90, 70 + int((idx / total) * 20))
            msg = info.get("message", f"Downloading PDF #{info.get('fir_str', '')}...")
            self.message = msg
            self.logs.append(msg)
            if len(self.logs) > 40:
                self.logs = self.logs[-40:]
            self.updated_at = datetime.now(UTC).isoformat()

    def start_indexing_phase(self) -> None:
        with self._lock:
            self.status = "indexing"
            self.progress_percent = 92
            msg = "🧠 Indexing downloaded FIR PDFs into SQLite + FTS5 full-text database..."
            self.message = msg
            self.logs.append(msg)
            self.updated_at = datetime.now(UTC).isoformat()

    def complete_job(self, new_count: int) -> None:
        with self._lock:
            self.status = "completed"
            self.progress_percent = 100
            msg = f"✅ Finished! Downloaded & indexed {new_count} new FIR document(s)."
            self.message = msg
            self.logs.append(msg)
            self.updated_at = datetime.now(UTC).isoformat()
        threading.Timer(8.0, self.reset).start()

    def fail_job(self, error_msg: str) -> None:
        with self._lock:
            self.status = "failed"
            self.error = error_msg
            msg = f"❌ Extraction error: {error_msg}"
            self.message = msg
            self.logs.append(msg)
            self.updated_at = datetime.now(UTC).isoformat()
        threading.Timer(15.0, self.reset).start()

    def to_dict(self) -> dict[str, Any]:
        with self._lock:
            return {
                "status": self.status,
                "station_id": self.station_id,
                "station_name": self.station_name,
                "start_fir": self.start_fir,
                "end_fir": self.end_fir,
                "current_fir": self.current_fir,
                "scanned_count": self.scanned_count,
                "total_scanned": self.total_scanned,
                "found_count": self.found_count,
                "downloaded_count": self.downloaded_count,
                "total_download": self.total_download,
                "progress_percent": self.progress_percent,
                "message": self.message,
                "logs": list(self.logs),
                "error": self.error,
                "updated_at": self.updated_at,
            }


progress_tracker = ScrapeProgressTracker()
