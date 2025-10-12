# pipeline/predict/fallback.py
import math
from datetime import datetime, timedelta, timezone


def _now_iso(hours=3):
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def _confidence(sar_age_hours, had_rain_signal):
    if sar_age_hours is None:
        base = "low"
    elif sar_age_hours <= 24:
        base = "high"
    elif sar_age_hours <= 72:
        base = "medium"
    else:
        base = "low"
    if not had_rain_signal and base != "high":
        return "low"
    return base


def _risk_from_hand(low_hand_pct):
    if low_hand_pct is None:
        return None
    x = max(0.0, min(100.0, float(low_hand_pct)))
    return 1.0 / (1.0 + math.exp(-0.12 * (x - 30.0)))  # S-curve ~30%


def _risk_from_persistence(last_new_water_km2, last_age_hours):
    if last_new_water_km2 is None or last_age_hours is None:
        return None
    area_score = max(0.0, min(1.0, float(last_new_water_km2) / 50.0))  # 50 km2 cap
    decay = math.exp(-float(last_age_hours) / 48.0)  # half-life ~48h
    return area_score * decay


def make_prediction(payload_for_city, *, prev_payload=None, forecast_norm=None):
    """
    payload_for_city: dict you are about to write (has 'sar','terrain','rain' possibly None)
    prev_payload: optional previous live payload (for persistence), or None
    forecast_norm: optional 0..1 precip forecast proxy; None if unavailable
    Returns dict with keys: status, risk_index, confidence, valid_until, notes
    """
    sar = payload_for_city.get("sar") or {}
    rain = payload_for_city.get("rain")
    terrain = payload_for_city.get("terrain") or {}

    sar_age = sar.get("age_hours")
    had_rain_signal = rain is not None
    low_hand_pct = terrain.get("low_HAND_pct")

    # 1) HAND baseline
    hand_risk = _risk_from_hand(low_hand_pct)

    # 2) Persistence from previous payload
    persistence_risk = None
    if prev_payload:
        p_sar = (prev_payload or {}).get("sar") or {}
        persistence_risk = _risk_from_persistence(
            p_sar.get("new_water_km2"),
            p_sar.get("age_hours"),
        )

    # 3) Optional forecast (0..1). If provided, blend with HAND
    blended_forecast = None
    if forecast_norm is not None:
        if hand_risk is None:
            blended_forecast = forecast_norm
        else:
            blended_forecast = max(0.0, min(1.0, 0.6 * hand_risk + 0.4 * forecast_norm))

    # Choose a conservative risk: take the max of available candidates
    candidates = [r for r in (hand_risk, persistence_risk, blended_forecast) if r is not None]
    if not candidates:
        return {
            "status": "fallback_static",
            "risk_index": 0.0,
            "confidence": "low",
            "valid_until": _now_iso(),
            "notes": "No recent SAR/IMERG and no terrain metric. Defaulting to minimal risk."
        }

    risk = max(candidates)
    conf = _confidence(sar_age, had_rain_signal)

    if blended_forecast is not None and blended_forecast >= risk - 1e-6:
        status = "forecast"
        notes = "Prediction uses HAND baseline blended with precip forecast proxy."
    elif persistence_risk is not None and persistence_risk >= risk - 1e-6:
        status = "persistence"
        notes = "Prediction from decayed last SAR extent."
    else:
        status = "fallback_static"
        notes = "Prediction from HAND-only baseline."

    return {
        "status": status,
        "risk_index": round(float(risk), 3),
        "confidence": conf,
        "valid_until": _now_iso(),
        "notes": notes,
    }
