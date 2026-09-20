# Adult Day Care Watch: design

Date: 2026-09-19. Status: approved in conversation; this file records the design.

## Purpose

A forkable, no-build static site that publishes public data about Medicaid-funded adult day care in a US state: statewide money, a full licensed-provider list with owners and contacts, enforcement history, and computed "worth a look" flags. New Jersey is the first state. The repo is organized so a contributor can add their state by filling one folder.

Hosted on GitHub Pages from `jpatel3/adult-day-care-watch`, public.

## Non-goals

- No build step, no framework, no server, no database.
- No accusations. Flags are descriptive facts computed from public columns.
- No personal data beyond what the state itself publishes about licensees and what the federal NPI registry publishes about authorized officials.
- No pivot/query workbench (option rejected in brainstorming).

## Repo layout

```
adult-day-care-watch/
  index.html              viewer shell: tabs, containers, script tags
  app.js                  ES module: load state, compute flags, render tabs
  styles.css              light/dark via prefers-color-scheme tokens
  states/index.json       [{ "id": "nj", "name": "New Jersey" }]
  states/nj/config.json   narrative + statewide numbers + sources
  states/nj/providers.csv 168 licensed facilities
  states/nj/npi_registry.csv 444 NPPES organizations
  states/nj/enforcement.csv  OSC actions + DOH cease-and-desists
  states/nj/sources/      primary PDFs
  states/_template/       config.json skeleton, CSV header-only files, HOWTO.md
  scripts/fetch_nppes.py  NPPES API -> npi_registry.csv for a state
  scripts/nj_doh_to_csv.py DOH All_LTC.xlsx -> providers.csv
  scripts/fetch_nj_osc.py data.nj.gov settlements -> enforcement rows
  scripts/validate.py     data contract checker (runs in CI)
  .github/workflows/validate.yml
  README.md CONTRIBUTING.md LICENSE (MIT code) LICENSE-DATA (CC0)
  docs/superpowers/specs/, docs/superpowers/plans/
```

## Data contract

### `config.json`

```json
{
  "id": "nj",
  "name": "New Jersey",
  "program_name": "Adult Day Health Services (Adult Medical Day Care)",
  "regulator": "NJ Department of Health",
  "data_as_of": "2026-09-14",
  "map_center": [40.15, -74.5], "map_zoom": 8,
  "per_diem": [{"effective": "2008-01-01", "rate": 85.88, "source": "url"}, ...],
  "spending": [{"year": 2019, "paid": 294014284.97, "recipients": 23393, "partial": false, "source": "url"}, ...],
  "payers": [{"name": "Fidelis Care", "paid": 708983378, "window": "2019-2024/09", "source": "url"}, ...],
  "headline": {"licenses_note": "...", ...},
  "narrative": {"how_paid": "markdown", "what_not_public": "markdown", "assessment": "markdown"},
  "sources": [{"title": "...", "url": "...", "local": "sources/x.pdf"}]
}
```

All monetary fields are numbers in dollars. `spending[].partial` marks a year that is not complete; charts render it hatched and exclude it from per-recipient math.

### `providers.csv` (required columns)

`license_no, licensed_name, dba_alpha_name, address, city, zip, county, phone, email, license_expires (YYYY-MM-DD or blank), licensed_slots (int or blank), administrator, licensed_owner, owner_type, lat, lng`

Optional columns are shown in the detail drawer in file order. NJ adds `facility_type, fax, owner_address, owner_city_state_zip, npi_matches, npi_authorized_official`.

### `npi_registry.csv`

`npi, name, status, enumerated, official, official_title, address, city, zip, phone, primary_adc, n_locations`

### `enforcement.csv`

`date (YYYY-MM-DD), provider, agency, action, amount (number or blank), issues, url, matched_license_no (blank if unmatched)`

`matched_license_no` is filled by hand or by the state's script; the viewer also does a fuzzy name match at runtime as a fallback and labels it "name match".

## Flags

One pure function `computeFlags(provider, ctx)` in `app.js` returns an array of `{code, label, detail}`. Codes:

| code | rule |
|---|---|
| `no_npi` | `npi_matches` empty after address match |
| `enforcement` | a row in enforcement.csv matches by `matched_license_no` or normalized-name match |
| `multi_license` | `licensed_owner` (normalized) appears on more than one provider row |
| `large` | `licensed_slots` in top decile for the state |
| `license_lapsed` | `license_expires` in the past or within 90 days of `data_as_of` |

A separate list, "NPI records with no license," is `npi_registry` rows whose address does not match any provider. Shown on the Providers tab under its own heading with an explanation of why the gap exists (social day cares, closed centers, duplicates).

UI copy for every flag begins "Worth a look:" and the Methodology tab explains each rule in one sentence.

## Site sections

Single page, five tabs, state picker in the header (hidden when only one state). URL state: `?state=nj&tab=providers&q=...&county=...`.

1. **Overview**: tiles (licenses, licensed slots, latest complete-year spend, recipients, current per diem, implied billed days per recipient). Charts: spending + recipients by year (bars + line, partial year hatched), implied billed days per recipient, per-diem rate step chart, payer share bar. Narrative sections from config rendered as markdown.
2. **Providers**: controls (search, county, owner type, flag multi-select, sort). Count line. Leaflet map with clustered markers synced to filter. Table with name, city, county, slots, owner, owner type, flags. Row click opens a detail drawer with every column and matched enforcement rows. "Download filtered CSV" button (blob download is fine on Pages; not in a claude.ai artifact).
3. **Enforcement**: vertical timeline grouped by year, each item links to the PDF; table view toggle; total by action type.
4. **Methodology & sources**: column dictionary, flag rules, what is not public, how to OPRA, source list from config.
5. **Add your state**: renders `states/_template/HOWTO.md`.

## Visual design

Load the `dataviz` skill before writing chart code. Chart.js 4 and Leaflet 1.9 from cdnjs, PapaParse for CSV, marked for markdown. One categorical palette from the skill's placeholder set; sequential for slots on the map. Light/dark via `prefers-color-scheme` tokens on `:root`. Responsive: table becomes stacked cards under 700px. Body side gutter 16px minimum.

## Scripts

Python 3 standard library plus `openpyxl` (only for the NJ DOH script). Each script has a `--state` argument and writes into `states/<id>/`. `validate.py` exits non-zero on: missing required columns, bad dates, non-numeric numbers, lat/lng outside the state bounding box when present, source URLs not `https://`, config years not ascending. CI runs `validate.py` on push and PR.

## Testing

- `scripts/validate.py` on NJ data passes.
- Headless smoke test (`scripts/smoke_test.mjs`, Node built-in `node:test` + Playwright if available, else skipped): load `index.html` over a local static server, assert Providers row count equals CSV rows, assert each tab renders without console errors.
- Manual check in a real browser with a screenshot at desktop and 400px widths before declaring done.
- After deploy, `curl` the Pages URL and the three CSVs.

## Contributor guide

`CONTRIBUTING.md`: purpose and ground rules (public sources only, cite everything, flags are not accusations, no personal data beyond official rosters), how to add a state (pointer to HOWTO), how to propose a flag or chart, PR review checklist, code of conduct line, not legal advice.

`states/_template/HOWTO.md`: step-by-step for a new state: where to find the licensing roster, the Medicaid per diem, statewide spending (budget notices, Comptroller/Auditor, HHS OIG state audits at oig.hhs.gov), enforcement (Comptroller, AG Medicaid Fraud Control Unit, licensing agency), how to run `fetch_nppes.py`, how to fill `config.json`, an OPRA/FOIA template letter for per-provider payments, and how to test locally (`python3 -m http.server`).

## Deploy

Create repo with `gh repo create jpatel3/adult-day-care-watch --public`, push `main`, enable Pages (source: `main`, path `/`) via `gh api`, wait for the build, verify with curl. Site URL: `https://jpatel3.github.io/adult-day-care-watch/`.

## Licensing

Code MIT. Data CC0 with the note that underlying records are public records of their agencies.
