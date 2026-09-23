#!/usr/bin/env python3
"""Convert the NJ Department of Health long-term-care roster into providers.csv.

Usage:
    curl -sL -A "Mozilla/5.0" https://healthapps.nj.gov/facilities/documents2/All_LTC.xlsx -o /tmp/All_LTC.xlsx
    python3 scripts/nj_doh_to_csv.py --xlsx /tmp/All_LTC.xlsx --npi states/nj/npi_registry.csv --out states/nj/providers.csv

Keeps rows whose FACILITY_TYPE contains "ADULT DAY HEALTH" (freestanding, in a nursing
facility, hospital based, in an assisted living residence). Maps DOH columns to the
providers.csv contract and adds NPI matches by normalized street address + ZIP.
Requires: pip install openpyxl

This script is New Jersey specific. Copy it and change the column mapping for your state.
"""
import argparse
import csv
import re
from collections import defaultdict

import openpyxl

COLUMNS = ["license_no", "facility_type", "licensed_name", "dba_alpha_name", "address", "city", "zip",
           "county", "phone", "fax", "email", "license_expires", "licensed_slots", "administrator",
           "licensed_owner", "owner_address", "owner_city_state_zip", "owner_type", "npi_matches",
           "npi_authorized_official", "lat", "lng"]


def norm_addr(s):
    s = (s or "").upper().split("\n")[0]
    s = re.sub(r"\b(SUITE|STE|UNIT|FL|FLOOR|#).*", "", s)
    return re.sub(r"[^A-Z0-9]", "", s)


def clean(v):
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s in ("(blank)", "0", "None") else s


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--xlsx", required=True)
    ap.add_argument("--npi", required=True, help="npi_registry.csv produced by fetch_nppes.py")
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)

    by_addr = defaultdict(list)
    for n in csv.DictReader(open(args.npi, newline="", encoding="utf-8")):
        by_addr[(norm_addr(n["address"]), n["zip"][:5])].append(n)

    ws = openpyxl.load_workbook(args.xlsx, read_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(h) for h in rows[0]]
    out = []
    for raw in rows[1:]:
        r = dict(zip(hdr, raw))
        if not r.get("FACILITY_TYPE") or "ADULT DAY HEALTH" not in str(r["FACILITY_TYPE"]):
            continue
        zip5 = str(r.get("ZIP") or "")[:5]
        matches = by_addr.get((norm_addr(r.get("ADDRESS")), zip5), [])
        lat, lng = clean(r.get("LAT")), clean(r.get("LNG"))
        out.append({
            "license_no": clean(r.get("LIC#")),
            "facility_type": clean(r.get("FACILITY_TYPE")),
            "licensed_name": clean(r.get("LICENSED_NAME")),
            "dba_alpha_name": clean(r.get("ALPHA_NAME")),
            "address": (r.get("ADDRESS") or "").split("\n")[0].strip(),
            "city": clean(r.get("FAC_CITY")),
            "zip": zip5,
            "county": clean(r.get("COUNTY")),
            "phone": clean(r.get("TELEPHONE")),
            "fax": clean(r.get("FAXPHONE")),
            "email": clean(r.get("FACEMAIL")),
            "license_expires": str(r.get("Lic_Expires"))[:10] if r.get("Lic_Expires") else "",
            "licensed_slots": clean(r.get("Lic_Beds_Slots")),
            "administrator": clean(r.get("ADMIN")),
            "licensed_owner": clean(r.get("LICENSED_OWNER")),
            "owner_address": clean(r.get("OWNADDR")),
            "owner_city_state_zip": clean(r.get("OWNCSZ")),
            "owner_type": clean(r.get("OWNDESC")),
            "npi_matches": ";".join(n["npi"] for n in matches),
            "npi_authorized_official": ";".join(f"{n['official']} ({n['official_title']})" for n in matches),
            "lat": lat, "lng": lng,
        })

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        for o in sorted(out, key=lambda o: (o["county"], o["licensed_name"])):
            w.writerow(o)
    print(f"wrote {len(out)} facilities to {args.out}; {sum(1 for o in out if o['npi_matches'])} matched an NPI")


if __name__ == "__main__":
    main()
