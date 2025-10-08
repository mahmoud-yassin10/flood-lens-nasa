# pipeline/predict/forecast_proxy.py
from typing import Optional, Tuple

import certifi
import requests

_SESSION = requests.Session()
_SESSION.verify = certifi.where()


def _center_of_bbox(bbox: Tuple[float, float, float, float]) -> Tuple[float, float]:
    minx, miny, maxx, maxy = bbox
    lat = (miny + maxy) / 2.0
    lon = (minx + maxx) / 2.0
    return lat, lon


def precip_forecast_norm(city_id: str, bbox: Tuple[float, float, float, float], hours: int = 24) -> Optional[float]:
    """
    Returns a 0..1 precipitation proxy for the next `hours` hours using Open-Meteo.
    Strategy: sum hourly 'precipitation' over the horizon, normalize by 50mm cap.
    """
    try:
        lat, lon = _center_of_bbox(bbox)
        params = {
            "latitude": f"{lat:.5f}",
            "longitude": f"{lon:.5f}",
            "hourly": "precipitation",
            "forecast_days": "2",
            "timezone": "UTC",
        }
        url = "https://api.open-meteo.com/v1/forecast"
        response = _SESSION.get(url, params=params, timeout=20)
        response.raise_for_status()
        data = response.json()
        hourly = data.get("hourly") or {}
        precipitation = hourly.get("precipitation") or []
        if not precipitation:
            return None
        horizon = max(0, int(hours))
        total_mm = float(sum(precipitation[:horizon]))
        norm = max(0.0, min(1.0, total_mm / 50.0))
        return norm
    except Exception:
        return None
