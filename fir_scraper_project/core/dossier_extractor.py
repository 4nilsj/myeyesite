"""
core/dossier_extractor.py
Deep field extraction engine for Karnataka State Police FIR documents.
Extracts structured complainant details, accused, victims, occurrence timing,
involved properties/vehicles, and the verbatim First Information Report narrative.
"""

from __future__ import annotations

import re
from typing import Any


def clean_val(val: str) -> str:
    """Clean extra spaces, newlines, and trailing punctuation."""
    if not val:
        return ""
    val = re.sub(r"[\r\n\t]+", " ", val)
    val = re.sub(r"\s+", " ", val)
    val = val.strip(" :,.-/\\")
    return val


def extract_rich_dossier_data(record: dict[str, Any]) -> dict[str, Any]:
    """
    Extracts deep, structured dossier intelligence from a cached or extracted FIR record.
    """
    text = record.get("text", "") or ""
    paragraphs = record.get("paragraphs", []) or []

    data: dict[str, Any] = {
        "complainant": {
            "name": record.get("complainant_name", "") or "",
            "father_spouse": "",
            "age": "",
            "gender": "",
            "occupation": "",
            "phone": "",
            "email": "",
            "address": record.get("complainant_address", "") or "",
            "eyewitness": "",
        },
        "accused_list": [],
        "victim_list": [],
        "incident_meta": {
            "location": record.get("location", "") or "",
            "tq": record.get("tq", "") or "",
            "occurrence_datetime": "",
            "ps_received_datetime": "",
            "gd_entry": "",
            "distance_from_ps": "",
            "village_beat": "",
            "court_name": "",
        },
        "property_items": [],
        "property_total_value": "",
        "fir_narrative": "",
    }

    if not text:
        return data

    # -------------------------------------------------------------
    # 1. COURT & INCIDENT TIMING / OCCURRENCE DETAILS (Sections 1-4)
    # -------------------------------------------------------------
    m_court = re.search(r"ಘನ\s*ನ್ಯಾಯಾಲಯ\s*:\s*([^\n\d]+?)(?=\s*1\.|$)", text, re.IGNORECASE)
    if m_court:
        data["incident_meta"]["court_name"] = clean_val(m_court.group(1))

    # Occurrence date & time range
    m_occ = re.search(
        r"ಕೃತ್ಯ\s*ನಡೆದ\s*ದಿನ\s*:\s*(\w+)?\s*ದಿನಾಂಕ\s*ದಿಂದ\s*:\s*([\d\/\-]+)"
        r"(?:\s*ದಿನಾಂಕ\s*ವರೆಗೆ\s*:\s*([\d\/\-]+))?"
        r"(?:.*?ವೇಳೆಯಿಂದ\s*:\s*([\d\:]+))?"
        r"(?:.*?ವೇಳೆಯವರೆಗೆ\s*:\s*([\d\:]+))?",
        text,
        re.IGNORECASE,
    )
    if m_occ:
        day = m_occ.group(1) or ""
        d_from = m_occ.group(2) or ""
        d_to = m_occ.group(3) or d_from
        t_from = m_occ.group(4) or ""
        t_to = m_occ.group(5) or ""

        parts = []
        if day:
            parts.append(day + ",")
        if d_from:
            time_str = f" at {t_from}" if t_from else ""
            if d_to and d_to != d_from:
                to_time = f" at {t_to}" if t_to else ""
                parts.append(f"{d_from}{time_str} to {d_to}{to_time}")
            else:
                to_time = f" - {t_to}" if t_to and t_to != t_from else ""
                parts.append(f"{d_from}{time_str}{to_time}")
        data["incident_meta"]["occurrence_datetime"] = " ".join(parts).strip()

    # Police station receipt date & time
    m_ps = re.search(
        r"ಠಾಣೆಯಲ್ಲಿ\s*ವರ್ತಮಾನ\s*ಸ್ವೀಕರಿಸಿದ\s*ದಿನಾಂಕ\s*:\s*([\d\/\-]+).*?(\d{1,2}:\d{2}(?::\d{2})?)",
        text,
        re.IGNORECASE,
    )
    if m_ps:
        data["incident_meta"]["ps_received_datetime"] = f"{m_ps.group(1)} at {m_ps.group(2)} hrs"

    # General diary entry
    m_gd = re.search(
        r"ಜನರಲ್‌\s*ಡೈರಿ\s*ಉಲ್ಲೆಖ\s*ಸಂಖ್ಯೆ\s*ಮತ್ತು\s*ಸಮಯ\s*:\s*([^\n\d]*\d+[^\n]*)",
        text,
        re.IGNORECASE,
    )
    if m_gd:
        data["incident_meta"]["gd_entry"] = clean_val(m_gd.group(1))

    # Distance & direction from PS
    m_dist = re.search(
        r"ಪೊಲೀಸ್‌\s*ಠಾಣೆ\s*ಯಿಂದ\s*ಇರುವ\s*ದಿಕ್ಕು\s*ಮತ್ತು\s*ದೂರ\s*:\s*(.+?)(?=\([c-z]\)|4\.\s*\(c\)|\n\s*\(c\)|\n\s*5\.|$)",
        text,
        re.IGNORECASE,
    )
    if m_dist:
        data["incident_meta"]["distance_from_ps"] = clean_val(m_dist.group(1))

    # Village & Beat
    m_beat = re.search(
        r"ಗ್ರಾಮ\s*:\s*([^\n\(]+).*?ಗಸ್ತಿನ\s*ಹೆಸರು\s*:\s*([^\n\(]+)",
        text,
        re.IGNORECASE,
    )
    if m_beat:
        v_name = clean_val(m_beat.group(1))
        b_name = clean_val(m_beat.group(2))
        data["incident_meta"]["village_beat"] = f"{v_name} ({b_name})" if b_name else v_name

    # -------------------------------------------------------------
    # 2. COMPLAINANT DETAILED DEMOGRAPHICS (Section 5)
    # -------------------------------------------------------------
    m_comp = re.search(
        r"5\.\s*ಪಿರ್ಯಾದುದಾರ\s*\/.*?(?=\n\s*6\.\s*ಗೊತ್ತಿರುವ|6\.\s*details|$)",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if m_comp:
        c_block = m_comp.group(0)
        c_name = re.search(r"\(a\)\s*ಹೆಸರು\s*:\s*([^\n\(]+)", c_block)
        if c_name and not data["complainant"]["name"]:
            data["complainant"]["name"] = clean_val(c_name.group(1))

        c_father = re.search(r"ತಂದೆ\s*\/gಂಡನ\s*ಹೆಸರು\s*:\s*([^\n\(]+)|ತಂದೆ\/ಗಂಡನ\s*ಹೆಸರು\s*:\s*([^\n\(]+)", c_block)
        if c_father:
            f_val = c_father.group(1) or c_father.group(2) or ""
            data["complainant"]["father_spouse"] = clean_val(f_val)

        c_age = re.search(r"\(b\)\s*ವಯಸ್ಸು\s*:\s*(\d+)", c_block)
        if c_age:
            data["complainant"]["age"] = c_age.group(1)

        c_occ = re.search(r"\(c\)\s*ವೃತ್ತಿ\s*:\s*([^\n\(]+)", c_block)
        if c_occ:
            data["complainant"]["occupation"] = clean_val(c_occ.group(1))

        c_email = re.search(r"\(f\)\s*ಇ-ಮೇಲ್\s*:\s*([^\n\s\(]+)", c_block)
        if c_email:
            data["complainant"]["email"] = clean_val(c_email.group(1))

        c_phone = re.search(r"\(g\)\s*ದೂರವಾಣಿ\s*:\s*(\d{8,12})", c_block)
        if c_phone:
            data["complainant"]["phone"] = c_phone.group(1)

        c_gender = re.search(r"\(h\)\s*ಲಿಂಗ\s*:\s*([^\n\(]+)", c_block)
        if c_gender:
            data["complainant"]["gender"] = clean_val(c_gender.group(1))

        c_eye = re.search(r"\(l\)\s*ಪಿರ್ಯಾದುದಾರ\s*ಖುದ್ದಾಗಿ\s*ನೋಡಿದ್ದರೆ\s*:\s*([^\n]+)", c_block)
        if c_eye:
            data["complainant"]["eyewitness"] = clean_val(c_eye.group(1))

        c_addr = re.search(r"\(k\)\s*ವಿಳಾಸ\s*:\s*([^\n]+)", c_block)
        if c_addr and not data["complainant"]["address"]:
            data["complainant"]["address"] = clean_val(c_addr.group(1))

    # -------------------------------------------------------------
    # 3. ACCUSED / SUSPECTS REGISTRY (Section 6)
    # -------------------------------------------------------------
    m_acc = re.search(
        r"6\.\s*(?:ಗೊತ್ತಿರುವ\/ಅನುಮಾನಿತ|details\s+of\s+known).*?"
        r"(?=\n\s*(?:7\.\s*ನೊಂದವರ|7\.\s*details|8\.\s*ಕಳುವಾಗಿರುವ))",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if m_acc:
        raw_acc = m_acc.group(0)
        # Strip section header and column descriptions
        body_acc = re.sub(r"^6\..*?:\s*", "", raw_acc, flags=re.DOTALL)
        body_acc = re.sub(
            r"^(?:ಹೆಸರು|ತಂದೆಯ|ಸ\.ನಂ|ವಿಧ|ವ್ಯಕ್ತಿಯ|ಲಿಂಗ|ವಯಸ್ಸು|ವೃತ್ತಿ|ಜಾತಿ|ವಿಳಾಸ|name|father|sl\.?no|type|sex|gender|age|occupation|caste|address|\/|\s)+",
            "",
            body_acc,
            flags=re.IGNORECASE,
        ).strip()
        body_acc = re.sub(r"Page\s+\d+\s+of\s+\d+", "", body_acc).strip()

        # Check if clearly unknown
        if not body_acc or re.match(r"^(?:unknown|thieves|ಅಪರಿಚಿತ|ತಿಳಿದು\s*ಬಂದಿಲ್ಲ|not\s*known)\b", body_acc, re.IGNORECASE):
            data["accused_list"].append({
                "name": "Unknown / ಅಪರಿಚಿತ (Unidentified Suspect)",
                "details": "Details not known at time of FIR registration",
            })
        else:
            match_row = re.search(r"(?:Address\s*|ವಿಳಾಸ\s*|\b)1\s+(.+)$", body_acc, re.DOTALL | re.IGNORECASE)
            content_to_use = match_row.group(1).strip() if match_row else body_acc
            lines = [clean_val(l) for l in content_to_use.split("\n") if clean_val(l)]
            first_line = lines[0] if lines else content_to_use
            first_line = re.sub(r"^\d+\s+", "", first_line)
            data["accused_list"].append({
                "name": first_line,
                "details": " ".join(lines[1:]) if len(lines) > 1 else "",
            })
    else:
        acc_rec = record.get("accused_name", "") or "Unknown / ಅಪರಿಚಿತ"
        data["accused_list"].append({
            "name": acc_rec,
            "details": record.get("accused_address", "") or "",
        })

    # -------------------------------------------------------------
    # 4. VICTIMS REGISTRY (Section 7)
    # -------------------------------------------------------------
    m_vic = re.search(
        r"7\.\s*(?:ನೊಂದವರ|details\s+of\s+victims).*?"
        r"(?=\n\s*(?:8\.\s*ಕಳುವಾಗಿರುವ|8\.\s*particulars|9\.\s*ಪಂಚನಾಮ|10\.))",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if m_vic:
        raw_vic = m_vic.group(0)
        body_vic = re.sub(r"^7\..*?:\s*", "", raw_vic, flags=re.DOTALL)
        body_vic = re.sub(
            r"^(?:ಸ\.ನಂ|ಹೆಸರು|ವಿಳಾಸ|ಗಾಯದ\s*ವಿಧ|ಲಿಂಗ|ವಯಸ್ಸು|ವೃತ್ತಿ|sl\.?no|name|address|injury|sex|gender|age|occupation|\/|\s)+",
            "",
            body_vic,
            flags=re.IGNORECASE,
        ).strip()
        body_vic = re.sub(r"Page\s+\d+\s+of\s+\d+", "", body_vic).strip()

        match_vic_row = re.search(r"(?:Occupation\s*|ವೃತ್ತಿ\s*|\b)1\s+(.+)$", body_vic, re.DOTALL | re.IGNORECASE)
        content_vic = match_vic_row.group(1).strip() if match_vic_row else body_vic

        header_words_pat = r"^(?:sl\.?no|name|address|injury|type|sex|gender|age|occupation|details\s+of\s+victims|\d|\s|\/|\.)+$"
        if content_vic and not re.match(header_words_pat, content_vic, re.IGNORECASE) and not re.match(r"^(?:not\s*found|none|nil|ತಿಳಿದು\s*ಬಂದಿಲ್ಲ)\b", content_vic, re.IGNORECASE):
            vic_lines = [clean_val(l) for l in content_vic.split("\n") if clean_val(l)]
            vic_entry = re.sub(r"^\d+\s+", "", vic_lines[0] if vic_lines else content_vic)
            data["victim_list"].append({
                "name": vic_entry,
                "details": " ".join(vic_lines[1:]) if len(vic_lines) > 1 else "",
            })
    if not data["victim_list"]:
        vic_rec = record.get("victim_name", "") or ""
        if vic_rec and vic_rec != "Not clearly found":
            data["victim_list"].append({
                "name": vic_rec,
                "details": record.get("victim_address", "") or "",
            })
        else:
            comp_n = data["complainant"]["name"] or "Complainant"
            data["victim_list"].append({
                "name": f"{comp_n} (Primary Aggrieved Party / State)",
                "details": "No separate victim recorded — complainant / public interest is primary aggrieved",
            })

    # -------------------------------------------------------------
    # 5. PROPERTIES & VEHICLES INVOLVED (Section 8)
    # -------------------------------------------------------------
    m_prop = re.search(
        r"8\.\s*(?:ಕಳುವಾಗಿರುವ|particulars\s+of\s+property).*?(?=(?:9\.|10\.))",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if m_prop:
        raw_prop = m_prop.group(0)
        m_tot = re.search(
            r"(?:ಕಳುವಾಗಿರುವ\s*\/[^\:]*ಮೌಲ್ಯ|total\s+value)\s*:\s*([\d\.\,]+)",
            raw_prop,
            re.IGNORECASE,
        )
        if m_tot:
            data["property_total_value"] = m_tot.group(1).strip()

        item_matches = re.findall(
            r"(\d+)\s+([A-Za-z\s]+?)\s+([A-Za-z0-9\s\-\_]+?)\s+([\d]+\.\d{2})",
            raw_prop,
        )
        for num, itype, desc, val in item_matches:
            data["property_items"].append({
                "sl": num.strip(),
                "type": clean_val(itype),
                "description": clean_val(desc),
                "value": f"₹ {val.strip()}",
            })

    # -------------------------------------------------------------
    # 6. VERBATIM FIRST INFORMATION REPORT NARRATIVE (Section 10)
    # -------------------------------------------------------------
    m_narr = re.search(
        r"(?:10\.\s*(?:ಪ್ರಥಮ\s*ವರ್ತಮಾನ\s*ವರದಿಯ\s*ವಿವರಗಳು|f\.i\.r\s*contents?|first\s*information\s*contents?)\s*[:\-]?(.*?))"
        r"(?=(?:11\.|12\.|13\.|14\.|signature|ಹಸ್ತಾಕ್ಷರ|$))",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if m_narr:
        narr_text = m_narr.group(1).strip()
        narr_text = re.sub(r"Page\s+\d+\s+of\s+\d+", "", narr_text).strip()
        data["fir_narrative"] = narr_text
    elif paragraphs:
        data["fir_narrative"] = "\n\n".join(paragraphs[1:]) if len(paragraphs) > 1 else paragraphs[0]
    else:
        data["fir_narrative"] = record.get("plain_summary") or record.get("summary") or "Complaint details not digitised."

    return data
