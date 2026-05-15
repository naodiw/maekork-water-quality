# Mae Kok Water Quality Map

Static web map for sharing the current Mae Kok water-quality monitoring data.

## Current Data Scope

- 20 current water monitoring points from the Pollution Control Department PDF, pages 34-44
- Coordinates are included for every current water monitoring point
- 4 factory/sample points from `ผลโลหะ จ.เชียงราย.xlsx`
- 26 DIW-registered factories within 3 km of the Kok River, filtered from `diw_factories_chiangrai_kok_districts.csv` (286 factories across 5 districts: เมืองเชียงราย, เวียงชัย, แม่จัน, เชียงแสน, ดอยหลวง)
- Water-quality measurements from rounds 1-17, filtered to the current 20 water monitoring points
- Filters for point type, parameter, sampling round, and search

## Run Locally

Run this from the `web-map` folder:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:4173
```

## Free Hosting Options

This folder is a static site, so it can be hosted for free on GitHub Pages, Netlify, or Cloudflare Pages.

Upload or publish the contents of this `web-map` folder.
