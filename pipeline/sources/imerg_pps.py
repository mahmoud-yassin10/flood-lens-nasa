import datetime as dt
import io
import os
import re
import zipfile
from typing import List, Optional, Tuple

import numpy as np
import requests  # type: ignore[import]
import rasterio  # type: ignore[import]
from rasterio.windows import from_bounds  # type: ignore[import]

LIST_RE = re.compile(
    r"3B-HHR-(?P<run>[LE])\.MS\.MRG\.3IMERG\.(?P<ymd>\d{8})-S(?P<S>\d{6})-E(?P<E>\d{6})\.(?P<idx>\d{4})\.V07B\.(?P<span>30min|3hr|1day)\.(?P<ext>tif|zip)"
)


def _pps_auth() -> Optional[Tuple[str, str]]:
    email = os.getenv("PPS_EMAIL")
    return (email, email) if email else None


def _list_month(run: str, year: int, month: int) -> List[str]:
    base = "gis" if run == "late" else "early"
    url = f"https://jsimpsonhttps.pps.eosdis.nasa.gov/text/imerg/{base}/{year}/{month:02d}/"
    response = requests.get(url, auth=_pps_auth(), timeout=60)
    response.raise_for_status()
    return [m.group(0) for m in LIST_RE.finditer(response.text)]


def _pick(names: List[str], start: dt.datetime, end: dt.datetime, span: str) -> List[str]:
    out: List[str] = []
    for name in names:
        match = LIST_RE.match(name)
        if not match or match["span"] != span:
            continue
        start_time = dt.datetime.strptime(match["ymd"] + match["S"], "%Y%m%d%H%M%S").replace(tzinfo=dt.timezone.utc)
        end_time = dt.datetime.strptime(match["ymd"] + match["E"], "%Y%m%d%H%M%S").replace(tzinfo=dt.timezone.utc)
        if end_time > start and start_time < end:
            out.append(name)
    return sorted(out)


def _download(url: str) -> bytes:
    response = requests.get(url, auth=_pps_auth(), timeout=120, stream=True)
    response.raise_for_status()
    return response.content


def _file_url(run: str, name: str) -> str:
    base = "gis" if run == "late" else "early"
    match = LIST_RE.match(name)
    if not match:
        raise ValueError(f"Unrecognized IMERG filename: {name}")
    y = int(match["ymd"][:4])
    m = int(match["ymd"][4:6])
    return f"https://jsimpsonhttps.pps.eosdis.nasa.gov/imerg/{base}/{y}/{m:02d}/{name}"


def _tif_mean_mm(blob: bytes, bbox: Tuple[float, float, float, float]) -> float:
    with rasterio.MemoryFile(blob) as mem, mem.open() as dataset:
        window = from_bounds(*bbox, transform=dataset.transform)
        arr = dataset.read(1, window=window, masked=True).astype("float32")
        return float(np.nanmean(arr) * 0.1)


def _zip_sum_1day_mm(blob: bytes, bbox: Tuple[float, float, float, float]) -> float:
    values: List[float] = []
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        for name in archive.namelist():
            if name.lower().endswith(".tif"):
                values.append(_tif_mean_mm(archive.read(name), bbox))
    return float(np.nanmean(values)) if values else float("nan")


def imerg_pps_aggregate(
    bbox: Tuple[float, float, float, float],
    start: dt.datetime,
    end: dt.datetime,
    prefer: str = "late",
) -> Optional[dict]:
    runs = [prefer, "early"] if prefer == "late" else ["early", "late"]
    auth = _pps_auth()
    for run in runs:
        try:
            names = _list_month(run, end.year, end.month)
            if not names and (start.year, start.month) != (end.year, end.month):
                names = _list_month(run, start.year, start.month)
            if not names:
                continue

            half_hour_names = _pick(names, end - dt.timedelta(hours=3), end, "30min")
            h0_3 = (
                float(
                    np.nanmean(
                        [
                            _tif_mean_mm(_download(_file_url(run, name)), bbox)
                            for name in half_hour_names
                        ]
                    )
                )
                if half_hour_names
                else None
            )

            day_names = _pick(names, end - dt.timedelta(hours=24), end, "1day")
            if day_names:
                blob = _download(_file_url(run, day_names[-1]))
                h24 = _zip_sum_1day_mm(blob, bbox)
            else:
                half_day_names = _pick(names, end - dt.timedelta(hours=24), end, "30min")
                h24 = (
                    float(
                        np.nanmean(
                            [
                                _tif_mean_mm(_download(_file_url(run, name)), bbox)
                                for name in half_day_names
                            ]
                        )
                    )
                    if half_day_names
                    else None
                )

            return {"h0_3": h0_3, "h24": h24, "h72": None}
        except Exception:
            continue
    return None
