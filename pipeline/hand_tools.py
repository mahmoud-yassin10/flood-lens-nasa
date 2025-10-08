"""Topographic conditioning utilities (HAND, slopes, etc.)."""

from __future__ import annotations

import gzip
import logging
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple

import numpy as np
import requests

from .terrain.hand import compute_hand

HAND_THRESHOLD_METERS = 5.0
SRTM_TILE_SIZE = 3601  # SRTM 1 arc-second grid
DEM_CACHE = Path(os.getenv("FLOOD_LENS_DEM_CACHE", "/tmp/flood_lens/dem"))
SRTM_BASE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/skadi"
LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class TileKey:
    lat: int
    lon: int


def _tile_name(key: TileKey) -> Tuple[str, str]:
    lat_prefix = "N" if key.lat >= 0 else "S"
    lon_prefix = "E" if key.lon >= 0 else "W"
    lat_code = f"{abs(key.lat):02d}"
    lon_code = f"{abs(key.lon):03d}"
    folder = f"{lat_prefix}{lat_code}"
    filename = f"{folder}{lon_prefix}{lon_code}.hgt.gz"
    return folder, filename


def _download_tile(key: TileKey) -> Path:
    folder, filename = _tile_name(key)
    cache_dir = DEM_CACHE / folder
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / filename

    if cache_path.exists():
        return cache_path

    url = f"{SRTM_BASE_URL}/{folder}/{filename}"
    response = requests.get(url, stream=True, timeout=120)
    if response.status_code == 404:
        raise FileNotFoundError(f"DEM tile not available for {key} ({url})")
    if not response.ok:
        raise RuntimeError(f"Failed to fetch DEM tile {url}: {response.status_code}")

    with cache_path.open("wb") as handle:
        for chunk in response.iter_content(chunk_size=1_048_576):
            handle.write(chunk)
    return cache_path


def _load_tile_array(tile_path: Path) -> np.ndarray:
    npy_path = tile_path.with_suffix(".npy")
    if npy_path.exists():
        return np.load(npy_path)

    with gzip.open(tile_path, "rb") as gz:
        data = gz.read()
    expected = SRTM_TILE_SIZE * SRTM_TILE_SIZE
    arr = np.frombuffer(data, dtype=">i2", count=expected)
    if arr.size != expected:
        raise ValueError(f"Unexpected DEM size for {tile_path}")
    arr = arr.reshape((SRTM_TILE_SIZE, SRTM_TILE_SIZE)).astype(np.float32)
    arr[arr <= -32768] = np.nan
    np.save(npy_path, arr)
    return arr


def _tiles_for_bbox(bbox: Tuple[float, float, float, float]) -> Iterable[TileKey]:
    min_lon, min_lat, max_lon, max_lat = bbox
    lat_start = math.floor(min_lat)
    lat_stop = math.ceil(max_lat)
    lon_start = math.floor(min_lon)
    lon_stop = math.ceil(max_lon)
    for lat in range(lat_start, lat_stop):
        for lon in range(lon_start, lon_stop):
            yield TileKey(lat=lat, lon=lon)


def _subset_tile(
    tile: np.ndarray,
    key: TileKey,
    bbox: Tuple[float, float, float, float],
) -> Optional[np.ndarray]:
    min_lon, min_lat, max_lon, max_lat = bbox
    tile_lat_bottom = key.lat
    tile_lat_top = key.lat + 1
    tile_lon_left = key.lon
    tile_lon_right = key.lon + 1

    sub_min_lat = max(min_lat, tile_lat_bottom)
    sub_max_lat = min(max_lat, tile_lat_top)
    sub_min_lon = max(min_lon, tile_lon_left)
    sub_max_lon = min(max_lon, tile_lon_right)

    if sub_min_lat >= sub_max_lat or sub_min_lon >= sub_max_lon:
        return None

    row_start = int(round((tile_lat_top - sub_max_lat) * (SRTM_TILE_SIZE - 1)))
    row_end = int(round((tile_lat_top - sub_min_lat) * (SRTM_TILE_SIZE - 1)))
    col_start = int(round((sub_min_lon - tile_lon_left) * (SRTM_TILE_SIZE - 1)))
    col_end = int(round((sub_max_lon - tile_lon_left) * (SRTM_TILE_SIZE - 1)))

    row_end = min(SRTM_TILE_SIZE, max(row_end, row_start + 1))
    col_end = min(SRTM_TILE_SIZE, max(col_end, col_start + 1))

    return tile[row_start:row_end, col_start:col_end]


def _assemble_dem(bbox: Tuple[float, float, float, float]) -> Optional[np.ndarray]:
    lat_keys = sorted({key.lat for key in _tiles_for_bbox(bbox)}, reverse=True)
    lon_keys = sorted({key.lon for key in _tiles_for_bbox(bbox)})

    rows = []
    for lat in lat_keys:
        segments = []
        for lon in lon_keys:
            key = TileKey(lat=lat, lon=lon)
            try:
                tile_path = _download_tile(key)
                tile_arr = _load_tile_array(tile_path)
            except Exception as exc:
                LOGGER.warning("Failed to load DEM tile %s: %s", key, exc)
                return None

            subset = _subset_tile(tile_arr, key, bbox)
            if subset is None or subset.size == 0:
                continue
            segments.append(subset)
        if segments:
            rows.append(np.concatenate(segments, axis=1))

    if not rows:
        return None
    return np.concatenate(rows, axis=0)


def _hand_fraction(dem: np.ndarray, bbox: Tuple[float, float, float, float]) -> Optional[float]:
    hand_array = compute_hand(dem, bbox=bbox, nodata=np.nan)
    if hand_array is None:
        return None

    hand_np = np.asarray(hand_array, dtype=np.float32)
    mask = np.isfinite(hand_np)
    if not mask.any():
        return None

    fraction = float((hand_np[mask] <= HAND_THRESHOLD_METERS).mean() * 100.0)
    return fraction


def low_hand_pct(bbox: Tuple[float, float, float, float]) -> Dict[str, Optional[float]]:
    """Compute HAND-based low-lying fraction; returns null metrics when unavailable."""

    dem = _assemble_dem(bbox)
    if dem is None:
        LOGGER.warning("DEM assembly failed for bbox %s; terrain metrics unavailable", bbox)
        return {"low_HAND_pct": None}

    hand_fraction = _hand_fraction(dem, bbox)
    if hand_fraction is None:
        LOGGER.warning("HAND computation unavailable for bbox %s; returning null terrain metrics", bbox)
        return {"low_HAND_pct": None}

    return {"low_HAND_pct": round(max(0.0, min(100.0, hand_fraction)), 2)}
