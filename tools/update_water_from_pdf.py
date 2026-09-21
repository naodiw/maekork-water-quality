#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""อัปเดตข้อมูลคุณภาพน้ำใน data.json จากรายงาน PDF ของกรมควบคุมมลพิษ

ใช้ตารางใน "ภาคผนวก ข" (ผลตรวจทุกพารามิเตอร์ ครั้งที่ 1 ถึงครั้งล่าสุด)
และพิกัดจุดเก็บตัวอย่างใน "ภาคผนวก ค" ของรายงานฉบับล่าสุด

วิธีใช้:
    python tools/update_water_from_pdf.py "C:\\path\\to\\report.pdf"
    python tools/update_water_from_pdf.py report.pdf --check   # ตรวจอย่างเดียว ไม่เขียนไฟล์

ต้องมี pdfplumber:  pip install pdfplumber
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data.json"

# ลำดับพารามิเตอร์ตามที่แสดงบนเว็บ  (ชื่อในตาราง PDF -> ชื่อที่ใช้ใน data.json, สัญลักษณ์, หน่วย, ค่ามาตรฐาน)
PARAMETERS = [
    ("ความขุ่น", "ความขุ่น", "Turbidity", "NTU", None),
    ("สารหนู", "สารหนู", "As", "mg/L", 0.01),
    ("แมงกานีส", "แมงกานีส", "Mn", "mg/L", 1.0),
    ("ตะกั่ว", "ตะกั่ว", "Pb", "mg/L", 0.05),
    ("ปรอท", "ปรอท", "Hg", "mg/L", 0.002),
    ("ทองแดง", "ทองแดง", "Cu", "mg/L", 0.1),
    ("สังกะส", "สังกะสี", "Zn", "mg/L", 1.0),
    ("นิกเกิล", "นิกเกิล", "Ni", "mg/L", 0.1),
    ("แคดเมียม", "แคดเมียม", "Cd", "mg/L", 0.005),
]
PDF_PARAM_NAMES = {p[0] for p in PARAMETERS}

# จุดตรวจวัดที่ยังเก็บตัวอย่างอยู่ (ตารางที่ 1 ของรายงาน) — พิกัดดึงจากภาคผนวก ค อัตโนมัติ
WATER_POINTS = [
    ("KK01", "แม่น้ำกก", "ชายแดนไทย-พม่า หย่อมบ้านแก่งตุ๋ม ม.14 ต.ท่าตอน อ.แม่อาย", "เชียงใหม่",
     "ย้ายจุดจากสะพานท่าตอน มาที่ชายแดนไทย-พม่า ตั้งแต่ พ.ค. 2569"),
    ("KK02", "แม่น้ำกก", "สะพานมิตรภาพแม่นาวาง-ท่าตอน ต.ท่าตอน อ.แม่อาย", "เชียงใหม่", None),
    ("KK05", "แม่น้ำกก", "สะพานมิตรภาพแม่ยาว-ดอยฮาง ต.ดอยฮาง อ.เมือง", "เชียงราย", None),
    ("KK07", "แม่น้ำกก", "สะพานข้ามแม่น้ำกก ต.ดอยฮาง อ.เมือง", "เชียงราย", None),
    ("KK09", "แม่น้ำกก", "สะพานเหนือเมืองเชียงราย ต.รอบเวียง อ.เมือง", "เชียงราย",
     "ขยับจุดจากสะพานเฉลิมพระเกียรติ 1 เนื่องจากมีการขุดเจาะกลางลำน้ำเพื่อก่อสร้างทางต่างระดับ"),
    ("KK10", "แม่น้ำกก", "ฝายเชียงราย ต.รอบเวียง อ.เมือง", "เชียงราย", None),
    ("KK11", "แม่น้ำกก", "สะพานริมกก-เวียงเหนือรวมใจ ต.เวียงเหนือ อ.เวียงชัย", "เชียงราย", None),
    ("KK12", "แม่น้ำกก", "สะพานโยนกนาคนคร ต.แม่ข้าวต้ม อ.เมือง", "เชียงราย",
     "ใช้แทนจุด KK13 (ต.ท่าข้าวเปลือก อ.แม่จัน) ตั้งแต่ ก.พ. 2569"),
    ("KK15", "แม่น้ำกก", "ต.บ้านแซว อ.เชียงแสน", "เชียงราย", None),
    ("FA01", "แม่น้ำฝาง", "บ้านคาย ต.มะลิกา อ.แม่อาย", "เชียงใหม่", None),
    ("KO01", "แม่น้ำกรณ์", "ต.ท่าสาย อ.เมือง", "เชียงราย", None),
    ("LA01", "แม่น้ำลาว", "ต.เวียงชัย อ.เวียงชัย", "เชียงราย", None),
    ("SA01", "แม่น้ำสาย", "ชายแดนไทย-พม่า บ้านหัวฝาย ต.แม่สาย อ.แม่สาย", "เชียงราย", None),
    ("SA02", "แม่น้ำสาย", "สะพานมิตรภาพแม่น้ำสายแห่งที่ 2 ต.แม่สาย อ.แม่สาย", "เชียงราย", None),
    ("SA03", "แม่น้ำสาย", "บ้านป่าซางงาม ม.6 ต.เกาะช้าง อ.แม่สาย", "เชียงราย", None),
    ("RU01", "แม่น้ำรวก", "สถานีสูบน้ำเกาะช้าง การประปาส่วนภูมิภาค สาขาแม่สาย อ.แม่สาย", "เชียงราย", None),
    ("RU02", "แม่น้ำรวก", "ต.เวียง อ.เชียงแสน (จุดปลายแม่น้ำรวก ก่อนไหลลงแม่น้ำโขง)", "เชียงราย", None),
    ("NK01", "แม่น้ำโขง", "จุดผ่านแดนถาวรสามเหลี่ยมทองคำ (บ้านสบรวก) ต.เวียง อ.เชียงแสน", "เชียงราย", None),
    ("NK02", "แม่น้ำโขง", "จุดสูบน้ำประปาส่วนภูมิภาค เขตบริการเชียงแสน ต.เวียง อ.เชียงแสน", "เชียงราย", None),
    ("NK03", "แม่น้ำโขง", "บ้านสบกก ต.บ้านแซว อ.เชียงแสน", "เชียงราย", None),
    ("NK04", "แม่น้ำโขง", "บ้านหัวเวียง ต.เวียง อ.เชียงของ", "เชียงราย",
     "จุดตรวจวัดเพิ่มใหม่ เริ่มเก็บตัวอย่างครั้งที่ 18 (เม.ย. 2569)"),
    ("NK09", "แม่น้ำโขง", "แก่งผาได ต.ม่วงยาย อ.เวียงแก่น", "เชียงราย",
     "จุดตรวจวัดเพิ่มใหม่ เริ่มเก็บตัวอย่างครั้งที่ 19 (พ.ค. 2569)"),
]

THAI_MONTH_ABBR = {
    "มกราคม": "ม.ค.", "กุมภาพันธ์": "ก.พ.", "มีนาคม": "มี.ค.", "เมษายน": "เม.ย.",
    "พฤษภาคม": "พ.ค.", "มิถุนายน": "มิ.ย.", "กรกฎาคม": "ก.ค.", "สิงหาคม": "ส.ค.",
    "กันยายน": "ก.ย.", "ตุลาคม": "ต.ค.", "พฤศจิกายน": "พ.ย.", "ธันวาคม": "ธ.ค.",
}

STATION_RE = re.compile(r"^(KK|FA|KO|LA|SA|RU|NK)\d{2}\**$")
VALUE_RE = re.compile(r"^[<>]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$")  # รองรับค่าหลักพันที่มีลูกน้ำคั่น เช่น 3,979.0


def clean(text: str) -> str:
    """ตัวอักษรไทยใน PDF ฉบับนี้แตก (เช่น 'แม่น ้า') — ตัดช่องว่างแปลกปลอมออกก่อนค้นหา"""
    return (text or "").replace("\u200b", "").replace(" ", "")


def extract_results(pdf: pdfplumber.PDF) -> dict[str, dict[str, dict[int, str]]]:
    """อ่านตารางภาคผนวก ข -> {พารามิเตอร์: {สถานี: {ครั้งที่: ค่าดิบ}}}"""
    out: dict[str, dict[str, dict[int, str]]] = {}
    for page in pdf.pages:
        raw = page.extract_text() or ""
        # ตัวอักษรไทยใน PDF แตกเป็นช่วงๆ (เช่น 'สังกะส ี(mg/L)') จึงเทียบหลังตัดช่องว่าง
        name = next((p for p in PDF_PARAM_NAMES if p in clean(raw)), None)
        if not name:
            continue
        words = page.extract_words()
        station_words = [w for w in words if STATION_RE.match(w["text"])]
        if not station_words:
            continue
        first_station_top = min(w["top"] for w in station_words)

        # แถวหัวตารางคือแถวที่มีเลขครั้งที่ 1..N เรียงกัน (อาจอยู่คนละ baseline เล็กน้อย)
        header_words = [
            w for w in words
            if w["text"].isdigit() and 1 <= int(w["text"]) <= 99 and 60 < w["top"] < first_station_top
        ]
        bands: list[list[dict]] = []
        for w in sorted(header_words, key=lambda w: w["top"]):
            for band in bands:
                if abs(band[0]["top"] - w["top"]) <= 3:
                    band.append(w)
                    break
            else:
                bands.append([w])
        if not bands:
            continue
        header = max(bands, key=len)
        centers: dict[int, float] = {}
        for w in header:
            centers.setdefault(int(w["text"]), (w["x0"] + w["x1"]) / 2)
        rounds = sorted(centers)
        # ตารางในภาคผนวก ข เท่านั้นที่มีหัวคอลัมน์เป็นเลขครั้งที่ 1..N เรียงต่อเนื่อง
        # (ตารางในเนื้อรายงานใช้ชื่อเดือนเป็นหัวคอลัมน์ จึงข้ามไป)
        if len(rounds) < 10 or rounds != list(range(1, len(rounds) + 1)):
            continue

        # ขอบเขตแนวนอนของแต่ละคอลัมน์ = กึ่งกลางระหว่างหัวคอลัมน์ที่ติดกัน
        order = sorted(centers.items(), key=lambda kv: kv[1])
        bounds = []
        for i, (num, cx) in enumerate(order):
            lo = (order[i - 1][1] + cx) / 2 if i else cx - (order[1][1] - cx) / 2
            hi = (order[i + 1][1] + cx) / 2 if i + 1 < len(order) else cx + (cx - order[i - 1][1]) / 2
            bounds.append((num, lo, hi))

        table = max(page.find_tables(), key=lambda t: (t.bbox[3] - t.bbox[1]) * (t.bbox[2] - t.bbox[0]))
        edges = sorted({round(r.bbox[1], 1) for r in table.rows} | {round(r.bbox[3], 1) for r in table.rows})
        for top, bottom in zip(edges, edges[1:]):
            in_row = [w for w in words if w["top"] >= top - 1 and w["bottom"] <= bottom + 1]
            station = next((w["text"].rstrip("*") for w in in_row if STATION_RE.match(w["text"])), None)
            if not station:
                continue
            values: dict[int, str] = {}
            for w in in_row:
                token = w["text"]
                if token != "-" and not VALUE_RE.match(token):
                    continue
                cx = (w["x0"] + w["x1"]) / 2
                if cx < bounds[0][1]:
                    continue  # ยังอยู่ในคอลัมน์ชื่อสถานี
                for num, lo, hi in bounds:
                    if lo <= cx < hi:
                        if num in values and values[num] != token:
                            raise SystemExit(
                                f"ค่าชนกันที่ {name} {station} ครั้งที่ {num}: {values[num]} / {token}"
                            )
                        values[num] = token
                        break
            out.setdefault(name, {})[station] = {n: values.get(n, "-") for n, _, _ in bounds}
    return out


def extract_coordinates(pdf: pdfplumber.PDF) -> dict[str, tuple[float, float]]:
    """อ่านพิกัดจุดเก็บตัวอย่างในภาคผนวก ค -> {สถานี: (lat, lon)}"""
    coords: dict[str, tuple[float, float]] = {}
    for page in pdf.pages:
        if "บริเวณ/พิกัด" not in clean(page.extract_text() or ""):
            continue
        words = page.extract_words()
        stations = sorted(
            [w for w in words if STATION_RE.match(w["text"])], key=lambda w: w["top"]
        )
        numbers = sorted(
            [w for w in words if re.match(r"^\d{2,3}\.\d{4,},?$", w["text"])], key=lambda w: w["top"]
        )
        for i, station in enumerate(stations):
            below = station["top"] - 40
            above = stations[i + 1]["top"] - 40 if i + 1 < len(stations) else 1e9
            pair = [w for w in numbers if below <= w["top"] < above]
            if len(pair) >= 2:
                lat = float(pair[0]["text"].rstrip(","))
                lon = float(pair[1]["text"].rstrip(","))
                coords[station["text"].rstrip("*")] = (lat, lon)
    return coords


def extract_round_dates(pdf: pdfplumber.PDF) -> dict[int, str]:
    """อ่านวันเก็บตัวอย่างของแต่ละครั้งจากหัวข้อ 3 -> {ครั้งที่: 'd-d ม.ค. 69'}"""
    labels: dict[int, str] = {}
    pattern = re.compile(
        r"ครั\s*งท\s*ี่\s*(\d+)\s*ระหว่างวันที่\s*(.+?)(?=\n|$)"
    )
    for page in pdf.pages:
        text = page.extract_text() or ""
        if "ผลการตรวจวัดคุณภาพน" not in clean(text) or "ระหว่างวันที่" not in text:
            continue
        for line in text.split("\n"):
            m = re.search(r"ครั\s*ง\s*ท?\s*ี่\s*(\d+)\s*ระหว่างวันที่\s*(.+)", line)
            if not m:
                continue
            num, span = int(m.group(1)), m.group(2).strip()
            span = span.replace("และวันที่", "และ").replace("และระหว่างวันที่", "และ")
            for full, abbr in THAI_MONTH_ABBR.items():
                span = span.replace(full, abbr)
            span = re.sub(r"\s*(\d{4})", lambda mm: " " + mm.group(1)[2:], span)
            span = re.sub(r"\s*[-–]\s*", "-", span)
            span = re.sub(r"\s+", " ", span).strip()
            labels.setdefault(num, span)
    return labels


def to_result(site: str, pdf_name: str, name: str, symbol: str, unit: str,
              standard: float | None, rnd: int, raw: str) -> dict:
    raw = (raw or "").strip().replace(",", "")
    if raw in ("", "-"):
        return {
            "siteId": site, "parameter": name, "symbol": symbol, "round": rnd,
            "raw": "-", "operator": None, "value": None, "unit": unit,
            "standard": standard, "status": "no_data", "exceedsStandard": False,
        }
    operator = raw[0] if raw[0] in "<>" else "="
    value = float(raw.lstrip("<>"))
    if standard is None:
        status, exceeds = "no_standard", False
    else:
        # กรมควบคุมมลพิษนับ "เกินมาตรฐาน" เฉพาะค่าที่ "มากกว่า" ค่ามาตรฐาน
        # ค่าที่เท่ากับมาตรฐานพอดี (เช่น สารหนู 0.010) ถือว่าเป็นไปตามมาตรฐาน
        exceeds = operator == "=" and value > standard
        status = "exceed" if exceeds else "pass"
    return {
        "siteId": site, "parameter": name, "symbol": symbol, "round": rnd,
        "raw": raw, "operator": operator, "value": value, "unit": unit,
        "standard": standard, "status": status, "exceedsStandard": exceeds,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", help="ไฟล์รายงาน PDF ฉบับล่าสุดของกรมควบคุมมลพิษ")
    ap.add_argument("--check", action="store_true", help="ตรวจเทียบกับ data.json เดิมอย่างเดียว ไม่เขียนไฟล์")
    args = ap.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"ไม่พบไฟล์: {pdf_path}", file=sys.stderr)
        return 1

    with pdfplumber.open(pdf_path) as pdf:
        results = extract_results(pdf)
        coords = extract_coordinates(pdf)
        round_dates = extract_round_dates(pdf)

    missing = [p for p, *_ in PARAMETERS if p not in results]
    if missing:
        print(f"อ่านตารางไม่ครบ ขาดพารามิเตอร์: {missing}", file=sys.stderr)
        return 1

    total_rounds = max(max(v) for v in results["สารหนู"].values())
    print(f"อ่าน PDF ได้ {len(results)} พารามิเตอร์ · {len(results['สารหนู'])} สถานี · {total_rounds} ครั้ง")

    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    old_index = {
        (r["siteId"], r["parameter"], r["round"]): r for r in data["waterResults"]
    }

    points = []
    for seq, (sid, river, location, province, note) in enumerate(WATER_POINTS, start=1):
        if sid not in coords:
            print(f"ไม่พบพิกัดของ {sid} ในภาคผนวก ค", file=sys.stderr)
            return 1
        lat, lon = coords[sid]
        point = {
            "id": sid, "sequence": seq, "river": river, "location": location,
            "province": province, "latitude": lat, "longitude": lon,
            "coordinateStatus": "current_pdf", "source": pdf_path.name,
        }
        if note:
            point["note"] = note
        points.append(point)

    rows = []
    for point in points:
        for pdf_name, name, symbol, unit, standard in PARAMETERS:
            table = results[pdf_name].get(point["id"])
            if table is None:
                print(f"ไม่พบสถานี {point['id']} ในตาราง{name}", file=sys.stderr)
                return 1
            for rnd in range(1, total_rounds + 1):
                rows.append(
                    to_result(point["id"], pdf_name, name, symbol, unit, standard, rnd, table.get(rnd, "-"))
                )

    # รายงานส่วนต่างเทียบกับข้อมูลเดิม (ข้ามกรณีที่ต่างแค่จำนวนทศนิยม เช่น 0.03 กับ 0.030)
    changed, cosmetic = [], 0
    for row in rows:
        old = old_index.get((row["siteId"], row["parameter"], row["round"]))
        if old is None:
            continue
        same_value = old["operator"] == row["operator"] and old["value"] == row["value"]
        if same_value and old["status"] == row["status"]:
            cosmetic += (old["raw"] or "-") != row["raw"]
            continue
        changed.append((row["siteId"], row["parameter"], row["round"],
                        old["raw"], old["status"], row["raw"], row["status"]))
    print(f"ค่าที่ต่างจาก data.json เดิม: {len(changed)} รายการ (ต่างแค่รูปแบบทศนิยมอีก {cosmetic} รายการ)")
    for c in changed:
        print("   {0:5} {1:10} ครั้งที่ {2:>2}: {3} ({4}) -> {5} ({6})".format(*c))

    if args.check:
        return 0

    old_labels = {r["round"]: r for r in data["samplingRounds"]}
    sampling = []
    for rnd in range(1, total_rounds + 1):
        label = old_labels.get(rnd, {}).get("dateLabel") or round_dates.get(rnd) or ""
        sampling.append({
            "round": rnd,
            "dateLabel": label,
            "note": "รอบล่าสุดที่รายงานในเอกสารฉบับนี้" if rnd == total_rounds else None,
        })

    data["meta"] = {
        "title": "แผนที่ผลตรวจวัดคุณภาพน้ำแม่น้ำกกและจุดตรวจโลหะ จ.เชียงราย",
        "generatedFrom": [pdf_path.name, "ผลโลหะ จ.เชียงราย.xlsx"],
        "note": (
            f"ผลตรวจคุณภาพน้ำครั้งที่ 1-{total_rounds} และพิกัดจุดตรวจวัด {len(points)} จุด "
            f"ดึงจากรายงานกรมควบคุมมลพิษครั้งที่ {total_rounds} (ภาคผนวก ข และ ค)"
        ),
        "currentWaterPointCount": len(points),
        "coordinateSource": pdf_path.name,
    }
    data["waterPoints"] = points
    data["samplingRounds"] = sampling
    data["waterResults"] = rows

    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"เขียน {DATA_FILE.name} แล้ว: {len(points)} จุด · {len(rows)} ผลตรวจ")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
