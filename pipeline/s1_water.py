"""Sentinel-1 SAR water extent helpers."""

from __future__ import annotations

import logging
import math
import os
import re
import shutil
import tempfile
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Optional, Tuple
from urllib.parse import urljoin, urlparse, urlunparse

import asf_search as asf
import numpy as np
import rasterio
import requests  # type: ignore[import]
from PIL import Image
from requests.auth import HTTPBasicAuth
from skimage import filters, morphology

from pipeline.utils.aoi import aoi_to_wkt as _aoi_to_wkt
from pipeline.utils.downloads import download_with_auth
from .utils import CityDescriptor, tileset_path

LOGGER = logging.getLogger(__name__)


def _tmp_dir(kind: str = "sar") -> str:
    """
    Cross-platform temp directory for intermediate SAR files.
    Example on Windows: C:\\Users\\<user>\\AppData\\Local\\Temp\\flood_lens\\sar
    """
    d = os.path.join(tempfile.gettempdir(), "flood_lens", kind)
    os.makedirs(d, exist_ok=True)
    return d


def _to_folder_url(asset_url: str) -> str:
    """
    Convert a product asset URL to its containing folder URL.
    e.g. https://.../OPERA_L2_RTC-S1_<ID>/OPERA_L2_RTC-S1_<ID>.h5
      -> https://.../OPERA_L2_RTC-S1_<ID>/
    """
    parts = list(urlparse(asset_url))
    parts[2] = parts[2].rsplit("/", 1)[0] + "/"
    return urlunparse(parts)


def _list_dir_for_tifs(dir_url: str, session: requests.Session) -> list[str]:
    """
    Fetch an HTML directory listing and return absolute URLs to .tif/.tiff files.
    No extra deps: simple regex extraction of hrefs.
    """
    r = session.get(dir_url, timeout=60)
    r.raise_for_status()
    hrefs = re.findall(r'href="([^"]+)"', r.text, flags=re.I)
    return [urljoin(dir_url, h) for h in hrefs if re.search(r"\.(tif|tiff)$", h, re.I)]


def _pick_preferred_tif(urls: list[str]) -> str | None:
    """
    Prefer VV over VH when both are present (common in OPERA RTC products).
    Falls back to the first tif when specific polarizations aren’t found.
    """
    vv = [u for u in urls if re.search(r"(gamma0_)?VV\.tif$", u, re.I)]
    if vv:
        return vv[0]
    vh = [u for u in urls if re.search(r"(gamma0_)?VH\.tif$", u, re.I)]
    if vh:
        return vh[0]
    return urls[0] if urls else None


def _download_opera_geotiff(product_url: str, session: requests.Session, logger) -> str | None:
    """
    Given an OPERA RTC-S1 product asset URL (often an .h5), list the product folder,
    select a GeoTIFF (VV preferred), download it, and return the local file path.
    """
    folder = _to_folder_url(product_url)
    tif_urls = _list_dir_for_tifs(folder, session)
    tif_url = _pick_preferred_tif(tif_urls)
    if not tif_url:
        logger.warning("OPERA RTC folder has no GeoTIFFs: %s", folder)
        return None

    out_dir = _tmp_dir("sar")
    local_tif = os.path.join(out_dir, os.path.basename(tif_url))

    with session.get(tif_url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(local_tif, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                if chunk:
                    f.write(chunk)

    logger.info("OPERA RTC: selected %s -> %s", os.path.basename(tif_url), local_tif)
    return local_tif


def _detect_water_from_geotiff(local_tif: str, *, scene_id: Optional[str] = None) -> Path:
    """
    Move/copy the downloaded GeoTIFF into a scene directory so downstream logic can re-use it.
    """
    tif_path = Path(local_tif)
    folder_name = scene_id or tif_path.stem
    scene_dir = DOWNLOAD_BASE / folder_name
    scene_dir.mkdir(parents=True, exist_ok=True)
    destination = scene_dir / tif_path.name
    if tif_path.resolve() != destination.resolve():
        if not destination.exists():
            shutil.copy2(tif_path, destination)
    return scene_dir


_configured_cache = os.getenv("FLOOD_LENS_SAR_CACHE")
if _configured_cache:
    DOWNLOAD_BASE = Path(_configured_cache)
else:
    DOWNLOAD_BASE = Path(_tmp_dir("sar"))
DOWNLOAD_BASE.mkdir(parents=True, exist_ok=True)
NEW_WATER_COLOR = (0, 136, 204, 160)
VV_SUFFIX = "_VV.tif"
VH_SUFFIX = "_VH.tif"
MAX_SCENES = 3
TILE_ZOOM_MIN = 8
TILE_ZOOM_MAX = 14


def _earthdata_auth() -> Optional[HTTPBasicAuth]:
    username = os.getenv("EARTHDATA_USERNAME")
    password = os.getenv("EARTHDATA_PASSWORD")
    if username and password:
        return HTTPBasicAuth(username, password)
    return None


def _prop(product, *keys, default=None):
    props = getattr(product, "properties", {}) or {}
    for key in keys:
        value = props.get(key)
        if value not in (None, "", []):
            return value
    for key in keys:
        value = getattr(product, key, None)
        if value not in (None, "", []):
            return value
    return default


def _iso_to_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        try:
            return datetime.strptime(value, "%Y-%m-%d %H:%M:%S%z")
        except Exception:
            return None


def search_s1(
    aoi,
    *,
    start: datetime,
    end: datetime,
    max_results: int,
) -> list:
    wkt = _aoi_to_wkt(aoi)
    platform_constant = getattr(asf, "PLATFORM", None)
    platform = [platform_constant.SENTINEL1] if platform_constant and hasattr(platform_constant, "SENTINEL1") else ["SENTINEL-1"]

    return asf.geo_search(
        intersectsWith=wkt,
        platform=platform,
        beamMode="IW",
        polarization=["VV", "VV+VH"],
        processingLevel=["GRD", "GRD_HD", "GRD_MD", "RTC"],
        start=start.isoformat(),
        end=end.isoformat(),
        maxResults=max_results,
    )


def _normalize_products(products: list) -> list:
    normalized = []
    for product in products:
        scene_id = _prop(product, "sceneName", "fileID", "displayId", "granuleName", default=None)
        start_time = _iso_to_dt(_prop(product, "startTime", "startDate", "start_time"))
        stop_time = _iso_to_dt(_prop(product, "stopTime", "stopDate", "stop_time"))
        processing = _prop(product, "processingLevel", "processing_type", "processingLevelDisplay")
        dataset = _prop(product, "dataset", "collectionName", "datasetShortName", "productType")
        download_url = _prop(product, "url", "downloadUrl", "dataUrl")
        normalized.append(
            {
                "product": product,
                "scene_id": scene_id,
                "start": start_time,
                "stop": stop_time,
                "processing": processing,
                "dataset": dataset,
                "download_url": download_url,
            }
        )
    return normalized


def _choose_product(candidates: list) -> Optional[dict]:
    if not candidates:
        return None

    def processing_rank(value: Optional[str]) -> int:
        if not value:
            return 3
        token = value.upper()
        if "RTC" in token:
            return 0
        if token == "GRD_HD":
            return 1
        if token == "GRD_MD":
            return 2
        return 3

    def sort_key(item: dict):
        rank = processing_rank(item.get("processing"))
        timestamp = item.get("start") or item.get("stop") or datetime.min.replace(tzinfo=timezone.utc)
        ts_value = -timestamp.timestamp() if hasattr(timestamp, "timestamp") else float("inf")
        return (rank, ts_value)

    return min(candidates, key=sort_key)


def _download_latest_scene(bbox: Tuple[float, float, float, float], days: int) -> Optional[tuple[Path, Optional[datetime]]]:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    results = search_s1(
        bbox,
        start=start,
        end=now,
        max_results=max(MAX_SCENES, 100),
    )
    if not results:
        LOGGER.warning("No Sentinel-1 scenes found for bbox %s in last %s days", bbox, days)
        return None

    normalized = _normalize_products(results)
    chosen = _choose_product(normalized)
    if chosen is None:
        LOGGER.warning("Unable to select Sentinel-1 product for bbox %s", bbox)
        return None

    product = chosen["product"]
    scene_id = chosen.get("scene_id") or getattr(product, "scene_id", None) or getattr(product, "granuleName", None)
    if not scene_id:
        scene_id = f"sentinel_{chosen.get('start') or chosen.get('stop') or now:%Y%m%d%H%M%S}"
    acquisition = chosen.get("start") or chosen.get("stop")

    auth = _earthdata_auth()
    dataset_name = (chosen.get("dataset") or _prop(product, "dataset") or "").upper()
    download_url = chosen.get("download_url") or _prop(product, "url", "downloadUrl", "dataUrl")
    target_dir = DOWNLOAD_BASE / scene_id
    if target_dir.exists():
        return target_dir, acquisition

    download_url = download_url or ""
    dataset_name = dataset_name or ""
    collection_id = (_prop(product, "collectionName", "collection") or "").upper()
    path_hint = urlparse(download_url).path.upper() if download_url else ""

    session = requests.Session()
    session.auth = (
        os.getenv("EARTHDATA_USERNAME", ""),
        os.getenv("EARTHDATA_PASSWORD", ""),
    )

    try:
        is_opera = (
            "OPERA_L2_RTC-S1" in dataset_name
            or "OPERA_L2_RTC-S1" in collection_id
            or "/OPERA/OPERA_L2_RTC-S1/" in path_hint
        )

        if is_opera and download_url:
            local_tif = _download_opera_geotiff(download_url, session, LOGGER)
            if not local_tif:
                LOGGER.warning("OPERA RTC: no usable GeoTIFF; skipping product %s", download_url)
                return None
            scene_root = _detect_water_from_geotiff(local_tif, scene_id=scene_id)
            return scene_root, acquisition
    finally:
        session.close()

    if download_url:
        download_path = download_with_auth(download_url, out_dir=DOWNLOAD_BASE, auth=auth)
    else:
        LOGGER.info("Using ASF product.download fallback for %s", scene_id)
        archive_path = DOWNLOAD_BASE / f"{scene_id}.zip"
        product.download(str(archive_path))
        download_path = archive_path

    if download_path.is_dir():
        return download_path, acquisition

    if download_path.suffix.lower() == ".zip":
        extract_dir = DOWNLOAD_BASE / download_path.stem
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(download_path, "r") as zf:
            zf.extractall(extract_dir)
        download_path.unlink(missing_ok=True)
        return extract_dir, acquisition

    LOGGER.warning("Downloaded Sentinel-1 product %s is not an archive; path=%s", scene_id, download_path)
    return None


def _find_band(root: Path, suffix: str) -> Optional[Path]:
    if root.is_file():
        return root if root.name.endswith(suffix) else None
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

    scene_info = _download_latest_scene(bbox, days)
    if scene_info is None:
        return {"new_water_km2": 0.0, "pct_aoi": 0.0, "age_hours": days * 24}
    scene_dir, acquisition_time = scene_info

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

    if acquisition_time is None:
        acquisition_time = datetime.now(timezone.utc)
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
