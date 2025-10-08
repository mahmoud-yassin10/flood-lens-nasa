"""IMERG precipitation feature extraction."""

from __future__ import annotations

import logging
import math
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterator, Optional, Sequence, Tuple

import certifi
import numpy as np
import requests
import xarray as xr
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .utils import CityDescriptor

LOGGER = logging.getLogger(__name__)
COLLECTION = {
    "final": "https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGHH.07",
    "late": "https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGHH_L.07",
    "early": "https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGHH_E.07",
}
CACHE_ROOT = Path.home() / ".cache" / "flood_lens" / "imerg"
HALF_HOUR = timedelta(minutes=30)
DECAY_K = 0.88


class DownloadError(RuntimeError):
    """Raised when an IMERG granule cannot be retrieved."""


def _create_session(auth: Optional[Tuple[str, str]] = None) -> requests.Session:
    if auth is None:
        username = os.getenv("EARTHDATA_USERNAME")
        password = os.getenv("EARTHDATA_PASSWORD")
        if not username or not password:
            raise EnvironmentError("EARTHDATA_USERNAME and EARTHDATA_PASSWORD must be set")
    else:
        username, password = auth

    session = requests.Session()
    session.verify = certifi.where()
    session.auth = (username, password)
    session.headers.update({"User-Agent": "floodlens-imerg/1.0"})
    retry = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def _floor_to_half_hour(moment: datetime) -> datetime:
    moment_utc = moment.astimezone(timezone.utc)
    minute = 0 if moment_utc.minute < 30 else 30
    return moment_utc.replace(minute=minute, second=0, microsecond=0)


def _granule_meta(start: datetime, run: str) -> Tuple[str, str, str]:
    start_utc = start.astimezone(timezone.utc)
    end_utc = start_utc + HALF_HOUR - timedelta(seconds=1)
    year = start_utc.strftime("%Y")
    month = start_utc.strftime("%m")
    if run == "late":
        prefix = "3B-HHR-L"
    elif run == "early":
        prefix = "3B-HHR-E"
    else:
        prefix = "3B-HHR"
    filename = (
        f"{prefix}.MS.MRG.3IMERG.{start_utc:%Y%m%d}-S{start_utc:%H%M%S}-E{end_utc:%H%M%S}.V07B.HDF5"
    )
    return year, month, filename


def _url_for_slot(start: datetime, run: str) -> str:
    year, month, filename = _granule_meta(start, run)
    base = COLLECTION[run]
    return f"{base}/{year}/{month}/{filename}"


def _slots_30m_utc(start: datetime, end: datetime) -> Iterator[datetime]:
    start_utc = start.astimezone(timezone.utc)
    end_utc = end.astimezone(timezone.utc)
    current = _floor_to_half_hour(start_utc)
    while current < end_utc:
        yield current
        current += HALF_HOUR


def _preflight(url: str, session: requests.Session) -> None:
    try:
        response = session.head(url, auth=session.auth, allow_redirects=False, timeout=20)
        LOGGER.info("IMERG preflight HEAD %s -> %s", url, response.status_code)
        if response.status_code in (301, 302, 303, 307, 308):
            LOGGER.warning(
                "IMERG preflight redirect. Ensure your Earthdata profile authorizes 'NASA GESDISC DATA ARCHIVE'."
            )
        elif response.status_code == 401:
            LOGGER.warning(
                "IMERG preflight 401 Unauthorized. Verify EARTHDATA_USERNAME/PASSWORD and GES DISC authorization."
            )
    except Exception as exc:  # noqa: BLE001
        LOGGER.warning("IMERG preflight failed: %s", exc)


def _runs_for_preference(prefer_run: str) -> Tuple[str, ...]:
    if prefer_run == "final":
        return ("final",)
    if prefer_run == "early":
        return ("early", "late")
    return ("late", "early")


@contextmanager
def _open_granule(start: datetime, session: requests.Session, runs: Sequence[str]) -> Iterator[Optional[str]]:
    runs_tuple = tuple(runs)
    if not runs_tuple:
        yield None
        return

    year, month, filename = _granule_meta(start)
    cache_dir = CACHE_ROOT / year / month
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached = cache_dir / filename

    if cached.exists():
        try:
            yield str(cached)
        except Exception:
            cached.unlink(missing_ok=True)
            raise
        return

    last_error: Optional[Exception] = None
    for run in runs_tuple:
        url = _url_for_slot(start, run)
        try:
            response = session.get(url, stream=True, timeout=180)
        except requests.exceptions.ReadTimeout:
            LOGGER.warning("IMERG timed out: %s", url)
            continue
        if response.status_code == 401:
            last_error = EnvironmentError("Earthdata credentials rejected; check EARTHDATA_USERNAME/PASSWORD")
            break
        if response.status_code == 404:
            LOGGER.debug("IMERG missing (404) [%s]: %s", run, url)
            continue
        if not response.ok:
            last_error = DownloadError(f"Failed to download {url}: {response.status_code}")
            continue

        with cached.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1_048_576):
                handle.write(chunk)
        try:
            yield str(cached)
        except Exception:
            cached.unlink(missing_ok=True)
            raise
        return

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

    session = _create_session(auth)
    mm_steps: list[float] = []
    try:
        if runs:
            first_url = _url_for_slot(slots[0], runs[0])
            _preflight(first_url, session)
        for slot in slots:
            with _open_granule(slot, session, runs) as local_path:
                if local_path is None:
                    continue
                mm_steps.append(_clip_precip(local_path, bbox))
    finally:
        session.close()

    if not mm_steps:
        LOGGER.warning(
            "IMERG: no granules in window (%s..%s, run=%s) for bbox %s.",
            start,
            end,
            prefer_run,
            bbox,
        )
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
