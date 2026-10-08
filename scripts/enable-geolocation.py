#!/usr/bin/env python3
"""Operator-invoked correction of the existing GoCoaching Nginx location policy."""

import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

OLD = 'add_header Permissions-Policy "geolocation=(), camera=(), microphone=()" always;'
NEW = 'add_header Permissions-Policy "geolocation=(self), camera=(), microphone=()" always;'


def site_config(dump):
    parts = re.split(r"(?m)^# configuration file (.+):\s*$", dump)
    candidates = []
    for filename, content in zip(parts[1::2], parts[2::2]):
        names = set()
        for value in re.findall(r"(?m)^\s*server_name\s+([^;]+);", content):
            names.update(value.split())
        if "gocoaching.in" in names and re.search(
            r"(?m)^\s*add_header\s+Permissions-Policy\s", content
        ):
            if not names.issubset({"gocoaching.in", "www.gocoaching.in"}):
                raise RuntimeError("Site config also serves unrelated domains; review it manually.")
            candidates.append(Path(filename).resolve())
    if len(set(candidates)) != 1:
        raise RuntimeError("Could not identify exactly one active GoCoaching policy config.")
    return candidates[0]


def command(*args):
    subprocess.run(args, check=True, capture_output=True, text=True)


def apply_policy(target, backup_root=Path("/var/backups/gyansetu-nginx")):
    original = target.read_bytes()
    policies = list(re.finditer(rb"(?m)^[ \t]*add_header[ \t]+Permissions-Policy[ \t]+[^\r\n]+", original))
    if len(policies) != 1 or policies[0].group().strip() not in {OLD.encode(), NEW.encode()}:
        raise RuntimeError("Unexpected Permissions-Policy configuration; no changes made.")
    if policies[0].group().strip() == NEW.encode():
        command("nginx", "-t")
        command("systemctl", "reload", "nginx")
        return "Geolocation policy is already correct; Nginx validated and reloaded."

    backup_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile(prefix="site-", suffix=".conf", dir=backup_root, delete=False) as file:
        backup = Path(file.name)
    shutil.copy2(target, backup)
    try:
        match = policies[0]
        target.write_bytes(original[:match.start()] + match.group().replace(OLD.encode(), NEW.encode(), 1) + original[match.end():])
        command("nginx", "-t")
        command("systemctl", "reload", "nginx")
    except (OSError, subprocess.CalledProcessError) as error:
        target.write_bytes(original)
        try:
            command("nginx", "-t")
            command("systemctl", "reload", "nginx")
        except (OSError, subprocess.CalledProcessError) as rollback_error:
            raise RuntimeError(f"Nginx needs operator attention. Previous config: {backup}") from rollback_error
        raise RuntimeError(f"Policy update failed; previous config restored. Backup: {backup}") from error
    return f"Geolocation enabled for this site. Camera/microphone remain blocked. Backup: {backup}"


if __name__ == "__main__":
    if os.name != "posix" or os.geteuid() != 0:
        raise SystemExit("Run on the droplet with sudo python3 scripts/enable-geolocation.py")
    try:
        configuration = subprocess.run(
            ["nginx", "-T"], check=True, capture_output=True, text=True
        ).stdout
        print(apply_policy(site_config(configuration)))
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error
