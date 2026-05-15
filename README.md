# แผนที่คุณภาพน้ำแม่น้ำกก

แผนที่เว็บแสดงผลตรวจวัดคุณภาพน้ำแม่น้ำกกและโรงงานอุตสาหกรรมในพื้นที่ริมแม่น้ำ

**Live site:** https://naodiw.github.io/maekork-water-quality/

---

## ข้อมูลที่แสดงในแผนที่

| ชั้นข้อมูล | รายละเอียด | ไฟล์ต้นทาง |
|---|---|---|
| จุดตรวจวัดน้ำ | 20 จุด ตามรายงานกรมควบคุมมลพิษ | `data.json → waterPoints` |
| ผลตรวจวัดน้ำ | รอบที่ 1–17 พารามิเตอร์หลัก (สารหนู ตะกั่ว ทองแดง แมงกานีส ฯลฯ) | `data.json → waterResults` |
| โรงงาน (สีเทา) | 4 โรงงานที่มีผลตรวจโลหะหนัก | `data.json → factorySites` |
| โรงงานริมกก (สีส้ม) | 26 โรงงาน DIW ที่อยู่ภายใน 3 กม. จากแม่น้ำกก | `data.json → kokFactories` |

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
└── rivers.geojson   # เส้นแม่น้ำ (Kok, Mae Lao, Mekong, Ruak, Sai)
```

### ไฟล์ต้นทาง (อยู่นอก web-map/)

```
แม่น้ำกก/
├── ค่าตรวจวัดคุณภาพน้ำแม่น้ำกก_ครั้งที่1-17.xlsx
├── ผลโลหะ จ.เชียงราย.xlsx
├── diw_factories_chiangrai_kok_districts.csv   ← ข้อมูล DIW โรงงาน
└── pcdnew-2026-04-08_06-35-40_710804.pdf       ← PDF พิกัดจุดตรวจ
```

---

## วิธีอัปเดตข้อมูล

### เพิ่มรอบตรวจวัดน้ำใหม่
แก้ไข `data.json` — เพิ่มข้อมูลใน `samplingRounds` และ `waterResults`

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

## Stack

- [Leaflet](https://leafletjs.com/) — แผนที่ interactive
- OpenStreetMap — base map tiles
- GitHub Pages — hosting (ฟรี, ไม่ต้อง build)
- ไม่มี framework, ไม่มี build step — แก้ไฟล์แล้ว push ได้เลย
