"""Flood-Lens QA checks.

Usage:
  python pipeline/checks.py

Runs basic validations over public/data/live/*.json and exits non-zero when
fatal issues are detected. Warnings are surfaced for questionable values so
upstream data issues can be investigated before publishing updates.
"""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

LIVE_DIR = Path(__file__).resolve().parents[1] / "public" / "data" / "live"
ALLOWED_CONFIDENCE = {None, "low", "medium", "high"}
ALLOWED_RISK_LEVELS = {"Low", "Medium", "High"}
REQUIRED_TOP_LEVEL = {"cityId", "updated", "rain", "sar", "terrain", "risk"}
REQUIRED_RAIN_KEYS = {"h3", "h24", "h72", "api72"}
REQUIRED_SAR_KEYS = {"age_hours", "new_water_km2", "pct_aoi", "confidence"}
REQUIRED_TERRAIN_KEYS = {"low_HAND_pct"}
REQUIRED_RISK_KEYS = {"score", "level", "explanation"}


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not math.isnan(value)


def _validate_iso8601(value: str) -> Optional[str]:
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return None
    except Exception as exc:  # noqa: BLE001
        return f"Invalid ISO8601 timestamp: {exc}"


def validate_payload(payload: Dict[str, Any]) -> tuple[List[str], List[str]]:
    errors: List[str] = []
    warnings: List[str] = []

    missing = sorted(REQUIRED_TOP_LEVEL - payload.keys())
    if missing:
        errors.append(f"Missing top-level keys: {', '.join(missing)}")
        return errors, warnings

    iso_error = _validate_iso8601(str(payload["updated"]))
    if iso_error:
        errors.append(iso_error)

    rain = payload.get("rain", {})
    sar = payload.get("sar", {})
    terrain = payload.get("terrain", {})
    risk = payload.get("risk", {})

    for key in REQUIRED_RAIN_KEYS:
        if key not in rain:
            errors.append(f"rain.{key} missing")
    if errors:
        return errors, warnings

    h24 = rain.get("h24")
    if h24 is not None and (_is_number(h24) is False or not (0 <= float(h24) <= 500)):
        errors.append(f"rain.h24 out of range (0-500): {h24}")

    pct_aoi = sar.get("pct_aoi")
    if pct_aoi is not None and (_is_number(pct_aoi) is False or not (0 <= float(pct_aoi) <= 100)):
        errors.append(f"sar.pct_aoi out of range (0-100): {pct_aoi}")

    new_water = sar.get("new_water_km2")
    if new_water is not None and (_is_number(new_water) is False or float(new_water) < 0):
        errors.append(f"sar.new_water_km2 must be ≥0: {new_water}")

    for key in REQUIRED_SAR_KEYS:
        if key not in sar:
            errors.append(f"sar.{key} missing")
    if errors:
        return errors, warnings

    confidence = sar.get("confidence")
    if confidence not in ALLOWED_CONFIDENCE:
        errors.append(f"sar.confidence invalid: {confidence}")

    age_hours = sar.get("age_hours")
    if age_hours is not None and _is_number(age_hours):
        if float(age_hours) > 96:
            warnings.append(f"sar.age_hours = {age_hours} (>96h)")
        if float(age_hours) < 0:
            errors.append(f"sar.age_hours must be >=0: {age_hours}")

    for key in REQUIRED_TERRAIN_KEYS:
        if key not in terrain:
            errors.append(f"terrain.{key} missing")

    if not REQUIRED_RISK_KEYS <= risk.keys():
        missing_risk = sorted(REQUIRED_RISK_KEYS - risk.keys())
        errors.append(f"Missing risk keys: {', '.join(missing_risk)}")
    else:
        level = risk.get("level")
        if level not in ALLOWED_RISK_LEVELS:
            errors.append(f"risk.level invalid: {level}")
        score = risk.get("score")
        if score is not None and (_is_number(score) is False or float(score) < 0):
            errors.append(f"risk.score must be ≥0: {score}")

    tiles = payload.get("tiles")
    if tiles is not None:
        if not isinstance(tiles, dict):
            errors.append("tiles must be an object when present")
        else:
            template = tiles.get("template")
            minzoom = tiles.get("minzoom")
            maxzoom = tiles.get("maxzoom")
            if not isinstance(template, str) or not template:
                errors.append("tiles.template must be a non-empty string")
            for name, value in {"minzoom": minzoom, "maxzoom": maxzoom}.items():
                if not isinstance(value, int):
                    errors.append(f"tiles.{name} must be an integer")

    return errors, warnings


def main() -> int:
    if not LIVE_DIR.exists():
        print(f"[ERROR] Live directory not found: {LIVE_DIR}")
        return 1

    files = sorted(LIVE_DIR.glob("*.json"))
    if not files:
        print("[ERROR] No live JSON files found.")
        return 1

    total_errors = 0
    total_warnings = 0

    for path in files:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            print(f"[ERROR] {path.name}: failed to parse JSON ({exc})")
            total_errors += 1
            continue

        errors, warnings = validate_payload(payload)
        for err in errors:
            print(f"[ERROR] {path.name}: {err}")
        for warn in warnings:
            print(f"[WARN] {path.name}: {warn}")

        total_errors += len(errors)
        total_warnings += len(warnings)

    summary = f"Complete: {len(files)} file(s) checked, {total_errors} error(s), {total_warnings} warning(s)."
    if total_errors:
        print(summary)
        return 1

    print(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
