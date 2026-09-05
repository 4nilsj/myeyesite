"""Legal acts, sections, and crime category badge classification engine."""

import re

CRIME_CATEGORIES: list[dict[str, str]] = [
    {"label": "Theft", "icon": "🔓", "css": "badge-crime-theft"},
    {"label": "Cyber Scam", "icon": "💻", "css": "badge-crime-cyber"},
    {"label": "Assault / Fight", "icon": "🥊", "css": "badge-crime-assault"},
    {"label": "Accident", "icon": "🚗", "css": "badge-crime-accident"},
    {"label": "Gang Fight", "icon": "👥", "css": "badge-crime-gang"},
    {"label": "Half Murder", "icon": "🗡️", "css": "badge-crime-murder"},
    {"label": "Murder", "icon": "☠️", "css": "badge-crime-murder"},
    {"label": "Kidnapping", "icon": "🚨", "css": "badge-crime-kidnap"},
    {"label": "Robbery", "icon": "💰", "css": "badge-crime-theft"},
    {"label": "Land Dispute / Trespass", "icon": "🏡", "css": "badge-crime-land"},
    {"label": "Threats & Abuse", "icon": "⚠️", "css": "badge-crime-threats"},
    {"label": "Illegal Liquor", "icon": "🍾", "css": "badge-crime-liquor"},
    {"label": "Gambling", "icon": "🎲", "css": "badge-crime-gambling"},
    {"label": "Woman Harassment", "icon": "🛡️", "css": "badge-crime-threats"},
    {"label": "Domestic Cruelty", "icon": "🏠", "css": "badge-crime-threats"},
    {"label": "General Offense", "icon": "⚖️", "css": "badge-crime"},
]


def get_crime_type_badge(acts_str: str = "", text: str = "") -> str:
    acts_clean = (acts_str or "").upper()

    # Extract legal section segment after U/S, U/s, SECTION, SEC, or ಕಲಂ
    sec_match = re.search(
        r"(?:U/S|U/s|SECTION|SEC|ಕಲಂ|ಕಾಯ್ದೆ)\s*[:\-]?\s*([A-Za-z0-9\(\)\,\s/-]+)",
        acts_clean
    )
    sec_text = sec_match.group(1) if sec_match else acts_clean

    # 1. BNSS 126 / CrPC 107/151 -> Preventive action for Group Clash / Gang Fight
    if re.search(r"\b126\b|\b126\(|\b129\b|\b130\b|\b170\b|\b107\b|\b151\b", sec_text) and (
        "BNSS" in acts_clean or "CRPC" in acts_clean
    ):
        return "Gang Fight"

    # 2. Attempted Murder / Half Murder: BNS 109, IPC 307
    if re.search(r"\b109\b|\b109\(|\b307\b", sec_text):
        return "Half Murder"

    # 3. Murder: BNS 103, IPC 302
    if re.search(r"\b103\b|\b103\(|\b302\b", sec_text):
        return "Murder"

    # 4. Kidnapping: BNS 137, IPC 363, 364, 365, 366
    if re.search(r"\b137\b|\b137\(|\b363\b|\b364\b|\b365\b|\b366\b", sec_text):
        return "Kidnapping"

    # 5. Theft: BNS 303, 305, IPC 378, 379, 380, 381
    if re.search(r"\b303\b|\b303\(|\b305\b|\b305\(|\b378\b|\b379\b|\b380\b|\b381\b", sec_text):
        return "Theft"

    # 6. Accident: BNS 281, 106, IPC 279, 304A, MV Act 187, 184, 185
    if re.search(r"\b281\b|\b106\b|\b106\(|\b279\b|\b304A\b|\b187\b|\b184\b|\b185\b", sec_text):
        return "Accident"

    # 7. Gang Fight / Rioting / Unlawful Assembly: BNS 189, 190, 191, IPC 143, 147, 148, 149
    if re.search(r"\b189\b|\b190\b|\b191\b|\b143\b|\b147\b|\b148\b|\b149\b", sec_text):
        return "Gang Fight"

    # 8. Assault / Physical Fight: BNS 115, 117, 118, IPC 323, 324, 325, 326
    if re.search(r"\b115\b|\b117\b|\b118\b|\b323\b|\b324\b|\b325\b|\b326\b", sec_text):
        return "Assault / Fight"

    # 9. Cyber Scam / Fraud: IT Act 66C, 66D, BNS 318, 319, IPC 419, 420
    if re.search(r"\b66C\b|\b66D\b|\b318\b|\b319\b|\b419\b|\b420\b", sec_text) or "INFORMATION TECHNOLOGY" in acts_clean:
        return "Cyber Scam"

    # 10. Robbery / Dacoity: BNS 309, 310, IPC 392, 395
    if re.search(r"\b309\b|\b310\b|\b392\b|\b395\b", sec_text):
        return "Robbery"

    # 11. Land Dispute / Trespass: BNS 329, 331, IPC 447, 448, 451, 452
    if re.search(r"\b329\b|\b331\b|\b447\b|\b448\b|\b451\b|\b452\b", sec_text):
        return "Land Dispute / Trespass"

    # 12. Threats & Abuse: BNS 351, 352, 353, IPC 504, 506, 509
    if re.search(r"\b351\b|\b352\b|\b353\b|\b504\b|\b506\b|\b509\b", sec_text):
        return "Threats & Abuse"

    # 13. Excise / Illegal Liquor
    if "EXCISE" in acts_clean or "LIQUOR" in acts_clean or (re.search(r"\b32\b|\b34\b", sec_text) and "EXCISE" in acts_clean):
        return "Illegal Liquor"

    # 14. Gambling
    if "GAMBLING" in acts_clean or (re.search(r"\b78\b|\b87\b", sec_text) and "GAMBLING" in acts_clean):
        return "Gambling"

    # 15. Woman Harassment: BNS 74, 75, 76, 78, IPC 354, 354D
    if "POCSO" in acts_clean or (
        re.search(r"\b74\b|\b74\(|\b75\b|\b75\(|\b76\b|\b76\(|\b78\b|\b78\(|\b354\b|\b354D\b", sec_text)
        and ("BNS" in acts_clean or "IPC" in acts_clean or "WOMAN" in acts_clean)
    ):
        return "Woman Harassment"

    # 16. Domestic Cruelty: BNS 85, IPC 498A
    if re.search(r"\b85\b|\b85\(|\b498A\b", sec_text) and ("BNS" in acts_clean or "IPC" in acts_clean):
        return "Domestic Cruelty"

    return "General Offense"
