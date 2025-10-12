"""Fuse multi-sensor features into a compact risk signal."""

from __future__ import annotations

from typing import Dict, Mapping, Optional


RISK_LEVELS = [
    (70.0, "High"),
    (40.0, "Medium"),
    (0.0, "Low"),
]


def compute_risk_score(
    rain: Mapping[str, float],
    sar: Mapping[str, Optional[float]],
    terrain: Mapping[str, float],
) -> Dict[str, str | float]:
    """Combine feature groups into a simple risk estimate."""

    rain_component = rain.get("h24", 0.0) + rain.get("api72", 0.0)
    sar_component = (sar.get("new_water_km2") or 0.0) * 5
    terrain_component = terrain.get("low_HAND_pct", 0.0) * 0.2

    score = min(100.0, rain_component * 0.6 + sar_component * 0.3 + terrain_component * 0.1)

    for threshold, label in RISK_LEVELS:
        if score >= threshold:
            level = label
            break
    else:
        level = "Low"

    explanation = (
        f"Rainfall index {rain_component:.1f}, new water {sar.get('new_water_km2') or 0:.1f} km², "
        f"low HAND fraction {terrain.get('low_HAND_pct', 0):.1f}%"
    )
    return {
        "score": round(score, 1),
        "level": level,
        "explanation": explanation,
    }
