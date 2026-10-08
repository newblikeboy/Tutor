#!/usr/bin/env python3
"""Stage hashed assets with a 30-day retired-asset grace period; never delete releases."""
import argparse
import json
import shutil
import time
from pathlib import Path

GRACE_SECONDS = 30 * 24 * 60 * 60
MANIFEST = "ASSET_RETENTION.json"


def assets(directory):
    if not directory.is_dir():
        raise ValueError(f"Missing asset directory: {directory}")
    result = {}
    for path in directory.rglob("*"):
        if path.is_symlink():
            raise ValueError("Asset symlinks are not supported")
        if path.is_file():
            result[path.relative_to(directory).as_posix()] = path
    return result


def stage(previous, release, fresh, now=None):
    now = time.time() if now is None else now
    previous, release, fresh = map(lambda p: Path(p).resolve(), (previous, release, fresh))
    if previous == release or previous in release.parents or release in previous.parents:
        raise ValueError("Release directories must be distinct siblings")
    if (release / MANIFEST).exists():
        raise ValueError("Destination was already staged")
    destination_assets = release / "web/assets"
    if destination_assets.exists() and any(destination_assets.iterdir()):
        raise ValueError("Destination asset directory must be empty")
    previous_files, current_files = assets(previous / "web/assets"), assets(fresh)
    manifest_path = previous / MANIFEST
    if manifest_path.exists():
        metadata = json.loads(manifest_path.read_text(encoding="utf-8"))
        current = set(metadata["current"])
        retired = metadata["retired"]
        if not current.issubset(previous_files) or not set(retired).issubset(previous_files):
            raise ValueError("Previous asset manifest references missing files")
        if current | set(retired) != set(previous_files):
            raise ValueError("Previous asset manifest is incomplete")
    else:
        # One-time migration: retain every existing asset for a full grace period.
        current, retired = set(previous_files), {}
    carried = {}
    for name, source in previous_files.items():
        if name in current_files:
            continue
        retired_at = now if name in current else float(retired[name])
        if now - retired_at < GRACE_SECONDS:
            destination = release / "web/assets" / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            carried[name] = retired_at
    for name, source in current_files.items():
        destination = release / "web/assets" / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    (release / MANIFEST).write_text(json.dumps({"current": sorted(current_files), "retired": carried}, indent=2) + "\n", encoding="utf-8")
    return len(current_files), len(carried)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("previous", type=Path)
    parser.add_argument("release", type=Path)
    parser.add_argument("fresh_assets", type=Path)
    args = parser.parse_args()
    current, retained = stage(args.previous, args.release, args.fresh_assets)
    print(f"Staged {current} current assets and {retained} assets retained for existing tabs.")
