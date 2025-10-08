"""Utility helpers for the flood-lens data pipeline."""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional

from .aoi import aoi_to_wkt

BASE_DIR: Path = Path(__file__).resolve().parents[2]
LIVE_DIR: Path = BASE_DIR / "public" / "data" / "live"
TILES_DIR: Path = BASE_DIR / "public" / "tiles"
CITIES_FILE: Path = BASE_DIR / "public" / "data" / "cities.json"
LOGGER = logging.getLogger(__name__)

__all__ = [
    "CityDescriptor",
    "ensure_output_dirs",
    "write_live_json",
    "tileset_path",
    "load_cities",
    "load_city",
    "aoi_to_wkt",
]


@dataclass(frozen=True)
class CityDescriptor:
    """Minimal metadata required for the processing pipeline."""

    id: str
    name: str
    bbox: tuple[float, float, float, float]
    timezone: str


def ensure_output_dirs() -> None:
    """Create output directories for JSON and tile artifacts if missing."""

    LIVE_DIR.mkdir(parents=True, exist_ok=True)
    TILES_DIR.mkdir(parents=True, exist_ok=True)


def write_live_json(city_id: str, payload: Mapping[str, Any]) -> Path:
    """Write the assembled live payload for a city and return the file path."""

    ensure_output_dirs()
    target = LIVE_DIR / f"{city_id}.json"
    with target.open("w", encoding="utf-8") as stream:
        json.dump(payload, stream, indent=2, sort_keys=True)
        stream.write("\n")
    LOGGER.info("Wrote live payload for %s -> %s", city_id, target)
    return target


def tileset_path(city_id: str, layer: str) -> Path:
    """Compute a tile output directory for the given city and layer name."""

    ensure_output_dirs()
    safe_layer = layer.replace("/", "_").replace("..", "_")
    return TILES_DIR / city_id / safe_layer


def _entry_bbox(entry: Mapping[str, Any]) -> Optional[tuple[float, float, float, float]]:
    bbox = entry.get("bbox")
    if bbox and len(bbox) == 4:
        return tuple(float(v) for v in bbox)  # type: ignore[arg-type]

    lat = entry.get("lat")
    lon = entry.get("lon")
    radius_km = entry.get("radius_km", entry.get("radius", 35.0))
    if lat is None or lon is None:
        return None

    lat = float(lat)
    lon = float(lon)
    radius_km = float(radius_km)
    lat_delta = radius_km / 111.0
    lon_scale = max(abs(math.cos(math.radians(lat))), 0.01)
    lon_delta = radius_km / (111.0 * lon_scale)
    return (
        lon - lon_delta,
        lat - lat_delta,
        lon + lon_delta,
        lat + lat_delta,
    )


def load_cities() -> list[CityDescriptor]:
    """Load every city descriptor from the published catalogue."""

    if not CITIES_FILE.exists():
        raise FileNotFoundError(f"City catalogue missing at {CITIES_FILE}")

    raw = json.loads(CITIES_FILE.read_text(encoding="utf-8"))
    cities: list[CityDescriptor] = []
    for entry in raw:
        bbox = _entry_bbox(entry)
        if not bbox:
            LOGGER.warning("Skipping city without valid footprint: %s", entry)
            continue
        cities.append(
            CityDescriptor(
                id=str(entry["id"]),
                name=str(entry.get("name", entry["id"])),
                bbox=bbox,
                timezone=str(entry.get("timezone", entry.get("tz", "UTC"))),
            )
        )
    return cities


def load_city(city_id: str) -> CityDescriptor:
    """Lookup a city descriptor by identifier."""

    for city in load_cities():
        if city.id == city_id:
            return city
    raise ValueError(f"City '{city_id}' not found in {CITIES_FILE}")
