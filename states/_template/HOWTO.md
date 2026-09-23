# Add your state

You need three CSV files and one JSON file in a folder named with your state's two-letter code, lower case. New Jersey (`states/nj/`) is the worked example; copy its files and replace the contents. Plan on a weekend of work for the first pass.

## 1. Find the licensing roster

Search for: `"adult day health" licensed facilities <state> department of health`, `adult day care license lookup <state>`, `adult day services provider directory <state> aging`. Most states license medical adult day care through the health department or the aging/long-term-care agency and publish a roster, sometimes as a downloadable spreadsheet, sometimes only as a search page. If only a search page exists, search by county and paste results into a spreadsheet, or ask the agency for the export under your public records law (they usually have one).

You want, per license: license number, name, address, phone, expiry, licensed capacity, administrator, and the owner entity. Note the roster's run date; it becomes `data_as_of`.

## 2. Find the Medicaid per diem

Look for the state Medicaid fee schedule, state plan amendments on medicaid.gov (search "adult day health" and your state), budget notices, and managed care organization provider bulletins. Record every rate change you can find with its effective date and a URL.

## 3. Find statewide spending and recipients

Best sources, in order: your state Comptroller, Auditor or Inspector General reports on adult day care; HHS Office of Inspector General state audits at oig.hhs.gov/reports (search "adult day" and the state); Medicaid managed long-term care annual reports; legislative budget testimony from the adult day services trade association; CMS T-MSIS data if you can work with it. Enter one row per calendar year. Mark incomplete years `"partial": true`.

## 4. Pull the NPI registry

```bash
python3 scripts/fetch_nppes.py --state XX --out states/xx/npi_registry.csv
```

## 5. Build providers.csv

Map the roster's columns onto the contract. Required columns, with the New Jersey value for one row as an example:

| Column | Example |
|---|---|
| license_no | `02019` |
| licensed_name | `PEACEFUL ADULT DAY CARE CENTER (NJ02019)` |
| dba_alpha_name | `Jay Shree Krishna Little Ferry LLC` |
| address | `26 WASHINGTON AVE` |
| city | `LITTLE FERRY` |
| zip | `07643` |
| county | `BERGEN` |
| phone | `(201) 641-4444` |
| email | `info@example.com` (leave blank if the agency does not publish one) |
| license_expires | `2027-03-31` |
| licensed_slots | `210` |
| administrator | `Ms Jane Doe` |
| licensed_owner | `Jay Shree Krishna Little Ferry Llc` |
| owner_type | `PROFIT - LLC` |
| lat, lng | `40.85`, `-74.04` (blank if unknown) |

Optional but recommended: `npi_matches` and `npi_authorized_official` (see `scripts/nj_doh_to_csv.py` for an address-matching example you can adapt).

## 6. Build enforcement.csv

Sources: state Comptroller or Medicaid Inspector General settlement lists, the Attorney General's Medicaid Fraud Control Unit press releases, the licensing agency's enforcement page, US Department of Justice press releases for your district, HHS OIG exclusion list. One row per document:

`date,provider,agency,action,amount,issues,url,matched_license_no`

Fill `matched_license_no` only when you are sure it is the same entity. Leave it blank otherwise; the viewer will show a "name match" label when names line up.

## 7. Fill config.json

Copy `states/_template/config.json`. Every field is explained inline. Write the four narrative sections in plain language from your sources. Cite a URL for every number. Do not speculate.

## 8. Validate and preview

```bash
python3 scripts/validate.py --state xx
python3 -m http.server 8000
# open http://localhost:8000/?state=xx
```

Fix everything the validator reports. Look at every tab at desktop and phone width.

## 9. Publish

Add `{ "id": "xx", "name": "Your State" }` to `states/index.json`, commit, and open a pull request. The review checklist is in CONTRIBUTING.md. If you would rather run your own site, fork the repo and turn on GitHub Pages (Settings, Pages, branch `main`, folder `/`); no build step is needed.

## Public records request template

> Under [state public records law], I request the following records from [Medicaid agency] for calendar years 20XX through 20XX: for procedure code S5102 (adult day health services per diem) and any other codes used to pay for adult day health or adult medical day care, the total paid units and total paid dollars by billing provider NPI and by calendar year, for both fee-for-service claims and managed care encounter data. I request the data in CSV or Excel format. Provider-level payment totals are not protected health information and do not identify any beneficiary. If any portion is withheld, please identify the specific exemption and release the remainder.

Also consider requesting: the licensing agency's routine survey reports and complaint logs for adult day health facilities, and the Medicaid Disclosure of Ownership and Control Interest statements for each enrolled adult day health provider.
