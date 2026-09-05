"""PDF text extraction, OCR fallback, and legal/entity parsing."""

import concurrent.futures
import json
import logging
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any

import fitz
from pypdf import PdfReader

from core import config
from core.config import _extract_fir_number_from_filename, _get_station_from_filename
from core.db import _save_record_to_db, get_db

logger = logging.getLogger("FIRApp")


def _clean_summary_val(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value or "").strip(" .,:;")
    cleaned = re.sub(r"\(.*?\)", "", cleaned)
    cleaned = re.sub(
        r"(?:ತಂದೆ/ಗಂಡನ\s*ಹೆಸರು|Father's/Husband's\s*Name).*$",
        "",
        cleaned,
        flags=re.IGNORECASE
    )
    cleaned = re.sub(r"\s*,\s*0$", "", cleaned)
    cleaned = re.sub(
        r"^Date of Issue\s*:?\s*", "", cleaned, flags=re.IGNORECASE
    )
    return cleaned.strip(" .,:;")


def _extract_acts_and_sections(text: str) -> str:
    """Extract Act and Section codes (IPC, BNS, IT Act, etc.) from PDF text."""
    pat = r"(?:2\.\s*(?:ಕಾಯ್ದೆ\s*ಮತ್ತು\s*ಕಲಂಗಳು|act[s]?\s*(?:and|&)\s*section[s]?|act[s]?\s*[:\-]))\s*[:\-]?\s*(.+?)(?=\s*3\.\s*|\n\s*3\.|\n\s*\(a\)|\n\s*ಕೃತ್ಯ|$)"
    match = re.search(pat, text, re.IGNORECASE | re.DOTALL)
    if match:
        cleaned = re.sub(r"\s+", " ", match.group(1)).strip(" .,:;")
        cleaned = re.sub(r"\s*3\..*$", "", cleaned, flags=re.IGNORECASE).strip()
        if cleaned:
            return cleaned

    acts = re.findall(
        r"\b(?:IPC|BNS|IT\s+ACT|INDIAN\s+PENAL\s+CODE|BHARATIYA\s+NYAYA\s+SANHITA|INFORMATION\s+TECHNOLOGY\s+ACT|MOTOR\s+VEHICLES\s+ACT|KARNATAKA\s+POLICE\s+ACT)[^\n;]*",
        text,
        re.IGNORECASE
    )
    if acts:
        return "; ".join(dict.fromkeys(a.strip() for a in acts[:3]))
    return "Not specified"


def _extract_keywords(text: str, limit: int = 10) -> list[str]:
    words = re.findall(r"[A-Za-z\u0C80-\u0CFF]{3,}", text)
    freq: dict[str, int] = {}
    stopwords = {
        "the", "and", "for", "that", "with", "this", "from", "have",
        "were", "will", "your", "http", "https"
    }
    for word in words:
        w_lower = word.lower()
        if w_lower in stopwords:
            continue
        freq[w_lower] = freq.get(w_lower, 0) + 1
    sorted_items = sorted(freq.items(), key=lambda item: (-item[1], item[0]))
    return [word for word, _ in sorted_items[:limit]]


def _parse_summary_fields(summary_text: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in summary_text.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower().replace(" ", "_")
        val_str = value.strip()
        if key and val_str:
            fields[key] = val_str
    return fields


def _extract_tq(value: str) -> str:
    if not value:
        return ""
    match = re.search(
        r"\btq\s*[:\-]?\s*([a-z\u0C80-\u0CFF]+)", value, re.IGNORECASE
    )
    if match:
        return match.group(1).strip().lower()
    return ""


def _extract_complaint_date(text: str) -> str:
    norm = re.sub(r"ದಿನ\s*ಾ?\s*ಂ?\s*ಂಕ", "ದಿನಾಂಕ", text)
    patterns = [
        (
            r"(?:ಪ್ರ\.ವ\.ವ\.\s*|FIR\s+|complaint\s+)?"
            r"ದಿನಾ[ಂ೦ಅ]ಕ\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
        ),
        (
            r"(?:fir\s+date|complaint\s+date|date)\s*[:\-]?\s*"
            r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
        ),
        (
            r"(?:sworn\s+on|d\.o\.o|do\.o)\s*[:\-]?\s*"
            r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
        ),
    ]
    for pattern in patterns:
        match = re.search(pattern, norm, re.IGNORECASE)
        if match:
            return match.group(1)

    matches = re.findall(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b", norm)
    if matches:
        return matches[0]
    return ""


def _generate_plain_summary(text: str) -> str:
    if not text.strip():
        return (
            "Complainant Name: Not clearly found\n"
            "Complainant Address: Not clearly found\n"
            "Accused Name: Not clearly found\n"
            "Accused Address: Not clearly found\n"
            "Victim Name: Not clearly found\n"
            "Victim Address: Not clearly found\n"
            "Place of Incident: Not clearly found"
        )

    norm_single = re.sub(r"\s+", " ", text)
    norm = text
    norm = re.sub(r"ದಿನ\s*ಾ?\s*ಂ?\s*ಂಕ", "ದಿನಾಂಕ", norm)
    norm = re.sub(r"ಸಾರ\s*ಾ?\s*ಂ?\s*ಂಶ", "ಸಾರಾಂಶ", norm)

    complainant_name = ""
    complainant_address = ""
    accused_name = ""
    accused_address = ""
    victim_name = ""
    victim_address = ""
    place = ""

    comp_pat = (
        r"Complainant/Informant\s*:\s*([A-Za-z\u0C80-\u0CFF\s\.\,\@]+?)"
        r"(?=\s*(?:\([a-z]\)|Father|\(g\)|\(e\)|\(b\)|\(c\)|\(d\)|\(f\)|\(h\)"
        r"|\(i\)|\(j\)|\(k\)|$))"
    )
    comp_match = re.search(comp_pat, norm_single, re.IGNORECASE)
    if comp_match:
        complainant_name = _clean_summary_val(comp_match.group(1))

    if not complainant_name or complainant_name == "Not clearly found":
        comp_pat2 = (
            r"(?:5\.\s*(?:ಪಿರ್ಯಾದುದಾರ|complainant)|complainant/informant)"
            r".*?\(a\)\s*(?:ಹೆಸರು|name)\s*[:\-]?\s*(.+?)"
            r"(?=\n\s*(?:ತಂದೆ|Father|\([b-z]\)|\(k\)|\n\s*[b-z]\.)|$)"
        )
        comp_match = re.search(comp_pat2, norm, re.IGNORECASE | re.DOTALL)
        if comp_match:
            complainant_name = _clean_summary_val(comp_match.group(1))

    if not complainant_name or complainant_name == "Not clearly found":
        cpc_match = re.search(
            r"(?:ಶ್ರೀ|Sri)\s+([A-Za-z\u0C80-\u0CFF\s]+"
            r"(?:CPC|cpc|PSI|psi)[^\n,]*)",
            norm,
            re.IGNORECASE
        )
        if cpc_match:
            complainant_name = _clean_summary_val(cpc_match.group(1))

    addr_pat = (
        r"Passport\s+No\.?\s*(?:Date\s+of\s+Issue\s*:?)?\s*"
        r"([A-Za-z0-9\u0C80-\u0CFF\s\.\,\(\)\-\/]+?)"
        r"(?=\s*\(k\)\s*Address|\s*\(l\)|\s*\(m\)|\(l\)|\(m\)|$)"
    )
    comp_addr_match = re.search(addr_pat, norm_single, re.IGNORECASE)
    cleaned_addr = (
        _clean_summary_val(comp_addr_match.group(1))
        if comp_addr_match
        else ""
    )
    if comp_addr_match and len(cleaned_addr) > 3:
        complainant_address = cleaned_addr

    if not complainant_address:
        addr_pat2 = (
            r"(?:5\.\s*(?:ಪಿರ್ಯಾದುದಾರ|complainant)|complainant/informant)"
            r".*?\(k\)\s*(?:ವಿಳಾಸ|address)\s*[:\-]?\s*(.+?)"
            r"(?=\n\s*\(l\)|\(l\)|6\.|\n\s*6\.|$)"
        )
        comp_addr_match = re.search(addr_pat2, norm, re.IGNORECASE | re.DOTALL)
        if comp_addr_match:
            complainant_address = _clean_summary_val(comp_addr_match.group(1))

    place_pat = (
        r"(?:4\.\s*\(a\)\s*(?:ಕೃತ್ಯ\s+ನಡೆದ\s+ಸ್ಥಳ|"
        r"place\s+of\s+occur?rence\s+with\s+full\s+address|"
        r"place\s+of\s+occur?rence|place\s+of\s+incident))\s*[:\-]?\s*(.+?)"
        r"(?=\n\s*\([b-z]\)|\([b-z]\)|5\.|\n\s*5\.|$)"
    )
    place_match = re.search(place_pat, norm, re.IGNORECASE | re.DOTALL)
    if place_match:
        place = _clean_summary_val(place_match.group(1))

    if not place or place == "Not clearly found":
        place_pat2 = (
            r"Place of occurence with full address\s*(.+?)"
            r"(?=\s*\(b\)\s*Distance|\s*\(c\)|\s*5\.|$)"
        )
        place_match = re.search(place_pat2, norm_single, re.IGNORECASE)
        if place_match:
            place = _clean_summary_val(place_match.group(1))

    if not place or place == "Not clearly found":
        near_match = re.search(
            r"(?:near|ಸಮೀಪ)\s+(.+?)(?=\s*\(b\)|\s*\(c\)|\s*village|$)",
            norm_single,
            re.IGNORECASE
        )
        if near_match:
            place = _clean_summary_val(near_match.group(1))

    accused_pat = (
        r"(?:6\.\s*(?:ಗೊತ್ತಿರುವ/ಅನುಮಾನಿತ|ಶಂಕಿತ\s*/\s*ಆರೋಪಿತರ|"
        r"details\s+of\s+known/suspected/unknown\s+accused)).*?"
        r"(?=\n\s*[78]\.|\n\s*details\s+of\s+victims|"
        r"particulars\s+of\s+property|10\.\s*f\.i\.r|$)"
    )
    accused_section = re.search(
        accused_pat, norm, re.IGNORECASE | re.DOTALL
    )
    if accused_section:
        accused_text = accused_section.group(0)
        unk_pat = r"unknown|thieves|ಅಪರಿಚಿತ|ತಿಳಿದು\s*ಬಂದಿಲ್ಲ"
        if re.search(unk_pat, accused_text, re.IGNORECASE):
            accused_name = "Unknown / ಅಪರಿಚಿತ"
        else:
            acc_name_pat = (
                r"(?:1\s+|^6\..*?\n\s*)"
                r"([A-Za-z0-9\u0C80-\u0CFF\s/\(\)\.\,]+?)"
                r"(?=\n\s*(?:Male|Female|Adult|Accused|\d+\.|$))"
            )
            acc_name_match = re.search(
                acc_name_pat, accused_text, re.IGNORECASE | re.MULTILINE
            )
            if acc_name_match:
                accused_name = _clean_summary_val(acc_name_match.group(1))
                if len(accused_name) > 150:
                    accused_name = accused_name[:150] + "..."

    if not accused_name:
        acc_sec2_pat = (
            r"details of known/suspected/unknown accused.*?"
            r"(?=details of victims|particulars of property|"
            r"10\. f\.i\.r contents)"
        )
        acc_sec2 = re.search(acc_sec2_pat, norm, re.IGNORECASE | re.DOTALL)
        if acc_sec2:
            acc_text2 = acc_sec2.group(0)
            if re.search(r"unknown|thieves", acc_text2, re.IGNORECASE):
                accused_name = "Unknown"

    victim_pat = (
        r"(?:7\.\s*(?:ನೊಂದವರ|ಸಂತ್ರಸ್ತರ|details\s+of\s+victims)).*?"
        r"(?=\n\s*[89]\.|\n\s*particulars\s+of\s+property|10\.\s*f\.i\.r|$)"
    )
    victim_section = re.search(victim_pat, norm, re.IGNORECASE | re.DOTALL)
    if victim_section:
        victim_text = victim_section.group(0)
        v_name_pat = r"sl\.no\.\s*1\s*(.+?)(?=\s+(?:male|female|unknown)\s+)"
        victim_name_match = re.search(
            v_name_pat, victim_text, re.IGNORECASE | re.DOTALL
        )
        if victim_name_match:
            victim_name = _clean_summary_val(victim_name_match.group(1))
        else:
            v_match = re.search(
                r"(?:1\s+|^7\..*?\n\s*)([A-Za-z0-9\u0C80-\u0CFF\s/\(\)\.\,]+?)"
                r"(?=\n\s*(?:Male|Female|Adult|\d+\.|$))",
                victim_text,
                re.IGNORECASE
            )
            if v_match:
                victim_name = _clean_summary_val(v_match.group(1))

    return "\n".join([
        f"Complainant Name: {complainant_name or 'Not clearly found'}",
        f"Complainant Address: {complainant_address or 'Not clearly found'}",
        f"Accused Name: {accused_name or 'Not clearly found'}",
        f"Accused Address: {accused_address or 'Not clearly found'}",
        f"Victim Name: {victim_name or 'Not clearly found'}",
        f"Victim Address: {victim_address or 'Not clearly found'}",
        f"Place of Incident: {place or 'Not clearly found'}",
    ])


def _should_use_ocr(text: str) -> bool:
    cleaned = text.strip()
    if not cleaned or len(cleaned) < 50:
        return True
    return cleaned.count("\x00") > 2 or cleaned.count("") > 5


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"([\u0C80-\u0CFF])\1+", r"\1", text)
    paragraphs = []
    for paragraph in re.split(r"\n\s*\n", text.strip()):
        cleaned = re.sub(r"\s+", " ", paragraph).strip()
        if cleaned:
            paragraphs.append(cleaned)
    return "\n\n".join(paragraphs)


def _extract_with_pdftotext(pdf_path: Path) -> tuple[str, str]:
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf_path), "-"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
    except FileNotFoundError:
        return "", "pdftotext not available"
    if result.returncode != 0:
        err_msg = result.stderr.strip() or "unknown error"
        return "", f"pdftotext failed: {err_msg}"
    text = _normalize_text(result.stdout)
    if len(text.strip()) < 30:
        return "", "pdftotext returned insufficient text"
    return text, "Extracted via pdftotext"


def _ocr_pdf(pdf_path: Path) -> tuple[str, str]:
    try:
        import pytesseract
        from pdf2image import convert_from_path
    except ImportError as exc:
        return "", f"OCR dependencies unavailable: {exc}"

    poppler_path = None
    brew_prefix = os.environ.get("HOMEBREW_PREFIX")
    if brew_prefix:
        candidate = Path(brew_prefix) / "bin"
        if (candidate / "pdftoppm").exists():
            poppler_path = str(candidate)
    if not poppler_path:
        for candidate in [Path("/opt/homebrew/bin"), Path("/usr/local/bin")]:
            if (candidate / "pdftoppm").exists():
                poppler_path = str(candidate)
                break

    try:
        images = (
            convert_from_path(
                str(pdf_path), dpi=150, poppler_path=poppler_path
            )
            if poppler_path
            else convert_from_path(str(pdf_path), dpi=150)
        )
    except Exception as exc:
        return "", f"OCR conversion unavailable/failed: {exc}"

    for lang in ["kan+eng", "kan", "eng"]:
        try:
            raw_chunks = [
                pytesseract.image_to_string(image, lang=lang)
                for image in images
            ]
            text_chunks = [c for c in raw_chunks if isinstance(c, str)]
            full_text = "\n\n".join(
                chunk.strip() for chunk in text_chunks if chunk.strip()
            )
            if full_text:
                normalized = _normalize_text(full_text)
                if len(normalized.strip()) >= 30:
                    msg = (
                        "OCR text extracted successfully "
                        "using language model: "
                        f"{lang}."
                    )
                    return normalized, msg
        except (pytesseract.TesseractError, RuntimeError) as exc:
            logger.debug("OCR pass failed for lang %s: %s", lang, exc)
            continue
    return "", "OCR completed but no readable text was detected."


def _read_pdf_info(pdf_path: Path) -> dict[str, Any]:
    ocr_used = False
    ocr_status = ""
    pages_list: list[Any] = []

    try:
        with fitz.open(pdf_path) as doc:
            pages_list = [p for p in doc]
            text_chunks = [page.get_text() or "" for page in pages_list]
            full_text = _normalize_text("\n\n".join(text_chunks).strip())
    except (fitz.FileDataError, OSError) as exc:
        full_text = ""
        ocr_status = f"PyMuPDF extraction failed: {exc}"
        pages_list = []
    else:
        ocr_used = False
        ocr_status = "Extracted via PyMuPDF"

    if not full_text or _should_use_ocr(full_text):
        pdftotext_text, pdftotext_status = _extract_with_pdftotext(pdf_path)
        if pdftotext_text:
            full_text = _normalize_text(pdftotext_text)
            ocr_used = False
            ocr_status = pdftotext_status
        else:
            ocr_text, ocr_status = _ocr_pdf(pdf_path)
            if ocr_text:
                full_text = _normalize_text(ocr_text)
                ocr_used = True
            else:
                ocr_used = False

    if not pages_list:
        try:
            reader = PdfReader(str(pdf_path))
            pages_list = [p for p in reader.pages]
        except (ValueError, TypeError, OSError):
            pages_list = []

    paragraphs = [p for p in full_text.split("\n\n") if p.strip()]
    summary = " ".join(paragraphs[:3])[:1200]
    metadata: dict[str, str] = {}
    try:
        raw_meta = PdfReader(str(pdf_path)).metadata
        if raw_meta:
            metadata = {
                str(key): str(value) for key, value in raw_meta.items()
            }
    except (ValueError, TypeError, OSError) as exc:
        logger.debug("Could not read PDF metadata: %s", exc)

    keywords = _extract_keywords(full_text)
    plain_summary = _generate_plain_summary(full_text)
    summary_fields = _parse_summary_fields(plain_summary)
    complaint_date = _extract_complaint_date(full_text)
    acts_sections = _extract_acts_and_sections(full_text)

    tq_text = (
        f"{summary_fields.get('place_of_incident', '')} "
        f"{summary_fields.get('complainant_address', '')} {full_text}"
    )

    station_id, station_name = _get_station_from_filename(pdf_path.name)

    return {
        "name": pdf_path.name,
        "path": pdf_path.name,
        "size_mb": round(pdf_path.stat().st_size / (1024 * 1024), 2),
        "pages": len(pages_list),
        "summary": summary,
        "text": full_text,
        "paragraphs": paragraphs,
        "metadata": metadata,
        "keywords": keywords,
        "plain_summary": plain_summary,
        "summary_fields": summary_fields,
        "location": summary_fields.get("place_of_incident", ""),
        "complainant_name": summary_fields.get("complainant_name", ""),
        "complainant_address": summary_fields.get("complainant_address", ""),
        "accused_name": summary_fields.get("accused_name", ""),
        "accused_address": summary_fields.get("accused_address", ""),
        "victim_name": summary_fields.get("victim_name", ""),
        "victim_address": summary_fields.get("victim_address", ""),
        "complaint_date": complaint_date,
        "tq": _extract_tq(tq_text),
        "ocr_used": ocr_used,
        "ocr_status": ocr_status,
        "station_id": station_id,
        "station_name": station_name,
        "acts_sections": acts_sections,
    }


def get_pdf_info_cached(pdf_path: Path) -> dict[str, Any]:
    try:
        stat = pdf_path.stat()
        mtime = int(stat.st_mtime)
        size = stat.st_size
    except OSError:
        return _read_pdf_info(pdf_path)

    key = pdf_path.name
    with get_db() as conn:
        row = conn.execute(
            "SELECT mtime, size, data_json FROM fir_documents WHERE filename = ?;", (key,)
        ).fetchone()
        if row:
            if row["mtime"] == mtime and row["size"] == size:
                try:
                    data = json.loads(row["data_json"])
                    if isinstance(data, dict) and "acts_sections" in data:
                        return data
                except Exception:
                    pass

    data = _read_pdf_info(pdf_path)
    _save_record_to_db(data, mtime, size)
    return data


_LAST_SYNC_TIME = 0.0


def sync_all_pdfs(force: bool = False, max_workers: int = 4) -> int:
    """Sync any PDF files on disk that are not yet in the SQLite DB using parallel workers."""
    global _LAST_SYNC_TIME
    now = time.time()
    if not force and (now - _LAST_SYNC_TIME) < 30.0:
        return 0
    _LAST_SYNC_TIME = now

    pdf_dir = config.PDF_DIR
    if not pdf_dir.exists():
        return 0

    pdf_paths = list(pdf_dir.glob("*.pdf"))
    with get_db() as conn:
        existing = {r[0] for r in conn.execute("SELECT filename FROM fir_documents;").fetchall()}

    to_process = [p for p in pdf_paths if p.name not in existing]
    if not to_process:
        return 0

    count = 0
    # Process batch in parallel for fast CPU/IO concurrency
    worker_count = min(max_workers, max(1, len(to_process)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=worker_count) as executor:
        future_to_pdf = {executor.submit(get_pdf_info_cached, p): p for p in to_process}
        for future in concurrent.futures.as_completed(future_to_pdf):
            p = future_to_pdf[future]
            try:
                future.result()
                count += 1
            except Exception as exc:
                logger.warning("Skipping unparseable PDF %s: %s", p.name, exc)

    return count
