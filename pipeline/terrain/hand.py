"""Height Above Nearest Drainage helpers."""

from __future__ import annotations

import logging
from typing import Any, Optional, Sequence

try:
    import richdem as rd
except Exception:  # pragma: no cover - handled at runtime
    rd = None

log = logging.getLogger(__name__)


def _first_attr(mod: Any, names: Sequence[str]) -> Optional[Any]:
    for name in names:
        if hasattr(mod, name):
            return getattr(mod, name)
    return None


def compute_hand(dem_array, bbox=None, nodata=None):
    """Return None on failure; callers should write JSON nulls."""
    try:
        if rd is None:
            log.info("richdem unavailable; skipping HAND.")
            return None

        geotransform = None
        if bbox is not None and getattr(dem_array, "shape", None):
            rows = dem_array.shape[0]
            cols = dem_array.shape[1] if len(dem_array.shape) > 1 else None
            if rows and cols:
                min_x, min_y, max_x, max_y = bbox
                px = (max_x - min_x) / float(cols)
                py = (max_y - min_y) / float(rows)
                if px and py:
                    geotransform = [min_x, px, 0.0, max_y, 0.0, -py]

        if geotransform:
            dem = rd.rdarray(dem_array, no_data=nodata, geotransform=geotransform)
        else:
            dem = rd.rdarray(dem_array, no_data=nodata)
        rd.FillDepressions(dem, in_place=True)

        flow_fn = _first_attr(rd, ("FlowDirD8", "rdFlowDirD8", "flowdir_d8"))
        if flow_fn is None:
            log.warning("richdem: no D8 flow function found; skipping HAND.")
            return None
        flow = flow_fn(dem)

        acc_fn = _first_attr(rd, ("FlowAccumulation", "rdFlowAccumulation"))
        if acc_fn:
            try:
                if hasattr(acc_fn, "__code__") and "method" in acc_fn.__code__.co_varnames:
                    _ = acc_fn(flow, method="D8")
                else:
                    _ = acc_fn(flow)
            except Exception:  # noqa: BLE001
                pass

        # TODO: plug your real HAND derivation here (using flow/acc + streams)
        # For now, return None -> UI shows empty state instead of wrong numbers.
        return None
    except Exception as exc:  # noqa: BLE001
        log.warning("HAND computation failed: %s", exc)
        return None
