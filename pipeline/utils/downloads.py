from __future__ import annotations

import tempfile
import zipfile
from pathlib import Path
from typing import Optional

import requests  # type: ignore[import]

CHUNK_SIZE = 1 << 20  # 1 MiB


def _cache_dir(kind: str = "sar") -> Path:
    base = Path(tempfile.gettempdir()) / "flood_lens" / kind
    base.mkdir(parents=True, exist_ok=True)
    return base


def download_with_auth(url: str, out_dir: Optional[Path] = None, auth=None, timeout: int = 600) -> Path:
    out_dir = Path(out_dir) if out_dir else _cache_dir("sar")
    out_dir.mkdir(parents=True, exist_ok=True)

    filename = url.split("/")[-1]
    out_path = out_dir / filename

    with requests.get(url, stream=True, timeout=timeout, auth=auth) as response:
        response.raise_for_status()
        with out_path.open("wb") as handle:
            for chunk in response.iter_content(CHUNK_SIZE):
                if chunk:
                    handle.write(chunk)

    try:
        if out_path.suffix.lower() == ".zip" or zipfile.is_zipfile(out_path):
            extract_dir = out_dir / out_path.stem
            extract_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(out_path, "r") as archive:
                archive.extractall(extract_dir)
            out_path.unlink(missing_ok=True)
            return extract_dir
    except zipfile.BadZipFile:
        pass

    return out_path
