#!/usr/bin/env python3
"""Pull every organization in the federal NPI registry with the Adult Day Care taxonomy for one state.

Usage:
    python3 scripts/fetch_nppes.py --state NJ --out states/nj/npi_registry.csv

Reads the public NPPES API (https://npiregistry.cms.hhs.gov/api/), no key needed.
Keeps records carrying taxonomy code 261QA0600X (Adult Day Care clinic/center).
Writes the npi_registry.csv contract columns:
    npi, name, status, enumerated, official, official_title, address, city, zip, phone,
    primary_adc, n_locations
The API caps paging at skip=1000, so at most 1200 records per query. If your state
returns 1200, split the query by city with --city and merge.
"""
import argparse
import csv
import json
import sys
import urllib.parse
import urllib.request

API = "https://npiregistry.cms.hhs.gov/api/"
TAXONOMY = "261QA0600X"
COLUMNS = ["npi", "name", "status", "enumerated", "official", "official_title", "address",
           "city", "zip", "phone", "primary_adc", "n_locations"]


def fetch_page(state, skip, city=None):
    params = {"version": "2.1", "taxonomy_description": "Adult Day Care", "state": state,
              "limit": 200, "skip": skip}
    if city:
        params["city"] = city
    with urllib.request.urlopen(API + "?" + urllib.parse.urlencode(params), timeout=60) as r:
        return json.load(r).get("results", [])


def to_row(rec):
    basic = rec.get("basic", {})
    loc = next((a for a in rec.get("addresses", []) if a.get("address_purpose") == "LOCATION"),
               rec.get("addresses", [{}])[0])
    name = basic.get("organization_name") or f"{basic.get('first_name', '')} {basic.get('last_name', '')}".strip()
    return {
        "npi": rec["number"],
        "name": name,
        "status": basic.get("status", ""),
        "enumerated": basic.get("enumeration_date", ""),
        "official": f"{basic.get('authorized_official_first_name', '')} {basic.get('authorized_official_last_name', '')}".strip(),
        "official_title": basic.get("authorized_official_title_or_position", ""),
        "address": loc.get("address_1", ""),
        "city": loc.get("city", ""),
        "zip": (loc.get("postal_code") or "")[:5],
        "phone": loc.get("telephone_number", ""),
        "primary_adc": any(t.get("code") == TAXONOMY and t.get("primary") for t in rec.get("taxonomies", [])),
        "n_locations": len(rec.get("practiceLocations", [])),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--state", required=True, help="two-letter state code, e.g. NJ")
    ap.add_argument("--out", required=True)
    ap.add_argument("--city", help="optional city filter to split large states")
    args = ap.parse_args(argv)

    rows = {}
    for skip in range(0, 1001, 200):
        page = fetch_page(args.state.upper(), skip, args.city)
        for rec in page:
            if any(t.get("code") == TAXONOMY for t in rec.get("taxonomies", [])):
                rows[rec["number"]] = to_row(rec)
        if len(page) < 200:
            break
    else:
        print("warning: hit the API paging cap; results may be incomplete. Split with --city.", file=sys.stderr)

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        for r in sorted(rows.values(), key=lambda r: r["name"]):
            w.writerow(r)
    print(f"wrote {len(rows)} records to {args.out}")


if __name__ == "__main__":
    main()
