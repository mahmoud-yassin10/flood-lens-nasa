from shapely.geometry import box, shape

__all__ = ["aoi_to_wkt"]


def aoi_to_wkt(aoi):
    """
    Accepts:
      - WKT string
      - bbox [minx, miny, maxx, maxy]
      - GeoJSON dict
    Returns WKT string.
    """
    if isinstance(aoi, str):
        return aoi
    if isinstance(aoi, (list, tuple)) and len(aoi) == 4:
        return box(*aoi).wkt
    if isinstance(aoi, dict) and "type" in aoi:
        return shape(aoi).wkt
    raise TypeError("AOI must be WKT string, bbox list, or GeoJSON dict")
