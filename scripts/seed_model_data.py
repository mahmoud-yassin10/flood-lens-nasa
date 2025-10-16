#!/usr/bin/env python3
import os, json, time, random, math
from datetime import datetime, timezone

OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "public/data")
CITIES = os.environ.get("CITIES", "alexandria cairo khartoum lagos tunis casablanca beirut nairobi mumbai dhaka jakarta manila bangkok karachi ho_chi_minh").split()

# 3-hour buckets since epoch → deterministic per run window
bucket = int(time.time() // (3 * 3600))

# Choose up to 2 cities to get a "medium" flag this bucket (never "high")
rng_global = random.Random(f"global-{bucket}")
flagged_cities = set(rng_global.sample(CITIES, k=min(2, len(CITIES))))

os.makedirs(OUTPUT_DIR, exist_ok=True)

def city_seed(city: str):
    # Deterministic seed per city & bucket
    return random.Random(f"{city}-{bucket}")

def ensure_range(val, lo, hi):
    return max(lo, min(hi, val))

def write_city(city: str):
    path = os.path.join(OUTPUT_DIR, f"{city}.json")
    needs_seed = True
    if os.path.exists(path):
        try:
            if os.path.getsize(path) >= 50:
                needs_seed = False
        except Exception:
            needs_seed = True

    if not needs_seed:
        return False  # keep real data

    r = city_seed(city)

    # Mock inputs with sensible, non-alarming ranges
    # Keep risk low/medium and confidence medium
    imerg_24h_mm = round(r.uniform(5.0, 45.0), 1)         # light–moderate rain
    sar_water_km2 = round(r.uniform(0.5, 8.0), 2)         # small surface water
    flood_extent_km2 = round(r.uniform(0.0, 3.0), 2)      # tiny/contained
    risk_base = r.uniform(0.20, 0.45)                     # mostly low
    risk_jitter = r.uniform(-0.05, 0.15)
    risk_score = ensure_range(risk_base + risk_jitter, 0.15, 0.60)

    # Flag at most 2 cities as "medium" each bucket (never high)
    flagged = city in flagged_cities
    if flagged:
        risk_score = ensure_range(risk_score + 0.1, 0.30, 0.60)

    if risk_score < 0.33:
        risk_level = "low"
    else:
        risk_level = "medium"

    confidence = round(r.uniform(0.55, 0.70), 2)  # medium confidence only

    payload = {
        "city": city,
        "timestamp_iso": datetime.now(timezone.utc).isoformat(),
        "bucket_3h": bucket,
        "source": "model:mock-v0",
        "metrics": {
            "imerg_rain_mm_last_24h": imerg_24h_mm,
            "sar_water_km2": sar_water_km2,
            "flood_extent_km2": flood_extent_km2,
            "risk_score_0_1": round(risk_score, 2),
            "risk_level": risk_level,
            "confidence_0_1": confidence,
            "flagged": flagged  # True for at most 2 cities per 3h window
        },
        "notes": "Mock data seeded to fill gaps. Low/medium risk only; medium confidence.",
        "disclaimer": "This is model placeholder data; do not use for safety-critical decisions."
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return True

changed = []
for c in CITIES:
    if write_city(c):
        changed.append(c)

print(f"Seeded mock data for cities: {', '.join(changed) if changed else '(none)'}")
