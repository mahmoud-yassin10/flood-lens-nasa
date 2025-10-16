#!/usr/bin/env python3
import os, json, time, random
from datetime import datetime, timezone

OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "public/data")
CITIES = os.environ.get("CITIES", "alexandria cairo khartoum lagos tunis casablanca beirut nairobi mumbai dhaka jakarta manila bangkok karachi ho_chi_minh").split()

# 3-hour buckets since epoch → deterministic/rotating every 3h
BUCKET = int(time.time() // (3 * 3600))
rng_global = random.Random(f"global-{BUCKET}")

# pick at most 2 cities to be "medium" this window (never high)
flagged_cities = set(rng_global.sample(CITIES, k=min(2, len(CITIES))))

os.makedirs(OUTPUT_DIR, exist_ok=True)

def R(city: str) -> random.Random:
    return random.Random(f"{city}-{BUCKET}")

def clamp(v, lo, hi): return max(lo, min(hi, v))

def ensure_file(city: str):
    """Only (re)write if file is missing or tiny (<50 bytes), so we never
    clobber real pipeline outputs."""
    path = os.path.join(OUTPUT_DIR, f"{city}.json")
    if os.path.exists(path) and os.path.getsize(path) >= 50:
        return False, path
    return True, path

def seed_city(city: str):
    should_write, path = ensure_file(city)
    if not should_write:
        return False

    r = R(city)

    # Rain windows (mm) – sensible ranges, not alarming
    rain_0_3   = round(r.uniform(0.0, 6.0), 1)
    rain_0_24  = round(r.uniform(4.0, 45.0), 1)
    rain_24_72 = round(r.uniform(2.0, 35.0), 1)
    rain_api72 = round(r.uniform(5.0, 80.0), 1)  # “API 72h” bucket for your UI

    # SAR & flood proxies (small)
    sar_water_km2     = round(r.uniform(0.2, 7.5), 2)
    flood_extent_km2  = round(r.uniform(0.0, 3.0), 2)

    # Risk: cap to low/medium only; optionally flag a couple of cities
    base = r.uniform(0.22, 0.45)
    jitter = r.uniform(-0.05, 0.12)
    score = clamp(base + jitter, 0.18, 0.60)
    flagged = city in flagged_cities
    if flagged:
        score = clamp(score + 0.08, 0.30, 0.60)

    risk_level = "medium" if score >= 0.33 else "low"
    confidence = round(r.uniform(0.55, 0.70), 2)  # medium only

    # Optionally emit 0–2 tiny SAR “detections” (purely illustrative)
    n_det = r.choice([0, 0, 1, 2])
    detections = []
    for i in range(n_det):
        detections.append({
            "when_iso": datetime.now(timezone.utc).isoformat(),
            "area_km2": round(r.uniform(0.05, 0.40), 2),
            "quality": "low",
            "note": "mock"
        })

    payload = {
        "city": city,
        "timestamp_iso": datetime.now(timezone.utc).isoformat(),
        "bucket_3h": BUCKET,
        "source": "model:mock-v1",
        "metrics": {
            "rain_mm": {
                "h0_3": rain_0_3,
                "h0_24": rain_0_24,
                "h24_72": rain_24_72,
                "api_72h": rain_api72
            },
            "imerg_rain_mm_last_24h": rain_0_24,  # legacy
            "sar_water_km2": sar_water_km2,
            "flood_extent_km2": flood_extent_km2,
            "sar_detections": detections,
            "risk_score_0_1": round(score, 2),
            "risk_level": risk_level,
            "confidence_0_1": confidence,
            "flagged": flagged
        },
        "notes": "Mock placeholder to fill gaps; rotates every 3h; low/medium risk only.",
        "disclaimer": "Model placeholder data; not for safety-critical use."
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return True

changed = [c for c in CITIES if seed_city(c)]
print("Seeded cities:", changed if changed else "(none)")
