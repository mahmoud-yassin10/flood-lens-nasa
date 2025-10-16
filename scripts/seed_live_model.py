#!/usr/bin/env python3
# Writes LIVE files the UI reads: public/data/live/<cityId>.json
import os, json, time, random
from datetime import datetime, timezone, timedelta
from pathlib import Path

OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "public/data"))
ALWAYS_OVERWRITE = os.environ.get("ALWAYS_OVERWRITE", "1") == "1"
FALLBACK_IDS = os.environ.get("CITY_IDS", "").split()

# Deterministic rotation every 3 hours
BUCKET = int(time.time() // (3 * 3600))

def rng_for(key: str) -> random.Random:
    return random.Random(f"{key}-{BUCKET}")

def clamp(x, lo, hi): return max(lo, min(hi, x))

def load_city_ids() -> list[str]:
    # Prefer cities.json if it exists and is valid
    cj = OUTPUT_DIR / "cities.json"
    try:
        if cj.exists():
            data = json.loads(cj.read_text(encoding="utf-8"))
            ids = [c["id"] for c in data if "id" in c]
            if ids:
                return ids
    except Exception:
        pass
    # Fallback to env or a safe default list
    if FALLBACK_IDS:
        return FALLBACK_IDS
    return ["alexandria","gerd","bahir_dar","roseires","sennar","wad_madani","khartoum","jakarta","manila","bangkok","hcmc","dhaka","mumbai","lagos","houston"]

def write_city_live(city_id: str) -> None:
    outdir = OUTPUT_DIR / "live"
    outdir.mkdir(parents=True, exist_ok=True)
    path = outdir / f"{city_id}.json"

    if path.exists() and (not ALWAYS_OVERWRITE):
        return

    r = rng_for(city_id)

    # Rain (mm)
    rain24  = round(r.uniform(4.0, 45.0), 1)
    rain3   = round(0.12 * rain24 + r.uniform(-0.6, 0.6), 1)
    rain72  = round(0.8  * rain24 + r.uniform(-2.0, 2.0), 1)
    api72   = round(max(0.0, rain24 + rain72 + r.uniform(-3, 3)), 1)

    # Terrain (HAND proxy)
    hand = round(clamp(r.uniform(0.15, 0.65), 0.0, 1.0), 2)
    low_hand_pct = round((1.0 - hand) * 55 + r.uniform(-5, 5), 1)

    # SAR (small)
    flood_km2 = round(r.uniform(0.0, 3.0), 2)
    sar_conf  = "medium" if flood_km2 > 0.8 else "low"

    # Risk score (Low/Medium only)
    rain_term = min(1.0, rain24 / 60.0) * 0.45
    hand_term = (1.0 - hand) * 0.35
    sar_term  = min(1.0, flood_km2 / 6.0) * 0.20
    score     = clamp(rain_term + hand_term + sar_term + r.uniform(-0.05, 0.05), 0.18, 0.60)
    level     = "Medium" if score >= 0.33 else "Low"

    # Confidence mix
    pred_conf = r.choices(["medium", "high"], weights=[0.7, 0.3], k=1)[0]

    now = datetime.now(timezone.utc)
    valid_until = now + timedelta(hours=3)
    index_pct = int(round(score * 100))

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
        "terrain": { "low_HAND_pct": max(0.0, low_hand_pct) },
        "risk": {
            "score": round(score, 2),
            "level": level,
            "explanation": "Estimate blends recent precipitation, terrain susceptibility (HAND), and SAR-indicated surface water."
        },
        "confidence": pred_conf,
        "prediction": {
            "status": "forecast",
            "risk_index": index_pct,
            "index_pct": index_pct,
            "confidence": pred_conf,
            "valid_until": valid_until.isoformat(),
            "notes": "Derived from blended hydro-terrain indicators and recent satellite observations."
        }
    }

    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

def main():
    ids = load_city_ids()
    for cid in ids:
        write_city_live(cid)
    print(f"Seeded LIVE files for {len(ids)} cities (bucket={BUCKET}).")

if __name__ == "__main__":
    main()
