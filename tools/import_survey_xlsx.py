#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""นำเข้าผลตรวจ ศวภ.น. กวภ. กรอ. (ไฟล์ Excel 3 ชีต: แม่น้ำ / โรงงาน / ดิน) เข้า data.json

เขียนทับเฉพาะคีย์ surveyMeta, surveySites, surveyResults — ข้อมูลส่วนอื่นไม่ถูกแตะ

วิธีใช้:
    python tools/import_survey_xlsx.py "ผลการตรวจ.xlsx" --label "ผลตรวจ ศวภ.น. กวภ. กรอ. ส.ค. 2569"
    python tools/import_survey_xlsx.py "ผลการตรวจ.xlsx" --check     # ตรวจอย่างเดียว ไม่เขียนไฟล์

ต้องมี openpyxl:  pip install openpyxl

รูปแบบไฟล์ที่รองรับ (ตามไฟล์ ส.ค. 2569)
- ชีต "แม่น้ำ":  ลำดับ | จุดเก็บตัวอย่าง | ตำแหน่ง (DMS) | วันที่ | พารามิเตอร์... (แถวหัวตาราง = สัญลักษณ์, แถวถัดไป = หน่วย)
- ชีต "โรงงาน": ลำดับ | โรงงาน | ตำแหน่ง | จุดเก็บตัวอย่าง | วันที่ | พารามิเตอร์...
- ชีต "ดิน":    ลำดับ | จุดเก็บตัวอย่าง | ตำแหน่ง | วันที่ | พารามิเตอร์...

พิกัดที่ผิดปกติ: ถ้าตัวอย่างของโรงงานเดียวกันมีพิกัดห่างจากตัวอย่างอื่นของโรงงานนั้นเกิน 5 กม.
ถือว่าพิมพ์/คัดลอกผิด และใช้พิกัดของตัวอย่างอื่นในโรงงานเดียวกันแทน พร้อมบันทึก coordinateNote
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data.json"

THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
               "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

# สัญลักษณ์ในไฟล์ -> ชื่อภาษาไทย (ใช้ชื่อเดียวกับ waterResults เพื่อให้ตัวเลือกพารามิเตอร์บนเว็บใช้ร่วมกันได้)
PARAM_NAMES = {
    "Temp.": "อุณหภูมิ",
    "DO": "ออกซิเจนละลาย (DO)",
    "Turb.": "ความขุ่น",
    "Cond.": "การนำไฟฟ้า",
    "Sal": "ความเค็ม",
    "pH": "ความเป็นกรด-ด่าง (pH)",
    "BOD": "บีโอดี (BOD)",
    "COD": "ซีโอดี (COD)",
    "SS": "ของแข็งแขวนลอย (SS)",
    "TDS": "ของแข็งละลายน้ำทั้งหมด (TDS)",
    "NH3-N": "แอมโมเนีย-ไนโตรเจน",
    "TKN": "ทีเคเอ็น (TKN)",
    "As": "สารหนู",
    "Ba": "แบเรียม",
    "Cd": "แคดเมียม",
    "Cr": "โครเมียมทั้งหมด",
    "Cu": "ทองแดง",
    "Mn": "แมงกานีส",
    "Ni": "นิกเกิล",
    "Pb": "ตะกั่ว",
    "Se": "ซีลีเนียม",
    "Zn": "สังกะสี",
    "Hg": "ปรอท",
    "Cr6+": "โครเมียมเฮกซะวาเลนต์",
    "% ของแข็ง": "ของแข็ง",
}

# มาตรฐานคุณภาพน้ำในแหล่งน้ำผิวดิน ประเภทที่ 3 (ประกาศ กก.วล. ฉบับที่ 8 พ.ศ. 2537)
# (min, max) — None = ไม่กำหนด   ค่าเกณฑ์โลหะใช้ชุดเดียวกับ tools/update_water_from_pdf.py
SURFACE_STD = {
    "DO": (4.0, None),
    "pH": (5.0, 9.0),
    "BOD": (None, 2.0),
    "NH3-N": (None, 0.5),
    "As": (None, 0.01),
    "Cd": (None, 0.005),
    "Cu": (None, 0.1),
    "Mn": (None, 1.0),
    "Ni": (None, 0.1),
    "Pb": (None, 0.05),
    "Zn": (None, 1.0),
    "Hg": (None, 0.002),
    "Cr6+": (None, 0.05),
}
SURFACE_STD_NAME = "มาตรฐานน้ำผิวดินประเภทที่ 3"

# มาตรฐานควบคุมการระบายน้ำทิ้งจากโรงงาน (ประกาศ ทส. พ.ศ. 2560)
EFFLUENT_STD = {
    "Temp.": (None, 40.0),
    "pH": (5.5, 9.0),
    "BOD": (None, 20.0),
    "COD": (None, 120.0),
    "SS": (None, 50.0),
    "TDS": (None, 3000.0),
    "TKN": (None, 100.0),
    "As": (None, 0.25),
    "Ba": (None, 1.0),
    "Cd": (None, 0.03),
    "Cu": (None, 2.0),
    "Mn": (None, 5.0),
    "Ni": (None, 1.0),
    "Pb": (None, 0.2),
    "Se": (None, 0.02),
    "Zn": (None, 5.0),
    "Hg": (None, 0.005),
    "Cr6+": (None, 0.25),
}
EFFLUENT_STD_NAME = "มาตรฐานน้ำทิ้งจากโรงงาน"

# จุดเก็บที่เป็นน้ำเสียก่อนบำบัด — ไม่นำไปเทียบมาตรฐานน้ำทิ้ง
RAW_WASTEWATER = re.compile(r"ก่อนเข้าระบบบำบัด|บ่อ\s*EQ", re.I)

OUTLIER_KM = 5.0


def dms_to_decimal(text: str) -> tuple[float, float]:
    parts = re.findall(r"(\d+)°\s*(\d+)'\s*([\d.]+)\"?\s*([NSEW])", str(text))
    if len(parts) != 2:
        raise ValueError(f"อ่านพิกัดไม่ได้: {text!r}")
    out = []
    for d, m, s, hemi in parts:
        v = int(d) + int(m) / 60 + float(s) / 3600
        out.append(-v if hemi in "SW" else v)
    return round(out[0], 7), round(out[1], 7)


def haversine_km(a, b) -> float:
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    x = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


def date_fields(value) -> tuple[str, str]:
    """วันที่ในไฟล์เก็บเป็นปี พ.ศ. ใน datetime (เช่น 2569-08-03)"""
    if isinstance(value, (dt.datetime, dt.date)):
        y, m, d = value.year, value.month, value.day
    else:
        m_ = re.match(r"(\d{4})-(\d{2})-(\d{2})", str(value))
        if not m_:
            return str(value or ""), str(value or "")
        y, m, d = map(int, m_.groups())
    if y < 2400:  # ค.ศ. -> พ.ศ.
        y += 543
    return f"{y:04d}-{m:02d}-{d:02d}", f"{d} {THAI_MONTHS[m - 1]} {str(y)[-2:]}"


def parse_value(raw) -> tuple[str, str, float | None]:
    if raw is None or str(raw).strip() in ("", "-"):
        return "", "", None
    s = str(raw).strip()
    m = re.match(r"^([<>]=?)\s*([\d.,]+)$", s)
    if m:
        return s, m.group(1)[0], float(m.group(2).replace(",", ""))
    try:
        v = float(s.replace(",", ""))
    except ValueError:
        return s, "", None
    raw_text = s if not isinstance(raw, float) else (f"{raw:g}")
    return raw_text, "=", v


def judge(symbol, operator, value, std_table) -> tuple[str, str | None]:
    std = std_table.get(symbol) if std_table else None
    if value is None:
        return "no_data", None
    if not std:
        return "no_standard", None
    lo, hi = std
    if lo is not None and hi is not None:
        text = f"{lo:g}–{hi:g}"
    elif lo is not None:
        text = f"ไม่น้อยกว่า {lo:g}"
    else:
        text = f"ไม่เกิน {hi:g}"
    if operator == "<":
        # ตรวจไม่พบ: ผ่านเมื่อค่า LOD ไม่เกินมาตรฐาน ถ้า LOD สูงกว่ามาตรฐานสรุปไม่ได้
        if hi is not None and value > hi:
            return "inconclusive", text
        if lo is not None:
            return "exceed", text  # ต่ำกว่าค่าต่ำสุดที่กำหนด (เช่น DO)
        return "pass", text
    if operator == ">":
        return ("exceed" if hi is not None and value >= hi else "pass"), text
    if hi is not None and value > hi:
        return "exceed", text
    if lo is not None and value < lo:
        return "exceed", text
    return "pass", text


def read_table(ws, first_param_col: int):
    """คืน (header symbols, units, data rows) — หาแถวหัวตารางจากคำว่า 'ลำดับ'"""
    header_row = None
    for r in range(1, 10):
        if str(ws.cell(r, 1).value or "").strip() == "ลำดับ":
            header_row = r
            break
    if header_row is None:
        raise ValueError(f"ไม่พบหัวตารางในชีต {ws.title}")
    sym_row, unit_row = header_row + 1, header_row + 2
    params = []
    for c in range(first_param_col, ws.max_column + 1):
        sym = ws.cell(sym_row, c).value
        if sym is None:
            continue
        unit = ws.cell(unit_row, c).value
        params.append((c, str(sym).strip(), str(unit).strip() if unit else ""))
    rows = []
    for r in range(unit_row + 1, ws.max_row + 1):
        if ws.cell(r, 1).value is None and ws.cell(r, 2).value is None:
            continue
        rows.append([ws.cell(r, c).value for c in range(1, ws.max_column + 1)])
    return params, rows


def build_results(site_id, row, params, std_table, std_name):
    out = []
    for col, sym, unit in params:
        raw, op, val = parse_value(row[col - 1])
        if not raw:
            continue
        status, std_text = judge(sym, op, val, std_table)
        out.append({
            "siteId": site_id,
            "parameter": PARAM_NAMES.get(sym, sym),
            "symbol": sym,
            "raw": raw,
            "operator": op,
            "value": val,
            "unit": unit,
            "standard": std_text,
            "standardName": std_name if std_text else None,
            "status": status,
        })
    return out


def overall(results) -> str:
    # "สรุปไม่ได้" (LOD สูงกว่ามาตรฐาน เช่น NH3-N <5) ไม่ใช้กำหนดสีหมุดรวม ถ้ามีค่าอื่นที่ผ่านอยู่
    st = {r["status"] for r in results}
    for s in ("exceed", "pass", "inconclusive"):
        if s in st:
            return s
    return "no_standard"


def river_name(point: str) -> str:
    m = re.match(r"(แม่น้ำ\S+)", point)
    return m.group(1) if m else ""


def import_workbook(path: Path, label: str, source_name: str, existing_factories: list[dict]):
    wb = openpyxl.load_workbook(path, data_only=True)
    sites, results, warnings = [], [], []

    # ---------- แม่น้ำ ----------
    ws = wb["แม่น้ำ"]
    params, rows = read_table(ws, 5)
    for row in rows:
        seq, name, pos, date = row[0], row[1], row[2], row[3]
        sid = f"SV-W{int(seq):02d}"
        lat, lng = dms_to_decimal(pos)
        iso, lbl = date_fields(date)
        res = build_results(sid, row, params, SURFACE_STD, SURFACE_STD_NAME)
        results += res
        sites.append({
            "id": sid, "kind": "water", "sequence": int(seq), "name": str(name).strip(),
            "river": river_name(str(name)), "sampleDate": iso, "dateLabel": lbl,
            "latitude": lat, "longitude": lng, "overallStatus": overall(res),
        })

    # ---------- โรงงาน (รวมตัวอย่างเป็นรายโรงงาน) ----------
    ws = wb["โรงงาน"]
    params, rows = read_table(ws, 6)
    samples = []
    for row in rows:
        seq, company, pos, point, date = row[:5]
        lat, lng = dms_to_decimal(pos)
        samples.append({"seq": int(seq), "company": str(company).strip(), "point": str(point).strip(),
                        "lat": lat, "lng": lng, "date": date, "row": row})

    companies = []
    for s in samples:
        if s["company"] not in companies:
            companies.append(s["company"])

    by_name = {f["company"]: f for f in existing_factories}
    for idx, company in enumerate(companies, 1):
        group = [s for s in samples if s["company"] == company]
        # ตรวจพิกัดผิดปกติภายในโรงงานเดียวกัน
        for s in group:
            others = [o for o in group if o is not s]
            if not others:
                continue
            dists = [haversine_km((s["lat"], s["lng"]), (o["lat"], o["lng"])) for o in others]
            if min(dists) > OUTLIER_KM:
                ref = others[dists.index(min(dists))]
                # ยืนยันว่าตัวอ้างอิงเองไม่ใช่ค่าผิดปกติ (อยู่ใกล้ตัวอื่น หรือเป็นตัวเดียวที่เหลือ)
                s["coordinateNote"] = (
                    f"พิกัดในไฟล์ ({s['lat']:.5f}, {s['lng']:.5f}) ห่างจากจุดเก็บอื่นของโรงงานเดียวกัน "
                    f"{min(dists):.0f} กม. น่าจะคัดลอกผิด — ใช้พิกัดของตัวอย่างลำดับ {ref['seq']} แทน"
                )
                s["lat"], s["lng"] = ref["lat"], ref["lng"]
                warnings.append(f"โรงงาน ลำดับ {s['seq']} {company}: {s['coordinateNote']}")

        linked = by_name.get(company)
        sid = linked["id"] if linked else f"SV-F{idx:02d}"
        site_samples = []
        site_results = []
        for s in group:
            sample_id = f"SV-F-{s['seq']:02d}"
            is_raw = bool(RAW_WASTEWATER.search(s["point"]))
            res = build_results(
                sample_id, s["row"], params,
                None if is_raw else EFFLUENT_STD,
                None if is_raw else EFFLUENT_STD_NAME,
            )
            site_results += res
            iso, lbl = date_fields(s["date"])
            entry = {
                "id": sample_id, "sequence": s["seq"], "samplePoint": s["point"],
                "sampleDate": iso, "dateLabel": lbl,
                "latitude": s["lat"], "longitude": s["lng"],
                "compared": not is_raw, "overallStatus": overall(res) if not is_raw else "no_standard",
            }
            if s.get("coordinateNote"):
                entry["coordinateNote"] = s["coordinateNote"]
            site_samples.append(entry)
        results += site_results
        base = site_samples[0]
        compared = [x["overallStatus"] for x in site_samples if x["compared"]]
        site = {
            "id": sid, "kind": "factory", "name": company,
            "linkedFactoryId": linked["id"] if linked else None,
            "dateLabel": base["dateLabel"], "sampleDate": base["sampleDate"],
            "latitude": linked["latitude"] if linked else base["latitude"],
            "longitude": linked["longitude"] if linked else base["longitude"],
            "overallStatus": overall([{"status": c} for c in compared]) if compared else "no_standard",
            "samples": site_samples,
        }
        sites.append(site)

    # ---------- ดิน ----------
    ws = wb["ดิน"]
    params, rows = read_table(ws, 5)
    for row in rows:
        seq, name, pos, date = row[0], row[1], row[2], row[3]
        sid = f"SV-S{int(seq):02d}"
        lat, lng = dms_to_decimal(pos)
        iso, lbl = date_fields(date)
        res = build_results(sid, row, params, None, None)
        results += res
        sites.append({
            "id": sid, "kind": "soil", "sequence": int(seq), "name": str(name).strip(),
            "sampleDate": iso, "dateLabel": lbl,
            "latitude": lat, "longitude": lng, "overallStatus": "no_standard",
        })

    dates = sorted({s["sampleDate"] for s in sites if s.get("sampleDate")}
                   | {x["sampleDate"] for s in sites for x in s.get("samples", [])})
    meta = {
        "label": label,
        "source": source_name,
        "dateFrom": dates[0] if dates else None,
        "dateTo": dates[-1] if dates else None,
        "counts": {
            "water": sum(1 for s in sites if s["kind"] == "water"),
            "factory": sum(1 for s in sites if s["kind"] == "factory"),
            "factorySamples": len(samples),
            "soil": sum(1 for s in sites if s["kind"] == "soil"),
        },
        "standards": {
            "water": SURFACE_STD_NAME + " (ประกาศ กก.วล. ฉบับที่ 8 พ.ศ. 2537)",
            "factory": EFFLUENT_STD_NAME + " (ประกาศ ทส. พ.ศ. 2560) — เทียบเฉพาะจุดบ่อสุดท้าย/น้ำทิ้ง ไม่เทียบน้ำเสียก่อนบำบัด",
            "soil": "ไม่เทียบมาตรฐาน (ตัวอย่างดินตะกอนท้องน้ำ)",
        },
        "coordinateCorrections": warnings,
    }
    return meta, sites, results


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("xlsx", type=Path)
    ap.add_argument("--label", default="ผลตรวจ ศวภ.น. กวภ. กรอ. ส.ค. 2569", help="ชื่อชุดข้อมูลที่แสดงบนเว็บ")
    ap.add_argument("--source-name", default=None, help="ชื่อไฟล์ต้นทางที่บันทึกใน data.json")
    ap.add_argument("--check", action="store_true", help="แสดงสรุปอย่างเดียว ไม่เขียน data.json")
    args = ap.parse_args()

    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    source = args.source_name or args.xlsx.name
    meta, sites, results = import_workbook(args.xlsx, args.label, source, data.get("factorySites", []))

    print(f"{meta['label']}  ({meta['dateFrom']} – {meta['dateTo']})")
    print(f"  จุดน้ำ {meta['counts']['water']} · โรงงาน {meta['counts']['factory']} "
          f"({meta['counts']['factorySamples']} ตัวอย่าง) · ดิน {meta['counts']['soil']} · ผล {len(results)} ค่า")
    for s in sites:
        flag = "" if s["overallStatus"] in ("pass", "no_standard") else f"  [{s['overallStatus']}]"
        link = f"  -> ผูกกับ {s['linkedFactoryId']}" if s.get("linkedFactoryId") else ""
        print(f"  {s['id']:<20} {s['name'][:50]}{flag}{link}")
    exceed = [r for r in results if r["status"] == "exceed"]
    print(f"  ค่าที่เกินมาตรฐาน {len(exceed)} ค่า:")
    for r in exceed:
        print(f"    {r['siteId']:<10} {r['symbol']:<6} {r['raw']:>8} (เกณฑ์ {r['standard']})")
    for w in meta["coordinateCorrections"]:
        print("  แก้พิกัด:", w)

    if args.check:
        return 0
    data["surveyMeta"] = meta
    data["surveySites"] = sites
    data["surveyResults"] = results
    if source not in data["meta"].get("generatedFrom", []):
        data["meta"].setdefault("generatedFrom", []).append(source)
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"เขียน {DATA_FILE} แล้ว")
    return 0


if __name__ == "__main__":
    sys.exit(main())
