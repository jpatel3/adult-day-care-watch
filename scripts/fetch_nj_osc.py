#!/usr/bin/env python3
"""Pull adult-day-care actions from the NJ Comptroller's Medicaid settlements dataset.

Usage:
    python3 scripts/fetch_nj_osc.py --out /tmp/enforcement_osc.csv

Reads data.nj.gov dataset 3rh3-3u9n (Medicaid Fraud Settlements and Notices), keeps
rows whose provider name mentions adult/day care/day health, downloads each PDF, and
extracts the largest dollar figure plus violation keywords when `pdftotext` (poppler)
is installed. Writes enforcement.csv contract columns with agency filled in and
matched_license_no blank (fill it by hand or with the viewer's name match).

Merge the output into states/nj/enforcement.csv along with Department of Health
enforcement actions, which are not in this dataset.
"""
import argparse
import csv
import json
import re
import shutil
import subprocess
import tempfile
import urllib.request

DATASET = "https://data.nj.gov/resource/3rh3-3u9n.json?$limit=5000"
AGENCY = "NJ Office of the State Comptroller, Medicaid Fraud Division"
COLUMNS = ["date", "provider", "agency", "action", "amount", "issues", "url", "matched_license_no"]
ISSUE_PATTERNS = [
    (r"five days|5 days|more than five|in excess of five", ">5 days/wk"),
    (r"inpatient|hospital", "billed while inpatient"),
    (r"duplicat|same day|another AMDC|another adult", "duplicate w/ other AMDC"),
    (r"excluded|exclusion", "excluded person"),
    (r"attendance|sign-in|sign in", "attendance docs"),
    (r"ineligib|clinical eligib|medical necessity", "eligibility"),
    (r"transport", "transportation"),
    (r"kickback|inducement|remuneration", "kickbacks/inducements"),
    (r"unlicensed|license", "licensure"),
]


def pdf_text(url, tmpdir):
    if not shutil.which("pdftotext"):
        return ""
    path = f"{tmpdir}/doc.pdf"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
        return subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True).stdout
    except Exception:
        return ""


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)

    with urllib.request.urlopen(DATASET, timeout=60) as r:
        data = json.load(r)
    adult = re.compile(r"adult|day care|daycare|day health|AMDC|ADHC", re.I)
    exclude = re.compile(r"child|pediatric|learning", re.I)
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        for rec in data:
            blob = json.dumps(rec)
            if not adult.search(blob) or exclude.search(blob):
                continue
            name = rec["provider_name"]["description"]
            url = rec["provider_name"]["url"].replace("http://", "https://")
            m, d, y = rec["date"].split("/")
            text = pdf_text(url, tmp)
            amounts = [float(a.replace(",", "")) for a in re.findall(r"\$\s?([\d,]{5,}(?:\.\d\d)?)", text)]
            issues = [label for pat, label in ISSUE_PATTERNS if re.search(pat, text, re.I)]
            out.append({"date": f"{y}-{int(m):02d}-{int(d):02d}", "provider": name, "agency": AGENCY,
                        "action": rec["action"], "amount": max(amounts) if amounts else "",
                        "issues": ", ".join(issues), "url": url, "matched_license_no": ""})
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(sorted(out, key=lambda r: r["date"]))
    print(f"wrote {len(out)} actions to {args.out}")


if __name__ == "__main__":
    main()
