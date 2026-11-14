"""Build the base-map layers in web/public/geo/ from Natural Earth (public domain).

Downloads three GeoJSON layers, drops every attribute and rounds coordinates so the files stay small.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.io import DATA, ROOT  # noqa: E402

BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
LAYERS = {
    "land": "ne_50m_land.geojson",
    "countries": "ne_50m_admin_0_boundary_lines_land.geojson",
    "admin1": "ne_50m_admin_1_states_provinces_lines.geojson",
}
DIGITS = 2


def rounded(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], DIGITS), round(coords[1], DIGITS)]
    out = [rounded(c) for c in coords]
    if out and isinstance(out[0][0], (int, float)):
        # drop consecutive duplicates created by rounding
        out = [p for i, p in enumerate(out) if i == 0 or p != out[i - 1]]
    return out


def main() -> None:
    raw = DATA / "geo_raw"
    raw.mkdir(parents=True, exist_ok=True)
    out = ROOT / "web" / "public" / "geo"
    out.mkdir(parents=True, exist_ok=True)
    for name, file in LAYERS.items():
        src = raw / file
        if not src.exists():
            r = requests.get(f"{BASE}/{file}", timeout=120)
            r.raise_for_status()
            src.write_bytes(r.content)
        gj = json.loads(src.read_text(encoding="utf-8"))
        feats = [{"type": "Feature", "properties": {}, "geometry": {"type": f["geometry"]["type"],
                  "coordinates": rounded(f["geometry"]["coordinates"])}} for f in gj["features"] if f.get("geometry")]
        dst = out / f"{name}.json"
        dst.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")), encoding="utf-8")
        print(f"{name}: {len(feats)} features, {dst.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
