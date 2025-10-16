#!/usr/bin/env python3
import os, json, time, random
from datetime import datetime, timezone, timedelta

OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "public/data")
CITIES = os.environ.get("CITIES", "alexandria cairo khartoum lagos tunis casablanca beirut nairobi mumbai dhaka jakarta manila bangkok karachi ho_chi_minh").split()
ALWAYS_OVERWRITE = os.environ.get("ALWAYS_OVERWRITE", "0") == "1"

# Deterministic rotation every 3h
BUCKET = int(time.time() // (3 * 3600))

def R(city: str) -> random.Random:
    return random.Random(f"{city}-{BUCKET}")

def clamp(v, lo, hi): return max(lo, min(hi, v))

os.makedirs(OUTPUT_DIR, exist_ok=True)

def seed_city(city: str):
    path = os.path.join(OUTPUT_DIR, f"{city}.json")
    if (not ALWAYS_OVERWRITE) and os.path.exists(path) and os.path.getsize(path) >= 50:
        return False

    r = R(city)

    # Rain (mm) – consistent buckets
    rain_0_24  = round(r.uniform(4.0, 45.0), 1)
    rain_0_3   = round(0.12 * rain_0_24 + r.uniform(-0.6, 0.6), 1)      # ≈12% of 24h
    rain_24_72 = round(0.8  * rain_0_24 + r.uniform(-2.0, 2.0), 1)      # coarse proxy
    rain_api72 = round(max(0.0, rain_0_24 + rain_24_72 + r.uniform(-3, 3)), 1)

    # Terrain proxies
    elevation_m_mean = round(r.uniform(3, 90), 1)                        # coastal→inland
    hand_index_0_1   = round(clamp(r.uniform(0.15, 0.65), 0.0, 1.0), 2)  # height above nearest drain (lower = riskier)

    # SAR water / flood surface – small
    sar_water_km2    = round(r.uniform(0.2, 7.5), 2)
    flood_extent_km2 = round(r.uniform(0.0, 3.0), 2)

    # Risk: blend signals logically; NEVER high
    rain_term  = min(1.0, (rain_0_24 / 60.0)) * 0.45
    hand_term  = (1.0 - hand_index_0_1) * 0.35
    sar_term   = min(1.0, flood_extent_km2 / 6.0) * 0.20
    score      = clamp(rain_term + hand_term + sar_term + r.uniform(-0.05, 0.05), 0.18, 0.60)

    risk_level = "medium" if score >= 0.33 else "low"
    confidence = round(r.uniform(0.55, 0.70), 2)  # medium only

    # Tiny SAR “detections” (0–2) for realism
    det = []
    for _ in range(r.choice([0, 0, 1, 2])):
        det.append({
            "when_iso": datetime.now(timezone.utc).isoformat(),
            "area_km2": round(r.uniform(0.05, 0.40), 2),
            "quality": "low",
            "note": "mock"
        })

    now = datetime.now(timezone.utc)
    valid_until = now + timedelta(hours=3)

    payload = {
        "city": city,
        "timestamp_iso": now.isoformat(),
        "bucket_3h": BUCKET,
        "source": "model:mock-v2",
        "metrics": {
            "rain_mm": {
                "h0_3":  max(0.0, rain_0_3),
                "h0_24": max(0.0, rain_0_24),
                "h24_72": max(0.0, rain_24_72),
                "api_72h": max(0.0, rain_api72)
            },
            "terrain": {
                "elevation_m_mean": elevation_m_mean,
                "hand_index_0_1": hand_index_0_1,           # lower → more vulnerable
                "vulnerability_note": "HAND/elevation proxy (mock)"
            },
            "sar_water_km2": sar_water_km2,
            "flood_extent_km2": flood_extent_km2,
            "sar_detections": det,
            "risk_score_0_1": round(score, 2),
            "risk_level": risk_level,
            "confidence_0_1": confidence
        },
        "prediction": {
            "index_pct": int(round(score * 100)),          # e.g., 22 (%)
            "label": risk_level,
            "valid_until_iso": valid_until.isoformat(),
            "method": "mock-blend(hand, rain, sar)",
            "explanation": "Blended HAND baseline and short-term precipitation + tiny SAR surface."
        },
        "notes": "Mock placeholder to fill all fields; rotates every 3h; low/medium risk only.",
        "disclaimer": "Model placeholder data; not for safety-critical use."
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return True

changed = []
for c in CITIES:
    if seed_city(c):
        changed.append(c)
print("Seeded/updated cities:", changed if changed else "(none)")
