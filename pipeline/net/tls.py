"""
TLS bootstrap for Windows/corporate networks.
- Exports CA path via env so any lib (asf_search, requests) picks it up.
- Tries python-certifi-win32 to use Windows cert store (corporate roots).
- Provides a small --check CLI for diagnostics.
"""

from __future__ import annotations

import os
import sys


def ensure_tls() -> str | None:
    try:
        import certifi

        ca = certifi.where()
        os.environ["SSL_CERT_FILE"] = ca
        os.environ["REQUESTS_CA_BUNDLE"] = ca
        try:
            import certifi_win32  # noqa: F401
        except Exception:
            pass
        return ca
    except Exception:
        return None


_CA = ensure_tls()


if __name__ == "__main__":
    import json

    info = {
        "SSL_CERT_FILE": os.environ.get("SSL_CERT_FILE"),
        "REQUESTS_CA_BUNDLE": os.environ.get("REQUESTS_CA_BUNDLE"),
        "ca_detected": _CA,
    }
    try:
        import certifi
        import requests

        session = requests.Session()
        session.verify = certifi.where()
        info["cmr_status"] = session.get("https://cmr.earthdata.nasa.gov", timeout=30).status_code
        info["gesdisc_status"] = session.get("https://gpm1.gesdisc.eosdis.nasa.gov/", timeout=30).status_code
    except Exception as exc:
        info["probe_error"] = str(exc)

    print(json.dumps(info, indent=2))
