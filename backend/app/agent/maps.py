"""Geocoding + routing via the free OpenStreetMap ecosystem (no API keys).

Nominatim resolves place names to coordinates; OSRM's public demo router returns
route geometry. Both endpoints come from config so they can be self-hosted later.
Usage etiquette: a real User-Agent and ≤1 geocode/sec (we cache to stay well under).
"""

from __future__ import annotations

import asyncio

import httpx

from app.config import get_settings
from app.logging_setup import get_logger
from app.schema import MapPoint, MapRoute

log = get_logger("maps")

_UA = "silly-chat/1.0 (self-hosted family chat)"
_geocache: dict[str, MapPoint | None] = {}
_geocode_lock = asyncio.Lock()


async def geocode(query: str) -> MapPoint | None:
    """Resolve a place name to (lat, lon) via Nominatim. Cached; rate-limited."""
    key = query.strip().lower()
    if key in _geocache:
        return _geocache[key]
    async with _geocode_lock:  # serialize → respects the 1 req/s policy
        if key in _geocache:
            return _geocache[key]
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(
                    f"{get_settings().maps.nominatim_url.rstrip('/')}/search",
                    params={"q": query, "format": "json", "limit": 1},
                    headers={"User-Agent": _UA},
                )
                r.raise_for_status()
                hits = r.json()
            point = (
                MapPoint(
                    name=hits[0].get("display_name", query).split(",")[0] or query,
                    lat=float(hits[0]["lat"]),
                    lon=float(hits[0]["lon"]),
                )
                if hits
                else None
            )
        except Exception as exc:
            log.warning("geocode failed for %r: %s", query, exc)
            point = None
        _geocache[key] = point
        await asyncio.sleep(1)  # be a polite Nominatim citizen
        return point


async def route(points: list[MapPoint], profile: str = "car") -> MapRoute | None:
    """Route through the given points via OSRM. profile: car | bike | foot."""
    if len(points) < 2:
        return None
    if profile not in ("car", "bike", "foot"):
        profile = "car"
    base = get_settings().maps.osrm_url.rstrip("/")
    base = base.format(profile=profile) if "{profile}" in base else base
    coords = ";".join(f"{p.lon},{p.lat}" for p in points)
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(
                f"{base}/route/v1/driving/{coords}",  # path profile is vestigial in OSRM
                params={"overview": "full", "geometries": "geojson"},
                headers={"User-Agent": _UA},
            )
            r.raise_for_status()
            data = r.json()
        if data.get("code") != "Ok" or not data.get("routes"):
            return None
        best = data["routes"][0]
        # GeoJSON is [lon, lat]; the renderer wants [lat, lon].
        geometry = [[lat, lon] for lon, lat in best["geometry"]["coordinates"]]
        return MapRoute(
            distance_km=round(best["distance"] / 1000, 1),
            duration_min=round(best["duration"] / 60),
            mode=profile,  # type: ignore[arg-type]
            geometry=geometry,
        )
    except Exception as exc:
        log.warning("routing failed: %s", exc)
        return None
