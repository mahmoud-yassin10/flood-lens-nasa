#!/usr/bin/env python3
import os, json, time, random
from datetime import datetime, timezone, timedelta
from pathlib import Path

# where the site serves data from
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "public/data"))
ALWAYS_OVERWRITE = os.environ.get("ALWAYS_OVERWRITE", "1") == "1"

# deterministic rotation every 3 hours
BUCKET = int(time.time() // (3 * 3600))

def rng_for(key: str) -> random.Random:
    return random.Random(f"{key}-{BUCKET}")

def clamp(x, lo, hi): return max(lo, min(hi, x))

def load_city_ids() -> list[str]:
    # read the app's city list so IDs match exactly what the UI expects
    cities_json = OUTPUT_DIR / "cities.json"
    with cities_json.open("r", encoding="utf-8") as f:
        cities = json.load(f)
    ids = [c["id"] for c in cities]
    return ids

def write_city_live(city_id: str) -> None:
    outdir = OUTPUT_DIR / "live"
    outdir.mkdir(parents=True, exist_ok=True)
    path = outdir / f"{city_id}.json"

    if path.exists() and (not ALWAYS_OVERWRITE):
        return

    r = rng_for(city_id)

    # Rain: keep it reasonable/varied
    rain24  = round(r.uniform(4.0, 45.0), 1)
    rain3   = round(0.12 * rain24 + r.uniform(-0.6, 0.6), 1)
    rain72  = round(0.8  * rain24 + r.uniform(-2.0, 2.0), 1)
    api72   = round(max(0.0, rain24 + rain72 + r.uniform(-3, 3)), 1)

    # Terrain proxy (HAND)
    hand = round(clamp(r.uniform(0.15, 0.65), 0.0, 1.0), 2)
    low_hand_pct = round((1.0 - hand) * 55 + r.uniform(-5, 5), 1)   # percent of AOI that is low-lying

    # SAR surface (kept small)
    flood_km2 = round(r.uniform(0.0, 3.0), 2)
    sar_conf  = "medium" if flood_km2 > 0.8 else "low"

    # Risk (logical blend) — Low/Medium only
    rain_term = min(1.0, rain24 / 60.0) * 0.45
    hand_term = (1.0 - hand) * 0.35
    sar_term  = min(1.0, flood_km2 / 6.0) * 0.20
    score     = clamp(rain_term + hand_term + sar_term + r.uniform(-0.05, 0.05), 0.18, 0.60)
    level     = "Medium" if score >= 0.33 else "Low"
    conf_pred = "medium"  # keep demo confidence medium

    now = datetime.now(timezone.utc)
    valid_until = now + timedelta(hours=3)

    payload = {
        "cityId": city_id,
        "updated": now.isoformat(),
        "rain": { "h3": max(0.0, rain3), "h24": max(0.0, rain24), "h72": max(0.0, rain72), "api72": max(0.0, api72) },
        "sar":  {
            "age_hours": r.choice([6, 12, 24, 36]),
            "new_water_km2": flood_km2 if flood_km2 > 0 else None,
            "pct_aoi": round(min(100.0, flood_km2 * 0.8), 2) if flood_km2 > 0 else None,
            "confidence": sar_conf
        },
        "terrain": { "low_HAND_pct": max(0.0, round(low_hand_pct, 1)) },
        "risk": {
            "score": round(score, 2),
            "level": level,
            "explanation": "Blend of short-term rain, terrain (HAND), and small SAR surface."
        },
        "prediction": {
            "status": "forecast",
            "risk_index": int(round(score * 100)),
            "confidence": conf_pred,
            "valid_until": valid_until.isoformat(),
            "notes": "Model placeholder (rotates every 3h)."
        }
    }

    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

def main():
    ids = load_city_ids()
    for cid in ids:
        write_city_live(cid)
    print(f"Seeded live model files for {len(ids)} cities into {OUTPUT_DIR / 'live'} (bucket={BUCKET}).")

if __name__ == "__main__":
    main()
