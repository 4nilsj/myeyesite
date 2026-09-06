"""Routes for CSV, Excel (.xlsx) data export and printable police dossiers."""

from datetime import UTC, datetime

from flask import Blueprint, Response, abort, render_template, request

from core import config
from core.config import STATION_MAP
from core.dossier_extractor import extract_rich_dossier_data
from core.export import generate_csv_data, generate_excel_workbook
from core.extractor import get_pdf_info_cached
from core.repository import list_pdfs

export_bp = Blueprint("export", __name__)


def _parse_filter_args():
    query = request.args.get("q", "").strip()
    tq = request.args.get("tq", "").strip()
    date_order = request.args.get("date_order", "fir_desc").strip().lower()
    station_id = request.args.get("station_id", "").strip()
    category = request.args.get("category", "").strip()

    start_fir_raw = request.args.get("start_fir", "").strip()
    end_fir_raw = request.args.get("end_fir", "").strip()
    start_fir = int(start_fir_raw) if start_fir_raw.isdigit() else None
    end_fir = int(end_fir_raw) if end_fir_raw.isdigit() else None

    return query, tq, date_order, station_id, category, start_fir, end_fir


@export_bp.route("/export/csv")
def export_csv():
    query, tq, date_order, station_id, category, start_fir, end_fir = _parse_filter_args()
    records = list_pdfs(
        query=query,
        tq=tq,
        date_order=date_order,
        station_id=station_id,
        start_fir=start_fir,
        end_fir=end_fir,
        category=category,
    )

    csv_data = generate_csv_data(records)
    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    sid_part = f"station_{station_id}" if station_id else "all_stations"
    cat_part = f"_{category.lower().replace(' ', '_').replace('/', '_')}" if category else ""
    filename = f"fir_export_{sid_part}{cat_part}_{timestamp}.csv"

    return Response(
        csv_data,
        mimetype="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8-sig",
        },
    )


@export_bp.route("/export/excel")
def export_excel():
    query, tq, date_order, station_id, category, start_fir, end_fir = _parse_filter_args()
    records = list_pdfs(
        query=query,
        tq=tq,
        date_order=date_order,
        station_id=station_id,
        start_fir=start_fir,
        end_fir=end_fir,
        category=category,
    )

    excel_bytes = generate_excel_workbook(records)
    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    sid_part = f"station_{station_id}" if station_id else "all_stations"
    cat_part = f"_{category.lower().replace(' ', '_').replace('/', '_')}" if category else ""
    filename = f"fir_export_{sid_part}{cat_part}_{timestamp}.xlsx"

    return Response(
        excel_bytes,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@export_bp.route("/dossier")
def batch_dossier():
    query, tq, date_order, station_id, category, start_fir, end_fir = _parse_filter_args()
    records = list_pdfs(
        query=query,
        tq=tq,
        date_order=date_order,
        station_id=station_id,
        start_fir=start_fir,
        end_fir=end_fir,
        category=category,
    )

    station_name = STATION_MAP.get(station_id, f"Station {station_id}") if station_id else "All Police Stations"
    report_date = datetime.now(UTC).strftime("%d %B %Y, %H:%M UTC")

    return render_template(
        "dossier.html",
        records=records,
        single_mode=False,
        station_name=station_name,
        category=category,
        report_date=report_date,
    )


@export_bp.route("/dossier/<path:filename>")
def single_dossier(filename: str):
    pdf_dir = config.PDF_DIR
    pdf_path = (pdf_dir / filename).resolve()
    if not pdf_path.is_relative_to(pdf_dir.resolve()):
        abort(404)
    if not pdf_path.exists() or pdf_path.suffix.lower() != ".pdf":
        abort(404)

    record = get_pdf_info_cached(pdf_path)
    dossier = extract_rich_dossier_data(record)
    return render_template(
        "dossier.html",
        record=record,
        dossier=dossier,
        single_mode=True,
    )


def register_export_routes(app):
    """Register export and dossier routes directly on the Flask app."""
    app.add_url_rule("/export/csv", view_func=export_csv, endpoint="export_csv")
    app.add_url_rule("/export/excel", view_func=export_excel, endpoint="export_excel")
    app.add_url_rule("/dossier", view_func=batch_dossier, endpoint="batch_dossier")
    app.add_url_rule("/dossier/<path:filename>", view_func=single_dossier, endpoint="single_dossier")
