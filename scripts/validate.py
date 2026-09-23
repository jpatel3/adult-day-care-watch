#!/usr/bin/env python3
"""Validate a state's data folder against the Adult Day Care Watch data contract.

Usage:
    python3 scripts/validate.py                # validate every folder under states/ except _template
    python3 scripts/validate.py --state nj     # validate one state

Exit status 0 when every checked state is valid, 1 otherwise. One error per line.
The contract is documented in methodology.md and states/_template/HOWTO.md.
"""
import argparse
import csv
import datetime
import json
import sys
from pathlib import Path

PROVIDER_REQUIRED = [
    "license_no", "licensed_name", "dba_alpha_name", "address", "city", "zip", "county",
    "phone", "email", "license_expires", "licensed_slots", "administrator", "licensed_owner",
    "owner_type", "lat", "lng",
]
NPI_REQUIRED = [
    "npi", "name", "status", "enumerated", "official", "official_title", "address",
    "city", "zip", "phone", "primary_adc", "n_locations",
]
ENFORCEMENT_REQUIRED = [
    "date", "provider", "agency", "action", "amount", "issues", "url", "matched_license_no",
]
CONFIG_REQUIRED = ["id", "name", "data_as_of", "map_center", "map_zoom", "per_diem", "spending", "sources"]


def _is_iso_date(s):
    try:
        datetime.date.fromisoformat(s)
        return True
    except (TypeError, ValueError):
        return False


def _is_number(s):
    try:
        float(s)
        return True
    except (TypeError, ValueError):
        return False


def _read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return reader.fieldnames or [], list(reader)


def _check_columns(name, fieldnames, required, errors):
    for col in required:
        if col not in fieldnames:
            errors.append(f"{name}: missing required column {col}")


def _coords(row):
    """Return (lat, lng) floats or None when the row has no usable coordinates."""
    lat, lng = (row.get("lat") or "").strip(), (row.get("lng") or "").strip()
    if not lat or not lng or not _is_number(lat) or not _is_number(lng):
        return None
    lat, lng = float(lat), float(lng)
    if lat == 0 or lng == 0:
        return None
    return lat, lng


def validate_config(state_dir, errors):
    path = state_dir / "config.json"
    if not path.exists():
        errors.append("config.json: missing")
        return None
    try:
        cfg = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        errors.append(f"config.json: invalid JSON ({e})")
        return None
    for key in CONFIG_REQUIRED:
        if key not in cfg:
            errors.append(f"config.json: missing key {key}")
    if cfg.get("id") != state_dir.name:
        errors.append(f"config.json id must equal folder name {state_dir.name}")
    if "data_as_of" in cfg and not _is_iso_date(cfg["data_as_of"]):
        errors.append("config.json data_as_of must be YYYY-MM-DD")
    years = [s.get("year") for s in cfg.get("spending", [])]
    if years != sorted(years):
        errors.append("config.json spending years must be ascending")
    for i, s in enumerate(cfg.get("spending", [])):
        for k in ("paid", "recipients"):
            if not _is_number(s.get(k)):
                errors.append(f"config.json spending[{i}].{k} must be a number")
        if not str(s.get("source", "")).startswith("https://"):
            errors.append(f"config.json spending[{i}].source must start with https://")
    for i, p in enumerate(cfg.get("per_diem", [])):
        if not _is_iso_date(p.get("effective", "")):
            errors.append(f"config.json per_diem[{i}].effective must be YYYY-MM-DD")
        if not _is_number(p.get("rate")):
            errors.append(f"config.json per_diem[{i}].rate must be a number")
    for i, s in enumerate(cfg.get("sources", [])):
        if not str(s.get("url", "")).startswith("https://"):
            errors.append(f"config.json sources[{i}].url must start with https://")
        local = s.get("local")
        if local and not (state_dir / local).exists():
            errors.append(f"config.json sources[{i}].local file not found: {local}")
    bbox = cfg.get("bbox")
    if bbox is not None and (len(bbox) != 4 or not all(_is_number(b) for b in bbox)):
        errors.append("config.json bbox must be [min_lat, min_lng, max_lat, max_lng]")
    return cfg


def validate_providers(state_dir, cfg, errors):
    path = state_dir / "providers.csv"
    if not path.exists():
        errors.append("providers.csv: missing")
        return
    fields, rows = _read_csv(path)
    _check_columns("providers.csv", fields, PROVIDER_REQUIRED, errors)
    bbox = (cfg or {}).get("bbox")
    for i, row in enumerate(rows, start=2):
        slots = (row.get("licensed_slots") or "").strip()
        if slots and not slots.isdigit():
            errors.append(f"providers.csv row {i}: licensed_slots must be an integer or blank")
        exp = (row.get("license_expires") or "").strip()
        if exp and not _is_iso_date(exp):
            errors.append(f"providers.csv row {i}: bad date in license_expires ({exp})")
        if not (row.get("licensed_name") or "").strip():
            errors.append(f"providers.csv row {i}: licensed_name is blank")
        c = _coords(row)
        if c and bbox and len(bbox) == 4:
            lat, lng = c
            if not (bbox[0] <= lat <= bbox[2] and bbox[1] <= lng <= bbox[3]):
                errors.append(f"providers.csv row {i}: lat/lng outside bbox")


def validate_npi(state_dir, errors):
    path = state_dir / "npi_registry.csv"
    if not path.exists():
        errors.append("npi_registry.csv: missing")
        return
    fields, rows = _read_csv(path)
    _check_columns("npi_registry.csv", fields, NPI_REQUIRED, errors)
    for i, row in enumerate(rows, start=2):
        npi = (row.get("npi") or "").strip()
        if not (npi.isdigit() and len(npi) == 10):
            errors.append(f"npi_registry.csv row {i}: npi must be 10 digits")


def validate_enforcement(state_dir, errors):
    path = state_dir / "enforcement.csv"
    if not path.exists():
        errors.append("enforcement.csv: missing")
        return
    fields, rows = _read_csv(path)
    _check_columns("enforcement.csv", fields, ENFORCEMENT_REQUIRED, errors)
    for i, row in enumerate(rows, start=2):
        if not _is_iso_date(row.get("date", "")):
            errors.append(f"enforcement.csv row {i}: bad date ({row.get('date')})")
        amt = (row.get("amount") or "").strip()
        if amt and not _is_number(amt):
            errors.append(f"enforcement.csv row {i}: amount must be a number or blank")
        if not str(row.get("url", "")).startswith("https://"):
            errors.append(f"enforcement.csv row {i}: url must start with https://")


def validate_state(state_dir):
    """Return a list of error strings for one state folder. Empty list means valid."""
    state_dir = Path(state_dir)
    errors = []
    cfg = validate_config(state_dir, errors)
    validate_providers(state_dir, cfg, errors)
    validate_npi(state_dir, errors)
    validate_enforcement(state_dir, errors)
    return errors


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--state", help="state id (folder under states/); default: all")
    ap.add_argument("--root", default=Path(__file__).resolve().parents[1], type=Path)
    args = ap.parse_args(argv)
    states_dir = args.root / "states"
    if args.state:
        targets = [states_dir / args.state]
    else:
        targets = sorted(p for p in states_dir.iterdir() if p.is_dir() and not p.name.startswith("_"))
    failed = False
    for t in targets:
        errs = validate_state(t)
        if errs:
            failed = True
            for e in errs:
                print(f"{t.name}: {e}")
        else:
            print(f"{t.name}: OK")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
