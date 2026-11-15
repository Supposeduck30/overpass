"""Which points of a region's box lie inside its country.

The yearly archives are per country, while the Area API returns the whole box. Without this
clip a box that crosses a border would hold one country's fires for some satellites and two
countries' fires for others.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import requests

URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"
STEP = 0.02


def _rings(path: Path, name: str) -> list[np.ndarray]:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        r = requests.get(URL, timeout=120)
        r.raise_for_status()
        path.write_bytes(r.content)
    for f in json.loads(path.read_text(encoding="utf-8"))["features"]:
        if f["properties"]["ADMIN"] == name:
            g = f["geometry"]
            polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
            return [np.asarray(ring, dtype=float) for poly in polys for ring in poly]
    raise SystemExit(f"country outline not found: {name}")


def inside_rings(rings: list[np.ndarray], lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    """Even-odd rule over every ring, so holes and islands come out right."""
    inside = np.zeros(lon.shape, dtype=bool)
    for ring in rings:
        x0, y0, x1, y1 = ring[:-1, 0], ring[:-1, 1], ring[1:, 0], ring[1:, 1]
        near = (np.maximum(y0, y1) > lat.min()) & (np.minimum(y0, y1) <= lat.max()) & (np.maximum(x0, x1) >= lon.min())
        for ax, ay, bx, by in zip(x0[near], y0[near], x1[near], y1[near]):
            if ay == by:
                continue
            crosses = (ay > lat) != (by > lat)
            inside ^= crosses & (lon < ax + (lat - ay) * (bx - ax) / (by - ay))
    return inside


class CountryMask:
    """A raster of the box at STEP degrees; a point is inside if its raster cell's centre is."""

    def __init__(self, geo_dir: Path, name: str, bbox: list[float]):
        self.w, self.s, e, n = bbox
        self.nx = int(np.ceil((e - self.w) / STEP))
        self.ny = int(np.ceil((n - self.s) / STEP))
        lon, lat = np.meshgrid(self.w + (np.arange(self.nx) + 0.5) * STEP, self.s + (np.arange(self.ny) + 0.5) * STEP)
        self.grid = inside_rings(_rings(geo_dir / "ne_50m_admin_0_countries.geojson", name), lon, lat)

    def __call__(self, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
        ix = np.clip(((np.asarray(lon) - self.w) / STEP).astype(int), 0, self.nx - 1)
        iy = np.clip(((np.asarray(lat) - self.s) / STEP).astype(int), 0, self.ny - 1)
        return self.grid[iy, ix]

    @property
    def share(self) -> float:
        return float(self.grid.mean())
