"""IMERG precipitation feature extraction."""

from __future__ import annotations

import logging
import math
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterator, Optional, Sequence, Tuple

import certifi  # type: ignore[import]
import numpy as np
import requests  # type: ignore[import]
import xarray as xr  # type: ignore[import]
from requests.adapters import HTTPAdapter  # type: ignore[import]
from urllib3.util.retry import Retry  # type: ignore[import]

from pipeline.sources.imerg_pps import imerg_pps_aggregate
from .utils import CityDescriptor

LOGGER = logging.getLogger(__name__)

CACHE_ROOT = Path.home() / ".cache" / "flood_lens" / "imerg"
HALF_HOUR = timedelta(minutes=30)
DECAY_K = 0.88
COLLECTION = {
    "final": "https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGHH.07",
    "late": "https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGHHL.07",
    "early": "https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGHHE.07",
    "early_legacy": "https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGHH_E.07",
}

HOSTS = ("gpm1", "gpm2")

_SESSION = requests.Session()
_SESSION.verify = certifi.where()
_SESSION.headers.update({"User-Agent": "floodlens-imerg/1.0"})
_RETRY = Retry(
    total=3,
    backoff_factor=1,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset({"GET", "HEAD"}),
)
_SESSION.mount("https://", HTTPAdapter(max_retries=_RETRY))
_SESSION.mount("http://", HTTPAdapter(max_retries=_RETRY))


def _env_auth() -> Optional[Tuple[str, str]]:
    username = os.getenv("EARTHDATA_USERNAME")
    password = os.getenv("EARTHDATA_PASSWORD")
    if username and password:
        return username, password
    return None


def _clean_value(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    try:
        scalar = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(scalar) else scalar


def _floor_to_half_hour(moment: datetime) -> datetime:
    moment_utc = moment.astimezone(timezone.utc)
    minute = 0 if moment_utc.minute < 30 else 30
    return moment_utc.replace(minute=minute, second=0, microsecond=0)


def _imerg_fname(run: str, slot: datetime) -> str:
    slot_utc = slot.astimezone(timezone.utc)
    slot_end = slot_utc + HALF_HOUR - timedelta(seconds=1)
    ymd = slot_utc.strftime("%Y%m%d")
    start_token = slot_utc.strftime("%H%M%S")
    end_token = slot_end.strftime("%H%M%S")
    if run == "late":
        prefix = "3B-HHR-L"
    elif run == "early":
        prefix = "3B-HHR-E"
    else:
        prefix = "3B-HHR"
    return f"{prefix}.MS.MRG.3IMERG.{ymd}-S{start_token}-E{end_token}.V07B.HDF5"


def _url_path_ymd(base: str, run: str, slot: datetime) -> str:
    slot_utc = slot.astimezone(timezone.utc)
    return f"{base}/{slot_utc:%Y}/{slot_utc:%m}/{slot_utc:%d}/{_imerg_fname(run, slot_utc)}"


def _url_path_ym(base: str, run: str, slot: datetime) -> str:
    slot_utc = slot.astimezone(timezone.utc)
    return f"{base}/{slot_utc:%Y}/{slot_utc:%m}/{_imerg_fname(run, slot_utc)}"


def _slots_30m_utc(start: datetime, end: datetime) -> Iterator[datetime]:
    start_utc = start.astimezone(timezone.utc)
    end_utc = end.astimezone(timezone.utc)
    current = _floor_to_half_hour(start_utc)
    while current < end_utc:
        yield current
        current += HALF_HOUR


def _preflight_slot(run: str, slot: datetime, auth: Optional[Tuple[str, str]]) -> None:
    base_candidates: Tuple[str, ...]
    if run == "early":
        base_candidates = (COLLECTION["early"], COLLECTION["early_legacy"])
    else:
        base_candidates = (COLLECTION[run],)

    for host in HOSTS:
        for base in base_candidates:
            base_url = base.replace("gpm1.", f"{host}.")
            for builder in (_url_path_ym, _url_path_ymd):
                url = builder(base_url, run, slot)
                try:
                    response = _SESSION.head(url, auth=auth, allow_redirects=False, timeout=20)
                    LOGGER.info("IMERG preflight HEAD %s -> %s", url, response.status_code)
                    if response.status_code == 404:
                        continue
                    if response.status_code in (301, 302, 303, 307, 308):
                        LOGGER.warning(
                            "IMERG preflight redirect. Ensure your Earthdata profile authorizes 'NASA GESDISC DATA ARCHIVE'."
                        )
                    elif response.status_code == 401:
                        LOGGER.warning(
                            "IMERG preflight 401 Unauthorized. Verify EARTHDATA_USERNAME/PASSWORD and GES DISC authorization."
                        )
                    return
                except Exception as exc:  # noqa: BLE001
                    LOGGER.warning("IMERG preflight failed: %s", exc)
                    return

    LOGGER.debug("IMERG preflight: no reachable URL for run=%s slot=%s", run, slot)


def _runs_for_preference(prefer_run: str) -> Tuple[str, ...]:
    if prefer_run == "final":
        return ("final",)
    if prefer_run == "early":
        return ("early", "late")
    return ("late", "early")


def _fetch(url: str, auth: Optional[Tuple[str, str]], timeout: int = 60) -> Optional[bytes]:
    try:
        response = _SESSION.get(url, auth=auth, stream=True, timeout=timeout, allow_redirects=True)
        if response.status_code == 404:
            LOGGER.debug("IMERG 404: %s", url)
            return None
        response.raise_for_status()
        return response.content
    except requests.exceptions.ReadTimeout:
        LOGGER.warning("IMERG timeout: %s", url)
        return None


def _fetch_slot(run: str, slot: datetime, auth: Optional[Tuple[str, str]]) -> Optional[bytes]:
    bases: Tuple[str, ...]
    if run == "early":
        bases = (COLLECTION["early"], COLLECTION["early_legacy"])
    else:
        bases = (COLLECTION[run],)

    for host in HOSTS:
        for base in bases:
            url_base = base.replace("gpm1.", f"{host}.")
            for builder in (_url_path_ym, _url_path_ymd):
                url = builder(url_base, run, slot)
                blob = _fetch(url, auth)
                if blob is not None:
                    return blob
    return None


@contextmanager
def _open_granule(start: datetime, runs: Sequence[str], auth: Optional[Tuple[str, str]]) -> Iterator[Optional[str]]:
    runs_tuple = tuple(runs)
    if not runs_tuple:
        yield None
        return

    slot_utc = start.astimezone(timezone.utc)
    year = slot_utc.strftime("%Y")
    month = slot_utc.strftime("%m")
    day = slot_utc.strftime("%d")

    # Return cached granule if already present for any run.
    for run in runs_tuple:
        filename = _imerg_fname(run, start)
        cached = CACHE_ROOT / run / year / month / day / filename
        if cached.exists():
            yield str(cached)
            return

    last_error: Optional[Exception] = None
    for run in runs_tuple:
        filename = _imerg_fname(run, start)
        cache_dir = CACHE_ROOT / run / year / month / day
        cache_dir.mkdir(parents=True, exist_ok=True)
        cached = cache_dir / filename

        blob = _fetch_slot(run, start, auth)
        if blob is None:
            continue
        try:
            cached.write_bytes(blob)
            yield str(cached)
            return
        except Exception as exc:  # noqa: BLE001
            cached.unlink(missing_ok=True)
            last_error = exc
            continue

    if last_error:
        LOGGER.warning("IMERG download failed for %s: %s", start, last_error)
    yield None


def _clip_precip(path: str, bbox: Tuple[float, float, float, float]) -> float:
    min_lon, min_lat, max_lon, max_lat = bbox
    with xr.open_dataset(path, engine="h5netcdf") as ds:
        data = ds["precipitationCal"]
        lats = data["lat"].values
        lons = data["lon"].values

        if lons.min() >= 0:
            min_lon = min_lon % 360
            max_lon = max_lon % 360

        lat_slice = slice(max_lat, min_lat) if lats[0] > lats[-1] else slice(min_lat, max_lat)

        if min_lon <= max_lon:
            lon_slice = slice(min_lon, max_lon)
            subset = data.sel(lat=lat_slice, lon=lon_slice)
        else:
            subset_w = data.sel(lat=lat_slice, lon=slice(min_lon, 360))
            subset_e = data.sel(lat=lat_slice, lon=slice(0, max_lon))
            subset = xr.concat([subset_w, subset_e], dim="lon")

        arr = subset.where(np.isfinite(subset)).mean().item()
        if arr is None or math.isnan(arr):
            return 0.0
        return float(arr) * 0.5  # convert mm/hr to mm over 30 minutes


def aggregate_imerg(
    bbox: Tuple[float, float, float, float],
    start: datetime,
    end: datetime,
    auth: Optional[Tuple[str, str]] = None,
    prefer_run: str = "late",
) -> Optional[Dict[str, float]]:
    if auth is None:
        auth = _env_auth()

    prefer_run = prefer_run if prefer_run in ("late", "early", "final") else "late"
    runs = _runs_for_preference(prefer_run)
    slots = list(_slots_30m_utc(start, end))
    LOGGER.info(
        "IMERG window UTC: %s .. %s slots=%d prefer=%s",
        start.astimezone(timezone.utc),
        end.astimezone(timezone.utc),
        len(slots),
        prefer_run,
    )

    if not slots:
        LOGGER.warning("IMERG: empty slot list for bbox %s", bbox)
        return None

    mm_steps: list[float] = []
    if auth:
        if runs:
            _preflight_slot(runs[0], slots[0], auth)
        for slot in slots:
            with _open_granule(slot, runs, auth) as local_path:
                if local_path is None:
                    continue
                mm_steps.append(_clip_precip(local_path, bbox))
    else:
        LOGGER.warning("IMERG: Earthdata credentials missing; skipping GES DISC download.")

    if not mm_steps:
        LOGGER.warning(
            "IMERG: no GES DISC granules in window (%s..%s, run=%s) for bbox %s; attempting PPS fallback.",
            start,
            end,
            prefer_run,
            bbox,
        )
        pps_run = prefer_run if prefer_run in ("late", "early") else "late"
        pps = imerg_pps_aggregate(bbox, start, end, prefer=pps_run)
        if pps:
            return {
                "h3": _clean_value(pps.get("h0_3")),
                "h24": _clean_value(pps.get("h24")),
                "h72": None,
                "api72": None,
            }
        LOGGER.warning("IMERG PPS fallback unavailable; returning None.")
        return None

    h3 = sum(mm_steps[-6:])
    h24 = sum(mm_steps[-48:])
    h72 = sum(mm_steps)

    api = 0.0
    for precip in reversed(mm_steps):
        api = precip + DECAY_K * api

    return {
        "h3": round(h3, 1),
        "h24": round(h24, 1),
        "h72": round(h72, 1),
        "api72": round(api, 1),
    }


def summarize_imerg_precipitation(city: CityDescriptor) -> Optional[Dict[str, float]]:
    """Convenience wrapper using the city's bounding box."""

    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=72)
    return aggregate_imerg(city.bbox, start, end, auth=None, prefer_run="late")
