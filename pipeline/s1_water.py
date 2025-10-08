"""Sentinel-1 SAR water extent helpers."""

from __future__ import annotations

import logging
import math
import os
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Optional, Tuple

import asf_search as asf
import numpy as np
import rasterio
from PIL import Image
from skimage import filters, morphology

from pipeline.utils.aoi import aoi_to_wkt
from .utils import CityDescriptor, tileset_path

LOGGER = logging.getLogger(__name__)
DOWNLOAD_BASE = Path(os.getenv("FLOOD_LENS_SAR_CACHE", "/tmp/flood_lens/sar"))
NEW_WATER_COLOR = (0, 136, 204, 160)
VV_SUFFIX = "_VV.tif"
VH_SUFFIX = "_VH.tif"
MAX_SCENES = 3
TILE_ZOOM_MIN = 8
TILE_ZOOM_MAX = 14


def _sentinel1_platform():
    platform_constant = getattr(asf, "PLATFORM", None)
    if platform_constant and hasattr(platform_constant, "SENTINEL1"):
        return platform_constant.SENTINEL1
    return "SENTINEL-1"


def search_s1(aoi, *, start: datetime, end: datetime, max_results: int, beam_mode, polarization, processing_level, flight_direction):
    wkt = aoi_to_wkt(aoi)
    params = {
        "intersectsWith": wkt,
        "start": start,
        "end": end,
        "maxResults": max_results,
        "beamMode": beam_mode,
        "polarization": polarization,
        "processingLevel": processing_level,
        "flightDirection": flight_direction,
        "platform": _sentinel1_platform(),
    }
    return asf.geo_search(**params)


def _download_latest_scene(bbox: Tuple[float, float, float, float], days: int) -> Optional[Path]:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    results = search_s1(
        bbox,
        start=start,
        end=now,
        max_results=MAX_SCENES,
        beam_mode=["IW"],
        polarization=["VV+VH", "VV VH", "VV"],
        processing_level=["RTC", "GRD"],
        flight_direction=["ASCENDING", "DESCENDING"],
    )
    if not results:
        LOGGER.warning("No Sentinel-1 scenes found for bbox %s in last %s days", bbox, days)
        return None

    DOWNLOAD_BASE.mkdir(parents=True, exist_ok=True)
    scene = sorted(results, key=lambda s: s.properties.get("startTime", ""), reverse=True)[0]
    target_dir = DOWNLOAD_BASE / scene.scene_id
    if target_dir.exists():
        return target_dir

    archive_path = DOWNLOAD_BASE / f"{scene.scene_id}.zip"
    LOGGER.info("Downloading Sentinel-1 scene %s", scene.scene_id)
    scene.download(str(archive_path))

    with zipfile.ZipFile(archive_path, "r") as zf:
        zf.extractall(target_dir)
    archive_path.unlink(missing_ok=True)
    return target_dir


def _find_band(root: Path, suffix: str) -> Optional[Path]:
    candidates = list(root.rglob(f"*{suffix}"))
    return candidates[0] if candidates else None


def _clip_band_to_bbox(path: Path, bbox: Tuple[float, float, float, float]) -> Tuple[np.ndarray, rasterio.Affine]:
    min_lon, min_lat, max_lon, max_lat = bbox
    with rasterio.open(path) as src:
        window = rasterio.windows.from_bounds(min_lon, min_lat, max_lon, max_lat, transform=src.transform)
        data = src.read(1, window=window, masked=True)
        transform = src.window_transform(window)
    return data, transform


def _db(array: np.ndarray) -> np.ndarray:
    clipped = np.clip(array, a_min=1e-6, a_max=None)
    return 10.0 * np.log10(clipped)


def _pixel_area_km2(transform: rasterio.Affine, lat: float) -> float:
    lon_res = abs(transform.a)
    lat_res = abs(transform.e)
    km_per_deg_lat = 111.32
    km_per_deg_lon = 111.32 * math.cos(math.radians(lat))
    return max(0.0, lon_res * lat_res * km_per_deg_lat * km_per_deg_lon)


def _apply_morphology(mask: np.ndarray) -> np.ndarray:
    struct = morphology.disk(2)
    opened = morphology.opening(mask, struct)
    closed = morphology.closing(opened, struct)
    return closed


def _write_tiles(city_id: str, acquisition: datetime, mask: np.ndarray) -> str:
    layer = acquisition.strftime("sar_%Y%m%d%H%M")
    output_dir = tileset_path(city_id, layer)
    output_dir.mkdir(parents=True, exist_ok=True)

    rgba_arr = np.zeros((*mask.shape, 4), dtype=np.uint8)
    rgba_arr[mask > 0] = NEW_WATER_COLOR
    tile_image = Image.fromarray(rgba_arr, mode="RGBA")
    tile_resized = tile_image.resize((256, 256), resample=Image.NEAREST)

    for zoom in range(TILE_ZOOM_MIN, TILE_ZOOM_MAX + 1):
        tile_dir = output_dir / str(zoom) / "0"
        tile_dir.mkdir(parents=True, exist_ok=True)
        tile_path = tile_dir / "0.png"
        tile_resized.save(tile_path, format="PNG")

    tile_resized.save(output_dir / "preview.png", format="PNG")

    rel = f"tiles/{city_id}/{layer}/{{z}}/{{x}}/{{y}}.png"
    return rel


def detect_new_water(
    bbox: Tuple[float, float, float, float],
    days: int = 7,
    write_tiles: bool = False,
    city_id: Optional[str] = None,
) -> Dict[str, float | int | str]:
    """Detect new water extent using Sentinel-1 SAR imagery."""

    scene_dir = _download_latest_scene(bbox, days)
    if scene_dir is None:
        return {"new_water_km2": 0.0, "pct_aoi": 0.0, "age_hours": days * 24}

    vv_path = _find_band(scene_dir, VV_SUFFIX)
    vh_path = _find_band(scene_dir, VH_SUFFIX)
    if vv_path is None:
        LOGGER.warning("VV band not found in %s", scene_dir)
        return {"new_water_km2": 0.0, "pct_aoi": 0.0, "age_hours": days * 24}

    vv, transform = _clip_band_to_bbox(vv_path, bbox)
    vv_db = _db(vv.filled(0))
    threshold = filters.threshold_otsu(vv_db)
    water_mask = vv_db <= threshold

    if vh_path is not None:
        vh, _ = _clip_band_to_bbox(vh_path, bbox)
        vh_db = _db(vh.filled(0))
        try:
            vh_threshold = filters.threshold_otsu(vh_db)
            refinement = vh_db <= vh_threshold
            water_mask = water_mask & refinement
        except ValueError:
            LOGGER.debug("VH thresholding skipped due to insufficient dynamic range")

    cleaned = _apply_morphology(water_mask.astype(np.uint8))

    mean_lat = (bbox[1] + bbox[3]) / 2.0
    pixel_area_km2 = _pixel_area_km2(transform, mean_lat)
    new_water_km2 = float(cleaned.sum() * pixel_area_km2)

    bbox_area_km2 = abs((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) * 111.32 * 111.32 * math.cos(math.radians(mean_lat)))
    pct_aoi = 0.0 if bbox_area_km2 <= 0 else min(100.0, (new_water_km2 / bbox_area_km2) * 100.0)

    acquisition_time = datetime.now(timezone.utc)
    for part in scene_dir.name.split("_"):
        if part.startswith("A") and len(part) >= 16:
            try:
                acquisition_time = datetime.strptime(part[1:16], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
                break
            except ValueError:
                continue
    age_hours = int((datetime.now(timezone.utc) - acquisition_time).total_seconds() / 3600)

    tiles_template: Optional[str] = None
    if write_tiles and city_id:
        try:
            tiles_template = _write_tiles(city_id, acquisition_time, cleaned)
        except Exception as exc:
            LOGGER.warning("Failed to write SAR tiles: %s", exc)

    result: Dict[str, float | int | str] = {
        "new_water_km2": round(new_water_km2, 2),
        "pct_aoi": round(pct_aoi, 2),
        "age_hours": max(age_hours, 0),
    }
    if tiles_template:
        result["tiles_template"] = tiles_template
    return result


def summarize_sar_water(
    city: CityDescriptor,
    lookback_hours: int = 72,
    write_tiles: bool = False,
    days: Optional[int] = None,
) -> Dict[str, Optional[float | str]]:
    """Return SAR water metrics for the city using detect_new_water."""

    window_days = days if days is not None else max(1, lookback_hours // 24)

    try:
        result = detect_new_water(city.bbox, days=window_days, write_tiles=write_tiles, city_id=city.id)
        confidence = None
        if result["new_water_km2"] > 5:
            confidence = "high"
        elif result["new_water_km2"] > 1:
            confidence = "medium"
        elif result["new_water_km2"] > 0:
            confidence = "low"

        summary: Dict[str, Optional[float | str]] = {
            "age_hours": float(result["age_hours"]),
            "new_water_km2": result["new_water_km2"],
            "pct_aoi": result["pct_aoi"],
            "confidence": confidence,
        }
        if "tiles_template" in result:
            summary["tiles_template"] = result["tiles_template"]
        return summary
    except Exception as exc:
        LOGGER.warning("SAR detection failed for %s: %s", city.id, exc)
        return {"age_hours": None, "new_water_km2": None, "pct_aoi": None, "confidence": None}
