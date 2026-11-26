# แผนที่คุณภาพน้ำแม่น้ำกก

แผนที่เว็บแสดงผลตรวจวัดคุณภาพน้ำแม่น้ำกกและโรงงานอุตสาหกรรมในพื้นที่ริมแม่น้ำ

**Live site:** https://naodiw.github.io/maekork-water-quality/

---

## ข้อมูลที่แสดงในแผนที่

| ชั้นข้อมูล | รายละเอียด | ไฟล์ต้นทาง |
|---|---|---|
| จุดตรวจวัดน้ำ | 22 จุด ตามรายงานกรมควบคุมมลพิษ ครั้งที่ 24 | `data.json → waterPoints` |
| ผลตรวจวัดน้ำ | รอบที่ 1–24 (มี.ค. 2568 – ต.ค. 2569) 9 พารามิเตอร์ (ความขุ่น สารหนู แมงกานีส ตะกั่ว ปรอท ทองแดง สังกะสี นิกเกิล แคดเมียม) | `data.json → waterResults` |
| ตะกอนดิน คพ. | สารหนูในตะกอนดินท้องน้ำ ครั้งที่ 1–13 (มี.ค. 2568 – ก.ย. 2569) 21 จุดบนแผนที่ + 7 จุดที่เลิกเก็บ (ไม่มีพิกัด) เทียบเกณฑ์ ≤10 / 10–33 / >33 mg/kg ถอดจาก `sources/pcd-kok-water24-sediment13-slides.pdf` หน้า 13 (ตารางเป็นภาพ ถอด 2 รอบแยกกัน ตรงกันครบ 364 ช่อง) · เปิด/ปิดได้ที่แผงขวา | `data.json → sedimentMeta / sedimentResults` |
| โรงงาน (สีเทา) | 4 โรงงานที่มีผลตรวจโลหะหนัก | `data.json → factorySites` |
| โรงงานริมกก (สีส้ม) | 26 โรงงาน DIW ที่อยู่ภายใน 3 กม. จากแม่น้ำกก | `data.json → kokFactories` |
| ผลตรวจ ศวภ.น. กวภ. กรอ. เมื่อ ส.ค. 2569 | เก็บตัวอย่าง 3–6 ส.ค. 2569: น้ำผิวดิน 19 จุด (หมุดข้าวหลามตัด), น้ำเสียโรงงาน 11 ตัวอย่างจาก 5 โรงงาน (หมุดโรงงานขอบประ), ดินตะกอน 5 จุด (สี่เหลี่ยมสีน้ำตาล) เปิด/ปิดได้ที่แผงขวา | `data.json → surveyMeta / surveySites / surveyResults` |

---

## รันในเครื่องเพื่อดูหรือแก้ไข

ต้องการแค่ Python (มาพร้อม Windows/Mac/Linux อยู่แล้ว) ไม่ต้องติดตั้งอะไรเพิ่ม

```powershell
# 1. Clone repo (ครั้งแรกครั้งเดียว)
git clone https://github.com/naodiw/maekork-water-quality.git
cd maekork-water-quality

# 2. เปิด local server
python -m http.server 8765

# 3. เปิด browser ไปที่
#    http://localhost:8765
```

---

## วิธี Deploy (GitHub Pages)

เว็บนี้ใช้ **GitHub Pages** — ทุกครั้งที่ push ขึ้น `master` จะ deploy อัตโนมัติภายใน ~1 นาที ไม่ต้องทำอะไรเพิ่ม

### ตั้งค่า GitHub Pages ครั้งแรก (เจ้าของ repo เท่านั้น)

1. ไปที่ repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `master` / `/ (root)`
4. Save

### ขั้นตอน deploy ทุกครั้งที่แก้ไข

```powershell
# แก้ไขไฟล์ที่ต้องการ แล้วรัน

git add <ไฟล์ที่แก้>
git commit -m "อธิบายว่าแก้อะไร"
git push origin master
```

ดูสถานะ deploy ได้ที่ repo → **Actions** tab

---

## โครงสร้างไฟล์

```
web-map/
├── index.html       # โครงสร้าง HTML หลัก
├── styles.css       # ธีมและสไตล์ทั้งหมด
├── app.js           # logic แผนที่ (Leaflet), ฟิลเตอร์, popup
├── data.json        # ข้อมูลหลักทั้งหมด (จุดน้ำ + โรงงาน + ผลตรวจ)
├── rivers.geojson   # เส้นแม่น้ำ (Kok, Mae Lao, Mekong, Ruak, Sai)
└── tools/
    ├── update_water_from_pdf.py   # อัปเดตผลตรวจน้ำจาก PDF รายงาน คพ. รอบใหม่
    │                              # (รายงานฉบับเต็มไม่มีตารางแมงกานีส → ใช้ --keep-missing แล้วใส่ Mn จากสไลด์สรุปผลเอง;
    │                              #  สคริปต์ไม่แตะ sedimentMeta / sedimentResults)
    └── import_survey_xlsx.py      # นำเข้าผลตรวจ ศวภ.น. กวภ. กรอ. (Excel ชีต แม่น้ำ/โรงงาน/ดิน)
```

### ไฟล์ต้นทาง (อยู่นอก web-map/)

```
แม่น้ำกก/
├── รายงาน...ครั้งที่ 24 (26 – 30 ตุลาคม 2569).pdf   ← ที่มาของผลตรวจน้ำ + พิกัดจุดตรวจปัจจุบัน
├── ค่าตรวจวัดคุณภาพน้ำแม่น้ำกก_ครั้งที่1-17.xlsx   ← ชุดเดิม (เลิกใช้แล้ว แทนที่ด้วย PDF)
├── ผลโลหะ จ.เชียงราย.xlsx
└── diw_factories_chiangrai_kok_districts.csv   ← ข้อมูล DIW โรงงาน
```

---

## วิธีอัปเดตข้อมูล

### เพิ่มรอบตรวจวัดน้ำใหม่ (ใช้ script)

กรมควบคุมมลพิษออกรายงาน PDF ทุกรอบ โดยใน **ภาคผนวก ข** มีตารางผลตรวจย้อนหลังครบทุกครั้ง
และ **ภาคผนวก ค** มีพิกัดจุดเก็บตัวอย่างล่าสุด — script อ่านสองส่วนนี้แล้วเขียน `data.json` ให้ใหม่ทั้งชุด

```powershell
pip install pdfplumber

# ดูว่ามีค่าไหนต่างจากของเดิมบ้าง (ยังไม่เขียนไฟล์)
python tools/update_water_from_pdf.py "C:\Users\<user>\Downloads\รายงาน...ครั้งที่ 25.pdf" --check

# เขียน data.json จริง
python tools/update_water_from_pdf.py "C:\Users\<user>\Downloads\รายงาน...ครั้งที่ 25.pdf"
```

หลังรัน script ให้แก้ด้วยมืออีก 3 จุด
1. `index.html` — จำนวนครั้ง/จุดในกล่องสรุปผู้บริหาร, ชื่อรายงานในส่วน Source, `max`/`value` ของ `#roundSlider`
2. `index.html` — เลข `?v=` ท้าย `styles.css` / `app.js` และ `app.js` — `?v=` ท้าย `data.json` (กัน browser cache)
3. `tools/update_water_from_pdf.py` — ตาราง `WATER_POINTS` ถ้ารายงานเพิ่ม/ย้าย/ยกเลิกจุดตรวจ

หมายเหตุการใช้ script
- จุดที่ไม่ได้เก็บตัวอย่างในรอบนั้น (เช่น NK09 ที่เก็บ 3 เดือนครั้ง) จะไม่มีพิกัดในภาคผนวก ค — script จะใช้พิกัดเดิมใน `data.json` ต่อ
- ถ้ารายงานไม่มีตารางของบางพารามิเตอร์ (ครั้งที่ 24 ไม่มีตารางแมงกานีส) script จะหยุดและแจ้ง — รันซ้ำพร้อม `--keep-missing` เพื่อใช้ค่าเดิมใน `data.json` (รอบใหม่ = ไม่มีข้อมูล)
- ถ้าชื่อไฟล์ PDF ถูกย่อ/เปลี่ยน ให้ใส่ `--source-name "ชื่อรายงานเต็ม.pdf"` เพื่อบันทึกชื่อแหล่งที่มาให้ถูกต้อง

> **หมายเหตุเรื่องการตัดสิน "เกินมาตรฐาน"** — ยึดตามนิยามของ คพ. คือค่าที่ **มากกว่า** ค่ามาตรฐาน
> ค่าที่เท่ากับมาตรฐานพอดี (เช่น สารหนู 0.010 mg/L) ถือว่าเป็นไปตามมาตรฐาน

### นำเข้าผลตรวจ ศวภ.น. กวภ. กรอ. (Excel)

ไฟล์ Excel ที่มี 3 ชีต `แม่น้ำ` / `โรงงาน` / `ดิน` (หัวตาราง: ลำดับ, จุดเก็บตัวอย่าง, ตำแหน่งแบบองศา-ลิปดา-ฟิลิปดา, วันที่, ตามด้วยพารามิเตอร์)
script จะเขียนทับเฉพาะ `surveyMeta`, `surveySites`, `surveyResults` ใน `data.json`

```powershell
pip install openpyxl

# ดูสรุป/ค่าที่เกินมาตรฐาน/พิกัดที่ถูกแก้ ก่อน (ยังไม่เขียนไฟล์)
python tools/import_survey_xlsx.py "ผลตรวจ.xlsx" --label "ผลตรวจ ศวภ.น. กวภ. กรอ. เมื่อ ส.ค. 2569" --check

# เขียน data.json จริง
python tools/import_survey_xlsx.py "ผลตรวจ.xlsx" --label "ผลตรวจ ศวภ.น. กวภ. กรอ. เมื่อ ส.ค. 2569" --source-name "ผลตรวจ ศวภ.น. กวภ. กรอ. เมื่อ ส.ค. 2569.xlsx"
```

การตัดสินผล
- **น้ำผิวดิน** เทียบมาตรฐานแหล่งน้ำผิวดินประเภทที่ 3 (DO, pH, BOD, NH3-N และโลหะชุดเดียวกับข้อมูล คพ.)
- **น้ำเสียโรงงาน** เทียบมาตรฐานน้ำทิ้งจากโรงงาน เฉพาะจุดบ่อสุดท้าย/น้ำทิ้ง ส่วนน้ำเสียก่อนเข้าระบบบำบัดและบ่อ EQ ไม่เทียบ
- **ดินตะกอน** แสดงค่าอย่างเดียว ไม่เทียบมาตรฐาน
- ค่าที่ตรวจไม่พบ (`<LOD`) แต่ LOD สูงกว่าเกณฑ์ (เช่น NH3-N `<5`) แสดงเป็น "สรุปไม่ได้"
- โรงงานที่มีอยู่แล้วในชั้นโรงงานสีเทา (จับคู่ด้วยชื่อบริษัท) จะไม่สร้างหมุดใหม่ ผลตรวจ ศวภ.น. กวภ. กรอ.จะไปแสดงต่อท้ายในแผงรายละเอียดของหมุดเดิม
- ถ้าตัวอย่างของโรงงานเดียวกันมีพิกัดห่างจากตัวอย่างอื่นเกิน 5 กม. จะถือว่าพิกัดผิดและใช้พิกัดตัวอย่างอื่นแทน (มีหมายเหตุแสดงบนเว็บ)

หลังรันแล้ว อย่าลืมเพิ่มเลข `?v=` ของ `data.json` ใน `app.js`

### เพิ่ม/แก้โรงงานริมกก
โรงงานสีส้มมาจาก `data.json → kokFactories` ซึ่งสร้างโดยกรอง `diw_factories_chiangrai_kok_districts.csv` ด้วย threshold 3 กม.  
หากมี CSV ใหม่ ให้รัน script นี้แล้ว copy ผลลัพธ์ไปแทนใน `data.json`:

```python
import csv, math, json

KOK = [
    (20.061094, 99.362002), (20.047791, 99.404934), (19.958382, 99.699078),
    (19.912260, 99.781737), (19.924736, 99.862465), (19.925784, 99.897008),
    (19.960520, 99.946290), (20.033688, 99.963790),
]

def dist(lat, lng):
    R = 6371000
    return min(
        2*R*math.asin(math.sqrt(
            math.sin(math.radians(lat-p[0])/2)**2 +
            math.cos(math.radians(lat))*math.cos(math.radians(p[0]))*
            math.sin(math.radians(lng-p[1])/2)**2
        )) for p in KOK
    )

results = []
with open("diw_factories_chiangrai_kok_districts.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        try:
            lat, lng = float(r["latitude"]), float(r["longitude"])
            d = dist(lat, lng)
            if d <= 3000:
                results.append({
                    "fid": r["fid"].strip(),
                    "name": r["factory_name"].strip(),
                    "business": r["business"].strip(),
                    "address": " ".join(r["address"].split()),
                    "phone": r["phone"].strip(),
                    "operator": r["operator"].strip(),
                    "horsepower": r["horsepower"].strip(),
                    "capital": r["capital_baht"].strip(),
                    "workers": r["workers"].strip(),
                    "district": r["queried_district"].strip(),
                    "distanceM": round(d),
                    "latitude": lat, "longitude": lng,
                })
        except: pass

results.sort(key=lambda x: x["distanceM"])
print(json.dumps(results, ensure_ascii=False, indent=2))
```

---

## สถิติผู้เข้าชม

นับด้วย [GoatCounter](https://www.goatcounter.com/) (ไม่ใช้คุกกี้) ดูสถิติได้ที่ https://naodiw.goatcounter.com
โค้ดนับอยู่ท้าย `index.html`

## Stack

- [Leaflet](https://leafletjs.com/) — แผนที่ interactive
- OpenStreetMap — base map tiles
- GitHub Pages — hosting (ฟรี, ไม่ต้อง build)
- ไม่มี framework, ไม่มี build step — แก้ไฟล์แล้ว push ได้เลย
