"""Web view handlers for the FIR explorer dashboard and PDF viewer."""

from flask import Blueprint, abort, render_template, request, send_from_directory

from core import config
from core.config import STATION_MAP, _highlight_matches
from core.extractor import get_pdf_info_cached
from core.repository import (
    get_highest_firs_summary,
    get_station_counts,
    get_station_stats,
    list_pdfs,
)

web_bp = Blueprint("web", __name__)


@web_bp.route("/")
def index():
    query = request.args.get("q", "").strip()
    tq = request.args.get("tq", "").strip()
    date_order = request.args.get("date_order", "fir_desc").strip().lower()
    station_id = request.args.get("station_id", "").strip()

    start_fir_raw = request.args.get("start_fir", "").strip()
    end_fir_raw = request.args.get("end_fir", "").strip()

    start_fir = int(start_fir_raw) if start_fir_raw.isdigit() else None
    end_fir = int(end_fir_raw) if end_fir_raw.isdigit() else None

    records = list_pdfs(query, tq, date_order, station_id, start_fir, end_fir)
    station_counts = get_station_counts()
    station_stats = get_station_stats()
    highest_firs = get_highest_firs_summary()
    return render_template(
        "index.html",
        records=records,
        query=query,
        tq=tq,
        date_order=date_order,
        station_id=station_id,
        start_fir=start_fir,
        end_fir=end_fir,
        station_map=STATION_MAP,
        station_counts=station_counts,
        station_stats=station_stats,
        highest_firs=highest_firs,
    )


@web_bp.route("/pdf/<path:filename>")
def pdf_detail(filename: str):
    pdf_dir = config.PDF_DIR
    pdf_path = (pdf_dir / filename).resolve()
    if not pdf_path.is_relative_to(pdf_dir.resolve()):
        abort(404)
    if not pdf_path.exists() or pdf_path.suffix.lower() != ".pdf":
        abort(404)

    query = request.args.get("q", "").strip()
    record = get_pdf_info_cached(pdf_path).copy()
    paras = record.get("paragraphs", [])
    para_list = paras if isinstance(paras, list) else []

    if query:
        highlighted_paragraphs = [
            _highlight_matches(str(para), query) for para in para_list
        ]
        record["highlighted_paragraphs"] = highlighted_paragraphs
    else:
        record["highlighted_paragraphs"] = [
            _highlight_matches(str(para), "") for para in para_list
        ]
    return render_template("detail.html", pdf=record, query=query)


@web_bp.route("/download/<path:filename>")
def download_pdf(filename: str):
    pdf_dir = config.PDF_DIR
    pdf_path = pdf_dir / filename
    if not pdf_path.exists() or pdf_path.suffix.lower() != ".pdf":
        abort(404)
    response = send_from_directory(pdf_dir, pdf_path.name, as_attachment=False)
    response.headers["Content-Type"] = "application/pdf"
    response.headers["Content-Disposition"] = (
        f'inline; filename="{pdf_path.name}"'
    )
    return response


def register_web_routes(app):
    """Register web routes directly on Flask app to maintain root url_for names."""
    app.add_url_rule("/", view_func=index, endpoint="index")
    app.add_url_rule("/pdf/<path:filename>", view_func=pdf_detail, endpoint="pdf_detail")
    app.add_url_rule("/download/<path:filename>", view_func=download_pdf, endpoint="download_pdf")
