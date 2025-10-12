"""Entry point for generating live payloads for one or many cities."""

from __future__ import annotations

import pipeline.net.tls  # noqa: F401  # side-effect TLS bootstrap

import argparse
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

from .fuse_model import compute_risk_score
from .hand_tools import low_hand_pct
from .imerg_features import aggregate_imerg
from .predict.fallback import make_prediction
from .predict.forecast_proxy import precip_forecast_norm
from .s1_water import summarize_sar_water
from .utils import CityDescriptor, load_cities, load_city, write_live_json

LOGGER = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

BASE_DIR = Path(__file__).resolve().parents[1]
LIVE_DIR = BASE_DIR / "public" / "data" / "live"


def _safe_rain(city: CityDescriptor, window_days: int) -> Dict[str, Optional[float]]:
    try:
        end_utc = datetime.now(timezone.utc)
        start_utc = end_utc - timedelta(days=window_days)
        username = os.getenv("EARTHDATA_USERNAME")
        password = os.getenv("EARTHDATA_PASSWORD")
        auth = (username, password) if username and password else None
        values = aggregate_imerg(city.bbox, start_utc, end_utc, auth=auth, prefer_run="late")
        if values is None:
            LOGGER.warning("IMERG precipitation unavailable for %s; returning null rain metrics", city.id)
            return {"h3": None, "h24": None, "h72": None, "api72": None}
        return {k: float(v) if v is not None else None for k, v in values.items()}
    except Exception as exc:
        LOGGER.warning("IMERG aggregation failed for %s: %s", city.id, exc)
        return {"h3": None, "h24": None, "h72": None, "api72": None}


def _safe_terrain(city: CityDescriptor) -> Dict[str, Optional[float]]:
    try:
        fraction = low_hand_pct(city.bbox)
        value = fraction.get("low_HAND_pct")
        return {"low_HAND_pct": float(value) if isinstance(value, (int, float)) else None}
    except Exception as exc:
        LOGGER.warning("HAND computation failed for %s: %s", city.id, exc)
        return {"low_HAND_pct": None}


def _safe_sar(city: CityDescriptor, *, days: int, write_tiles: bool) -> Dict[str, Optional[Any]]:
    try:
        return summarize_sar_water(city, lookback_hours=days * 24, write_tiles=write_tiles, days=days)
    except Exception as exc:
        LOGGER.warning("SAR detection failed for %s: %s", city.id, exc)
        return {"age_hours": None, "new_water_km2": None, "pct_aoi": None, "confidence": None}


def _load_previous_payload(city_id: str) -> Optional[Dict[str, Any]]:
    path = LIVE_DIR / f"{city_id}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        LOGGER.debug("Failed to load previous payload for %s: %s", city_id, exc)
        return None


def _to_risk_inputs(rain: Dict[str, Optional[float]], sar: Dict[str, Optional[Any]], terrain: Dict[str, Optional[float]]) -> Dict[str, Dict[str, float]]:
    rain_risk = {k: float(v) if isinstance(v, (int, float)) else 0.0 for k, v in rain.items()}
    sar_risk_source = {
        "new_water_km2": sar.get("new_water_km2") if isinstance(sar.get("new_water_km2"), (int, float)) else 0.0,
        "pct_aoi": sar.get("pct_aoi") if isinstance(sar.get("pct_aoi"), (int, float)) else 0.0,
    }
    terrain_risk = {
        "low_HAND_pct": float(terrain.get("low_HAND_pct")) if isinstance(terrain.get("low_HAND_pct"), (int, float)) else 0.0,
    }
    return {
        "rain": rain_risk,
        "sar": sar_risk_source,
        "terrain": terrain_risk,
    }


def build_live_payload(city: CityDescriptor, *, days: int, write_tiles: bool) -> Dict[str, Any]:
    """Assemble the JSON structure sent to the web application."""

    window_days = max(1, days)
    rain = _safe_rain(city, window_days)
    terrain = _safe_terrain(city)
    sar = _safe_sar(city, days=days, write_tiles=write_tiles)

    risk_inputs = _to_risk_inputs(rain, sar, terrain)
    risk = compute_risk_score(
        rain=risk_inputs["rain"],
        sar=risk_inputs["sar"],
        terrain=risk_inputs["terrain"],
    )

    payload: Dict[str, Any] = {
        "cityId": city.id,
        "updated": datetime.now(timezone.utc).isoformat(),
        "rain": rain,
        "sar": sar,
        "terrain": terrain,
        "risk": risk,
    }

    template = sar.get("tiles_template") if isinstance(sar, dict) else None
    if write_tiles and isinstance(template, str):
        payload["tiles"] = {
            "template": template,
            "minzoom": 8,
            "maxzoom": 14,
        }

    return payload


def process_cities(cities: Iterable[CityDescriptor], *, days: int, write_tiles: bool) -> None:
    LIVE_DIR.mkdir(parents=True, exist_ok=True)
    for city in cities:
        LOGGER.info("Processing %s", city.id)
        prev_payload = _load_previous_payload(city.id)
        try:
            payload = build_live_payload(city, days=days, write_tiles=write_tiles)
            try:
                forecast_norm = precip_forecast_norm(city.id, city.bbox, hours=24)
            except Exception as forecast_exc:  # noqa: BLE001
                LOGGER.debug("Forecast proxy failed for %s: %s", city.id, forecast_exc)
                forecast_norm = None
            try:
                payload["prediction"] = make_prediction(
                    payload_for_city=payload,
                    prev_payload=prev_payload,
                    forecast_norm=forecast_norm,
                )
            except Exception as pred_exc:  # noqa: BLE001
                LOGGER.warning("Prediction fallback failed for %s: %s", city.id, pred_exc)
                payload["prediction"] = {
                    "status": "fallback_static",
                    "risk_index": 0.0,
                    "confidence": "low",
                    "valid_until": None,
                    "notes": "Prediction unavailable due to runtime error.",
                }
            write_live_json(city.id, payload)
        except Exception as exc:
            LOGGER.error("Failed to build payload for %s: %s", city.id, exc)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate live feed JSON for one or more cities.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--city", dest="city", help="Single city identifier")
    group.add_argument("--all", dest="all", action="store_true", help="Process every published city")
    parser.add_argument("--days", dest="days", type=int, default=3, help="Lookback window for SAR search (default: 3)")
    parser.add_argument("--write-tiles", dest="write_tiles", action="store_true", help="Emit SAR diagnostic tiles")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.city:
        cities = [load_city(args.city)]
    else:
        cities = load_cities()

    process_cities(cities, days=max(1, args.days), write_tiles=args.write_tiles)


if __name__ == "__main__":
    main()
