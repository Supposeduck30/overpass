"""Paths, config and small file helpers shared by every stage."""
from __future__ import annotations

import json
import os
from pathlib import Path

import yaml

PIPELINE = Path(__file__).resolve().parent.parent
ROOT = PIPELINE.parent
DATA = PIPELINE / "data"
WEB_DATA = ROOT / "web" / "public" / "data"


def load_config() -> dict:
    with open(PIPELINE / "config.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_region(cfg: dict, region_id: str) -> dict:
    for r in cfg["regions"]:
        if r["id"] == region_id:
            return r
    raise SystemExit(f"Unknown region '{region_id}'. Known: {[r['id'] for r in cfg['regions']]}")


def region_ids(cfg: dict, arg_region: str | None, arg_all: bool) -> list[str]:
    if arg_all:
        return [r["id"] for r in cfg["regions"]]
    if not arg_region:
        raise SystemExit("Pass --region ID or --all")
    return [get_region(cfg, r)["id"] for r in arg_region.split(",")]


def prepared_regions(cfg: dict, stage_file: str) -> list[str]:
    """Regions for which a given stage output exists, in config order."""
    return [r["id"] for r in cfg["regions"] if (DATA / stage_file.format(region=r["id"])).exists()]


def map_key() -> str | None:
    key = os.environ.get("FIRMS_MAP_KEY")
    env = PIPELINE / ".env"
    if not key and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("FIRMS_MAP_KEY="):
                key = line.split("=", 1)[1].strip()
    return key or None


def write_json(path: Path, obj, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        if compact:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        else:
            json.dump(obj, f, ensure_ascii=False, indent=1, allow_nan=False)


def read_json(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)
