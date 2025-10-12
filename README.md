# Flood-Lens NASA Space Apps

Flood-Lens provides near-real-time situational awareness for flood response. The web app consumes live JSON summaries generated from NASA Earthdata services and renders risk, rainfall, and SAR-derived flood extents for each monitored city.

## What is live right now?

- **IMERG precipitation** — half-hourly accumulations aggregated over the city bounding box (0–72 hours, API72 decay).
- **Sentinel-1 SAR (new water)** — adaptive thresholding on the latest RTC/GRD scene to highlight newly inundated areas and optional tiles for quick sharing.
- **HAND & elevation** — SRTM-derived Height Above Nearest Drainage (fallback to ≤10 m elevation proxy) to flag low-lying terrain.

### LiveCity schema (per `public/data/live/<id>.json`)

```jsonc
{
  "cityId": "alexandria",
  "updated": "2025-10-06T23:15:04.123Z",
  "rain": { "h3": 2.1, "h24": 18.7, "h72": 42.3, "api72": 7.6 },
  "sar": {
    "age_hours": 9,
    "new_water_km2": 12.4,
    "pct_aoi": 6.2,
    "confidence": "medium",
    "tiles_template": "tiles/alexandria/sar_202510062030/{z}/{x}/{y}.png"
  },
  "terrain": { "low_HAND_pct": 31.5 },
  "risk": {
    "score": 62.4,
    "level": "Medium",
    "explanation": "Rainfall index 26.3, new water 12.4 km², low HAND fraction 31.5%."
  },
  "tiles": {
    "template": "tiles/alexandria/sar_202510062030/{z}/{x}/{y}.png",
    "minzoom": 8,
    "maxzoom": 14
  }
}
```

## How to run locally

1. **Install JavaScript dependencies**
   ```bash
   npm install
   ```

2. **Install pipeline dependencies** (requires Python 3.11)
   ```bash
   python -m pip install --upgrade pip
   python -m pip install -r pipeline/requirements.txt
   ```

3. **Generate live data for a city** (requires Earthdata + ASF credentials as env vars)
   ```bash
   export EARTHDATA_USERNAME=... EARTHDATA_PASSWORD=...
   export ASF_USER=... ASF_PASSWORD=...
   python -m pipeline.run_city --city alexandria --write-tiles
   ```

4. **Run the web app**
   ```bash
   npm run dev
   ```
   Open the printed URL (Vite default: http://localhost:5173).

5. **Quick QA**
   ```bash
   npm run verify
   ```
   Ensures generated JSON stays within expected ranges.

## Adding a new city

Edit `public/data/cities.json` and add an entry with:

```jsonc
{
  "id": "lagos",
  "name": "Lagos, Nigeria",
  "bbox": [3.0, 6.2, 3.6, 6.8],
  "timezone": "Africa/Lagos"
}
```

- `bbox` is `[minLon, minLat, maxLon, maxLat]` (decimal degrees).
- `timezone` should be an IANA TZ database identifier.
- After adding the city, rerun `python -m pipeline.run_city --city lagos`.

## Risk & confidence at a glance

- **Risk score/level** — simple fusion: rainfall (API72 + 24h), SAR new-water footprint, and low-HAND fraction. Score is 0–100, classified as Low (<40), Medium (40–70), High (≥70).
- **Confidence** — SAR-driven:
  - `high` if new_water_km2 > 5
  - `medium` if 1–5 km²
  - `low` if >0 but ≤1 km²
  - `null` when no SAR detection is available.

## Limits & caveats

- **Latency** — IMERG and Sentinel-1 scenes typically appear 3–6 hours after acquisition; some cities may temporarily show “No recent data yet.”
- **Coverage** — Sentinel-1 revisit can exceed 3 days in some regions; new-water will degrade to older detections (warning raised over 96 h).
- **Optical data** — Not currently used; heavy cloud cover would impact optical alternatives.
- **Credentials** — Earthdata and ASF credentials are required for automated runs (for GitHub Actions, store them in repository secrets).
- **Licensing** — NASA GPM IMERG, Sentinel-1 data, and SRTM are free/open (see respective licenses); derived products and code released under this repository’s license.

## Automation

A GitHub Actions workflow (`.github/workflows/floodlens.yml`) refreshes all cities every 3 hours and commits updated live JSON + tiles when changes are detected.
