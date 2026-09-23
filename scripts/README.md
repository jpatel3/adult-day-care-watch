# Scripts

All scripts are Python 3.9+ standard library unless noted. Run them from the repo root.

| Script | What it does |
|---|---|
| `validate.py` | Checks a state folder against the data contract. Runs in CI. `python3 scripts/validate.py --state nj` |
| `fetch_nppes.py` | Pulls organizations with the Adult Day Care taxonomy (261QA0600X) for a state from the federal NPI registry into `npi_registry.csv`. Works for any state. |
| `nj_doh_to_csv.py` | New Jersey only. Converts the Department of Health roster spreadsheet into `providers.csv` and adds NPI matches by address. Needs `pip install openpyxl`. Copy and adapt for your state's roster format. |
| `fetch_nj_osc.py` | New Jersey only. Pulls adult-day-care rows from the Comptroller's settlements dataset on data.nj.gov, downloads the PDFs, and extracts amounts and violation keywords (needs `pdftotext` from poppler for extraction; works without it, leaving those columns blank). |
| `smoke_test.mjs` | Loads the site in headless Chrome and checks every tab renders and the provider table matches the CSV. `npm test`. |
| `tests/` | Unit tests for the validator (`python3 -m unittest discover -s scripts/tests`) and the flag logic (`node --test scripts/tests/`). |

## Rebuild New Jersey end to end

```bash
python3 scripts/fetch_nppes.py --state NJ --out states/nj/npi_registry.csv
curl -sL -A "Mozilla/5.0" https://healthapps.nj.gov/facilities/documents2/All_LTC.xlsx -o /tmp/All_LTC.xlsx
python3 scripts/nj_doh_to_csv.py --xlsx /tmp/All_LTC.xlsx --npi states/nj/npi_registry.csv --out states/nj/providers.csv
python3 scripts/fetch_nj_osc.py --out /tmp/enforcement_osc.csv   # merge into states/nj/enforcement.csv by hand
python3 scripts/validate.py --state nj
```

Update `data_as_of` in `states/nj/config.json` to the roster's run date after a refresh.
Check `providers.csv` for coordinates the source geocoded wrong (the validator flags anything outside `bbox`); blank them rather than guess.
