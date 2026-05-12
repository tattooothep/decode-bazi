#!/usr/bin/env python3
"""Targeted scanner for hardcoded interpretation-style text.

This intentionally avoids blocking generic UI labels. It focuses on string
literals near narrative/advice/warning/fortune/verdict/interpretation fields.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path


ROOT = Path("/root/decode-app")
SRC = ROOT / "src"
OUT_DIR = ROOT / "data/i18n"
STRING_RE = re.compile(r"['\"`]([^'\"`\n]*[A-Za-z\u0E00-\u0E7F\u4E00-\u9FFF][^'\"`\n]*)['\"`]")
CONTEXT_RE = re.compile(
    r"(narrative|advice|warning|fortune|verdict|interpretation|label|labelEn|labelTh|warnings|bonuses)",
    re.IGNORECASE,
)
ALLOW_RE = re.compile(r"(error|debug|status|type|name|branch|stem|element|formula|version|code)", re.IGNORECASE)
CODE_LITERAL_RE = re.compile(r"^[A-Za-z0-9_:.@§-]+$")


def iter_files(target: str | None) -> list[Path]:
    if target:
        path = (ROOT / target).resolve() if not Path(target).is_absolute() else Path(target)
        return [path]
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [d for d in dirnames if d not in {"node_modules", ".next", "dist", "build", "coverage"}]
        for filename in filenames:
            if filename.endswith((".ts", ".tsx", ".js", ".jsx")):
                files.append(Path(dirpath) / filename)
    return files


def scan_file(path: Path) -> list[dict[str, str | int]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []

    records: list[dict[str, str | int]] = []
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("//") or stripped.startswith("*"):
            continue
        if not CONTEXT_RE.search(line):
            continue
        if ALLOW_RE.search(line) and not re.search(r"advice|warning|fortune|verdict|interpretation|narrative", line, re.I):
            continue
        for match in STRING_RE.findall(line):
            text = match.strip()
            if len(text) < 4:
                continue
            if CODE_LITERAL_RE.match(text):
                continue
            if text.startswith("daily_verdict_"):
                continue
            if re.fullmatch(r"[\u4E00-\u9FFF_]+", text) and len(text) <= 6:
                continue
            records.append(
                {
                    "file": str(path.relative_to(ROOT)),
                    "line": idx,
                    "text": text[:200],
                    "status": "BLOCK",
                    "action": "return code and resolve text through i18n",
                }
            )
    return records


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", help="Scan one file relative to repo root")
    parser.add_argument("--fail-on-block", action="store_true")
    parser.add_argument("--no-write", action="store_true")
    args = parser.parse_args()

    records: list[dict[str, str | int]] = []
    files = iter_files(args.target)
    for path in files:
        records.extend(scan_file(path))

    if not args.no_write:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        csv_path = OUT_DIR / "hardcoded-text-scan.csv"
        with csv_path.open("w", encoding="utf-8-sig", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=["status", "file", "line", "text", "action"])
            writer.writeheader()
            writer.writerows(records)
        json_path = OUT_DIR / "dev-fix-tickets.json"
        json_path.write_text(
            json.dumps(
                {
                    "_meta": {
                        "scanned_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                        "files_scanned": len(files),
                        "blocked": len(records),
                    },
                    "tickets": records,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    print(f"scanned={len(files)} blocked={len(records)}")
    for record in records[:20]:
        print(f"{record['file']}:{record['line']} {record['text']}", file=sys.stderr)
    if args.fail_on_block and records:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
