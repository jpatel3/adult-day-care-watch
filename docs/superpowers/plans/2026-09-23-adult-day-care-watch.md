# Adult Day Care Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a forkable, no-build GitHub Pages site showing Medicaid adult day care money, the full licensed-provider list with owners, enforcement history, and "worth a look" flags, with New Jersey as the first state.

**Architecture:** Static `index.html` + one ES module `app.js` + `styles.css`. Each state is a folder `states/<id>/` holding `config.json` and three CSVs; `app.js` picks the state from `?state=`, parses CSVs with PapaParse, computes flags in one pure function, and renders five tabs (Chart.js charts, Leaflet map, HTML table). Python scripts regenerate NJ data and validate the contract; a GitHub Action runs the validator.

**Tech Stack:** HTML/CSS/ES modules; Chart.js 4.4.x, Leaflet 1.9.4, Leaflet.markercluster 1.5.3, PapaParse 5.4.x, marked 12.x from cdnjs; Python 3.9+ stdlib (+ openpyxl for the NJ DOH script); Node 20+ with Playwright (channel: chrome) for the smoke test; GitHub Pages from `main` root.

**Spec:** `docs/superpowers/specs/2026-09-19-adult-day-care-watch-design.md`

## Global Constraints

- No build step. Site must run from `python3 -m http.server` on the repo root and from GitHub Pages root.
- All third-party JS/CSS from `https://cdnjs.cloudflare.com/ajax/libs/...` pinned to exact versions.
- Flag UI copy begins "Worth a look:"; the words "fraud" and "fraudulent" never appear in generated flag or table text (they may appear in quoted narrative from `config.json`).
- Required CSV columns exactly as the spec's Data contract section; extra columns allowed.
- Dates in data files are `YYYY-MM-DD`; money fields are plain numbers.
- Chart colors: dataviz reference palette. Categorical slots in fixed order: `#2a78d6, #eb6834, #1baf7a, #eda100, #e87ba4` (light) / `#3987e5, #d95926, #199e70, #c98500, #d55181` (dark). Sequential (map): blue ramp `#cde2fb → #0d366b`. One axis per chart. Legend for >= 2 series. Every chart has a table twin (a `<details>` with a table).
- Light and dark themes via `prefers-color-scheme` with tokens on `:root`; body has explicit background.
- Body side gutter >= 16px at every width; table stacks to cards under 700px.
- Commit after every task. No `Co-Authored-By` trailers (user rule).

---

### Task 1: Scaffold repo, migrate NJ data into the contract

**Files:**
- Create: `states/index.json`, `states/nj/config.json`, `states/nj/providers.csv`, `states/nj/npi_registry.csv`, `states/nj/enforcement.csv`, `states/nj/sources/*.pdf`, `LICENSE`, `LICENSE-DATA`, `.gitignore`
- Source data: `/Users/jpatel/Development/open/nj-adult-day-care/data/*.csv`, `/Users/jpatel/Development/open/nj-adult-day-care/sources/**`

**Interfaces:**
- Produces: the three CSVs and `config.json` exactly as the spec's Data contract. `enforcement.csv` columns: `date,provider,agency,action,amount,issues,url,matched_license_no`.

- [ ] **Step 1: Copy sources and providers/NPI CSVs**

```bash
mkdir -p states/nj/sources
cp ../nj-adult-day-care/data/nj_adhs_licensed_facilities.csv states/nj/providers.csv
cp ../nj-adult-day-care/data/nj_adult_day_care_nppes.csv states/nj/npi_registry.csv
cp -R ../nj-adult-day-care/sources/* states/nj/sources/
```

- [ ] **Step 2: Build `enforcement.csv`** from the OSC CSV (24 rows, columns `date,provider,action,max_dollar_figure,issue_keywords,url,text_chars`) plus three DOH rows, converting `M/D/YYYY` to ISO and naming the agency:

```python
import csv, datetime
rows=[]
for r in csv.DictReader(open('../nj-adult-day-care/data/nj_osc_adult_day_care_settlements.csv')):
    m,d,y=r['date'].split('/'); rows.append(dict(date=f"{y}-{int(m):02d}-{int(d):02d}",provider=r['provider'],
      agency='NJ Office of the State Comptroller, Medicaid Fraud Division',action=r['action'],
      amount=r['max_dollar_figure'],issues=r['issue_keywords'],url=r['url'],matched_license_no=''))
rows += [
 dict(date='2025-06-18',provider='One Adult Day Care Center Corp (Little Ferry)',agency='NJ Department of Health',action='Cease and Desist Order (unlicensed operation)',amount='',issues='licensure',url='https://nj.gov/health/healthfacilities/surveys-insp/EA-One-Adult-Day-Care-Center-Corp-06182025.pdf',matched_license_no=''),
 dict(date='2025-06-26',provider='One Adult Day Care Center Corp (Little Ferry)',agency='NJ Department of Health',action='Information Requirement Order (participants moved to church)',amount='',issues='licensure, transportation',url='https://nj.gov/health/healthfacilities/surveys-insp/ea-one-adult-day-care-center-corp-06262025.pdf',matched_license_no=''),
 dict(date='2025-10-16',provider='Iselin Adult Day Care Center',agency='NJ Department of Health',action='Cease and Desist Order (unlicensed location)',amount='',issues='licensure',url='https://www.nj.gov/health/healthfacilities/surveys-insp/EA-Iselin-Adult-Day-Care-Center-10162025.pdf',matched_license_no='')]
w=csv.DictWriter(open('states/nj/enforcement.csv','w'),fieldnames=list(rows[0])); w.writeheader(); w.writerows(sorted(rows,key=lambda r:r['date']))
```

Then fill `matched_license_no` by hand for names that match a `providers.csv` row (Peaceful → NJ02019, Atmiya, Golden Path, Signature, Sunny Days → NJ12014, Just Home → 2CPTS8, Broadway → YT613N, Golden Years → NJ13001, Iselin → 12025, and any other exact/near match found by `grep -i` on `providers.csv`).

- [ ] **Step 3: Write `states/nj/config.json`** with the numbers from the research README (per_diem 5 rows, spending 6 rows with 2024 `partial: true`, payers 5 rows, narrative markdown for `how_paid`, `what_not_public`, `assessment`, sources list with local paths). Set `map_center: [40.15,-74.5]`, `map_zoom: 8`, `bbox: [38.9,-75.6,41.4,-73.9]`.

- [ ] **Step 4: Write `states/index.json`**: `[{"id":"nj","name":"New Jersey"}]`. Add MIT `LICENSE`, CC0 `LICENSE-DATA`, `.gitignore` (`node_modules/`, `.DS_Store`, `__pycache__/`).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add New Jersey data in the state data contract"
```

---

### Task 2: Data validator with tests, and CI

**Files:**
- Create: `scripts/validate.py`, `scripts/tests/test_validate.py`, `.github/workflows/validate.yml`

**Interfaces:**
- Produces: `python3 scripts/validate.py --state nj` exits 0 on success, prints one line per error and exits 1 otherwise. Function `validate_state(path: Path) -> list[str]` returns error strings (empty list = valid).

- [ ] **Step 1: Write failing tests** in `scripts/tests/test_validate.py` (stdlib `unittest`): a temp state dir with valid minimal files returns `[]`; missing `licensed_owner` column reports `providers.csv: missing required column licensed_owner`; a bad date `2025-13-40` in `enforcement.csv` reports `enforcement.csv row 2: bad date`; a non-https source URL reports `config.json sources[0].url must start with https://`; spending years not ascending reports `config.json spending years must be ascending`; a lat outside `bbox` reports `providers.csv row 2: lat/lng outside bbox`.

- [ ] **Step 2: Run** `python3 -m unittest scripts/tests/test_validate.py -v` → FAIL (module missing).

- [ ] **Step 3: Implement `scripts/validate.py`**: constants `PROVIDER_REQUIRED`, `NPI_REQUIRED`, `ENFORCEMENT_REQUIRED` from the spec; `validate_state(path)` checks file presence, required columns, date format (`datetime.date.fromisoformat`), numeric `licensed_slots`/`amount`/`lat`/`lng`, bbox when both `bbox` and lat/lng present, config `id` equals folder name, spending years ascending, all `sources[].url` https, `spending[].paid` and `recipients` numeric. `main()` parses `--state` (default: all folders in `states/` except `_template`).

- [ ] **Step 4: Run tests** → PASS. Run `python3 scripts/validate.py --state nj` → `nj: OK`. Fix any real data errors it finds (it will: blank `lat`/`lng` are `0`/blank for some rows; treat `0`, blank as "no coordinates" and skip bbox check for them).

- [ ] **Step 5: CI** `.github/workflows/validate.yml`: on push/PR, `actions/checkout@v4`, `actions/setup-python@v5` (3.12), run `python3 -m unittest discover -s scripts/tests` and `python3 scripts/validate.py`.

- [ ] **Step 6: Commit** `git commit -m "Add data contract validator with tests and CI"`

---

### Task 3: Data pipeline scripts

**Files:**
- Create: `scripts/fetch_nppes.py`, `scripts/nj_doh_to_csv.py`, `scripts/fetch_nj_osc.py`, `scripts/README.md`

**Interfaces:**
- `fetch_nppes.py --state NJ --out states/nj/npi_registry.csv` writes the NPI contract columns using the NPPES API (`taxonomy_description=Adult Day Care`, filter code `261QA0600X`, pages of 200, skip ≤ 1000).
- `nj_doh_to_csv.py --xlsx <All_LTC.xlsx> --npi states/nj/npi_registry.csv --out states/nj/providers.csv` filters `FACILITY_TYPE` containing `ADULT DAY HEALTH`, maps columns to the contract, address-matches NPIs.
- `fetch_nj_osc.py --out states/nj/enforcement_osc.csv` pulls `https://data.nj.gov/resource/3rh3-3u9n.json`, filters adult-day rows, downloads PDFs to a temp dir, extracts the max dollar figure and issue keywords with `pdftotext` if available (else leaves blank).

- [ ] **Step 1: Write the three scripts** (port the code used during research; each with `argparse`, a `main()`, and a module docstring explaining inputs/outputs). Stdlib only except `openpyxl` in the DOH script.
- [ ] **Step 2: Dry-run** `fetch_nppes.py --state NJ --out /tmp/x.csv` and diff row count against `states/nj/npi_registry.csv` (expect 444 ± a few new enumerations). Run `nj_doh_to_csv.py` against the saved xlsx and `diff` against `states/nj/providers.csv` (expect identical).
- [ ] **Step 3: `scripts/README.md`**: one paragraph per script, how to re-run the NJ pipeline end to end.
- [ ] **Step 4: Commit** `git commit -m "Add NJ data pipeline scripts"`

---

### Task 4: Viewer shell, state loading, tabs, smoke test

**Files:**
- Create: `index.html`, `styles.css`, `app.js`, `scripts/smoke_test.mjs`, `package.json` (devDependency `playwright`, script `"test": "node scripts/smoke_test.mjs"`)

**Interfaces:**
- Produces in `app.js`: `loadState(id) -> Promise<{config, providers, npi, enforcement}>` (PapaParse with `header:true, dynamicTyping:false, skipEmptyLines:true`); `getUrlState()`/`setUrlState(patch)` round-tripping `state, tab, q, county, owner_type, flags, sort`; `renderTab(name, data)` dispatching to `renderOverview`, `renderProviders`, `renderEnforcement`, `renderMethodology`, `renderHowto` (stubs that write the tab name for now); `computeFlags(provider, ctx) -> {code,label,detail}[]` (implemented in Task 6, exported here as a stub returning `[]`).
- `index.html` ids: `#state-picker`, `nav[role=tablist] button[data-tab]`, `section#tab-overview`, `#tab-providers`, `#tab-enforcement`, `#tab-methodology`, `#tab-howto`, `footer#data-as-of`.

- [ ] **Step 1: Write `scripts/smoke_test.mjs`**: start `python3 -m http.server 8765` as a child process, launch Playwright `chromium.launch({channel:'chrome', headless:true})`, collect `console.error` and `pageerror`, visit `http://localhost:8765/?state=nj`, wait for `#tab-overview [data-ready]`, then for each tab click the button and wait for `[data-ready]` inside it; on providers assert `document.querySelectorAll('#providers-table tbody tr').length` equals the CSV row count (read `states/nj/providers.csv` with `fs`, count lines minus header, ignoring quoted newlines by using a tiny CSV row counter that tracks quotes); assert zero console errors; exit 1 on failure.
- [ ] **Step 2: Run it** → FAIL (no index.html).
- [ ] **Step 3: Write `index.html`** with `<title>Adult Day Care Watch</title>`, header (title, state picker `<select>`, GitHub link), `<nav role="tablist">` with five buttons, five `<section role="tabpanel" hidden>`, footer with data-as-of and license line, cdnjs `<script>` tags (Chart.js `4.4.1/chart.umd.js`, PapaParse `5.4.1/papaparse.min.js`, Leaflet `1.9.4/leaflet.js` + css, markercluster `1.5.3/leaflet.markercluster.js` + two css, marked `12.0.0/marked.min.js`) before `<script type="module" src="app.js">`.
- [ ] **Step 4: Write `styles.css`**: tokens on `:root` (light) and under `@media (prefers-color-scheme: dark)`; body `background`, `padding-inline: 16px`, `max-width: 1200px` wrapper; tab button states; tiles grid; `.card`; table styles with `tabular-nums`; `@media (max-width: 700px)` card-stacking rule for `table.stack`.
- [ ] **Step 5: Write `app.js`**: `loadState`, url state helpers, state picker population from `states/index.json`, tab switching that sets `hidden`, `aria-selected`, url `tab`, and calls `renderTab` lazily once per tab; each stub sets `data-ready` on its section. Set the providers stub to render the table skeleton with `providers.length` rows so the smoke assertion can pass.
- [ ] **Step 6: Run smoke test** → PASS. Also open `http://localhost:8765/?state=nj` in Chrome headless and screenshot to `/tmp/shell.png`; look at it.
- [ ] **Step 7: Commit** `git commit -m "Add viewer shell with state loading, tabs and smoke test"`

---

### Task 5: Overview tab

**Files:**
- Modify: `app.js` (`renderOverview`), `styles.css` (tiles, chart cards)

**Interfaces:**
- Consumes `config.spending[]`, `config.per_diem[]`, `config.payers[]`, `providers` (count, sum of `licensed_slots`), `config.narrative.*`.
- Helper `fmtMoney(n)` (`$294.0M` style), `fmtInt(n)`, `impliedDays(paid, recipients, rate)`.

- [ ] **Step 1: Tiles**: licenses, licensed slots, latest complete-year paid, recipients that year, current per diem, implied billed days per recipient (paid ÷ recipients ÷ rate in effect that year: use the per_diem row with the latest `effective` ≤ July 1 of that year). Each tile: label (secondary ink), value (proportional figures), one-line footnote with source link.
- [ ] **Step 2: Charts** in `.card`s, each with a `<canvas>` and a `<details><summary>Table view</summary><table>` twin:
  1. Spending by year: bar, slot 1; partial year drawn with `backgroundColor` pattern (diagonal 45° `CanvasPattern` built from an offscreen canvas) and labeled "(partial)".
  2. Recipients by year: line, slot 1, 2px, 8px points. Separate chart, no dual axis.
  3. Implied billed days per recipient: bar, slot 1, complete years only, with a hairline at 260 (max allowed 5×52) drawn via a small inline plugin.
  4. Per-diem rate: stepped line (`stepped: 'before'`), slot 1.
  5. Paid by payer: horizontal bar, one color per payer in fixed slot order 1–5, legend on, sorted as given in config (never re-sorted on filter).
  Chart defaults: `Chart.defaults.font.family = system-ui...`, gridline color from token, no dashed grid, tooltips enabled, `maintainAspectRatio:false` with container height that includes the axis band (`height: 300px`).
- [ ] **Step 3: Narrative**: render `config.narrative.how_paid`, `what_not_public`, `assessment` with `marked.parse` into three cards under the charts. Set `data-ready`.
- [ ] **Step 4: Run smoke test; screenshot desktop (1280) and 400px; look for label collisions and overflow.** Fix.
- [ ] **Step 5: Commit** `git commit -m "Add overview tab with tiles, charts and narrative"`

---

### Task 6: Providers tab: flags, filters, table, map, drawer, download

**Files:**
- Modify: `app.js` (`computeFlags`, `renderProviders`, `matchEnforcement`, `normName`), `styles.css`
- Create: `scripts/tests/flags.test.mjs` (node:test) testing `computeFlags` and `normName` by importing from `app.js`? `app.js` touches `document` at import time, so instead **Create: `flags.js`** (pure module, imported by `app.js`) and test that.

**Interfaces:**
- `flags.js` exports: `normName(s)` (uppercase, strip punctuation, drop tokens `ADULT, MEDICAL, DAY, CARE, DAYCARE, CENTER, CTR, INC, LLC, CORP, THE, OF, HEALTH, HEALTHCARE, SERVICES`); `buildContext({providers, npi, enforcement, dataAsOf})` returning `{ownerCounts: Map, slotP90: number, enforcementByLicense: Map, enforcementByName: Map, dataAsOf: Date}`; `computeFlags(provider, ctx)` returning `[{code, label, detail}]` with codes `no_npi, enforcement, multi_license, large, license_lapsed`; `matchEnforcement(provider, ctx)` returning matched enforcement rows with `via: 'license'|'name'`; `npiWithoutLicense(npi, providers)` returning NPI rows whose normalized `address+zip` matches no provider.

- [ ] **Step 1: Write failing tests** `scripts/tests/flags.test.mjs` for: `normName('PEACEFUL ADULT DAY CARE CENTER (NJ02019)') === 'PEACEFUL'`; a provider with empty `npi_matches` gets `no_npi`; owner appearing twice gets `multi_license` on both; slots at p90+ gets `large`; `license_expires` 30 days after `dataAsOf` gets `license_lapsed`, 200 days after does not; enforcement row with `matched_license_no` gives `enforcement` with `via:'license'`; row with matching normalized name and blank license gives `via:'name'`; every label starts with `Worth a look:`; no label or detail contains `fraud`.
- [ ] **Step 2: Run** `node --test scripts/tests/` → FAIL. Add `"test": "node --test scripts/tests/ && node scripts/smoke_test.mjs"` to package.json.
- [ ] **Step 3: Implement `flags.js`** to pass. `large` = slots ≥ 90th percentile (nearest-rank) of non-blank slots. `license_lapsed` detail says the date. `no_npi` detail: "No NPI record found at this street address; may be billing under a different address or NPI."
- [ ] **Step 4: Tests pass. Commit** `git commit -m "Add pure flag computation module with tests"`
- [ ] **Step 5: `renderProviders` in `app.js`**: controls row (`input#q`, `select#county`, `select#owner_type`, flag checkboxes one per code, `select#sort` with name/slots desc/county/owner); result count line; two-column layout (map left, table right; stack under 900px). Map: Leaflet with OSM tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, attribution), `L.markerClusterGroup`, circle markers with radius by slots and fill from the blue sequential ramp by slots quantile (5 steps: 250, 350, 450, 550, 650), popup with name/city/slots. Table `#providers-table` with columns Name, City, County, Slots, Owner, Owner type, Flags (each flag as a `<span class="flag" title=detail>`), row `tabindex=0`; click/Enter opens `<aside id="drawer">` listing every column in CSV order plus matched enforcement rows with links; Escape closes. `applyFilters()` reads controls, updates url state, re-renders table and map. "Download filtered CSV" uses `Papa.unparse` + Blob + `a[download]`. Under the table: heading "NPI records with no license at this address" with count and a collapsed table of `npiWithoutLicense` rows and the explanation paragraph from the spec. Set `data-ready` after first render.
- [ ] **Step 6: Run full `npm test`** → PASS (row count equals 168). Screenshot at 1280 and 400; check the flags column wraps, the map has a fixed height of 480px and doesn't overflow.
- [ ] **Step 7: Commit** `git commit -m "Add providers tab with filters, map, table, drawer and flags"`

---

### Task 7: Enforcement tab

**Files:** Modify `app.js` (`renderEnforcement`), `styles.css`

- [ ] **Step 1:** Summary tiles: actions count, distinct providers, total of `amount` where present ("identified overpayments/settlements with a stated amount"). Toggle buttons "Timeline | Table". Timeline: `<ol>` grouped by year descending, each item date, provider (link to matched license opens drawer via `?tab=providers&q=<name>`), agency, action, amount, issues, "Document ↗" link. Table: sortable by date/amount. Under it, a small bar chart "Actions by year" slot 1 with table twin.
- [ ] **Step 2:** Smoke test passes; screenshot; commit `git commit -m "Add enforcement tab"`

---

### Task 8: Methodology and Add-your-state tabs

**Files:** Modify `app.js` (`renderMethodology`, `renderHowto`); Create `states/_template/config.json`, `states/_template/providers.csv`, `states/_template/npi_registry.csv`, `states/_template/enforcement.csv` (header rows only), `states/_template/HOWTO.md`, `methodology.md`

- [ ] **Step 1: `methodology.md`**: column dictionary for the three CSVs, the five flag rules in one sentence each, "What is not public" pointer to config narrative, how spending/recipient math is done (implied days formula), OPRA/FOIA guidance, disclaimer (not an accusation, not legal advice).
- [ ] **Step 2: `states/_template/HOWTO.md`**: numbered steps: (1) find your licensing agency roster (search terms: "adult day health licensed facilities <state> department of health", "adult day care license lookup"); (2) find the Medicaid per diem (state plan amendments on medicaid.gov, budget notices, MCO provider bulletins); (3) find statewide spending and recipients (Comptroller/Auditor/Inspector General reports, HHS OIG state audits at oig.hhs.gov/reports, MLTSS annual reports, legislative budget testimony); (4) run `scripts/fetch_nppes.py --state XX`; (5) build `providers.csv` (column mapping table with NJ example values); (6) build `enforcement.csv` (Comptroller, AG Medicaid Fraud Control Unit, licensing agency enforcement pages, DOJ press releases); (7) fill `config.json` field by field; (8) `python3 scripts/validate.py --state xx`; (9) `python3 -m http.server` and open `?state=xx`; (10) add to `states/index.json`, open a PR. Plus the OPRA/FOIA template letter for per-provider paid units and dollars by billing NPI.
- [ ] **Step 3:** `renderMethodology` fetches `methodology.md` and appends `config.sources` as a list with local PDF links; `renderHowto` fetches `states/_template/HOWTO.md`. Both `marked.parse`. Set `data-ready`.
- [ ] **Step 4:** `python3 scripts/validate.py` must skip `_template`. Smoke test passes. Commit `git commit -m "Add methodology, state template and how-to"`

---

### Task 9: README and CONTRIBUTING

**Files:** Create `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1 short form link + contact)

- [ ] **Step 1: `README.md`**: what it is, live link, screenshot placeholder replaced after deploy, NJ headline findings (5 bullets with sources), repo layout, run locally, add your state (link HOWTO), where to share (list agreed in conversation), license.
- [ ] **Step 2: `CONTRIBUTING.md`**: ground rules (public sources only; every number cites a URL; no personal data beyond official rosters and NPPES; flags are "worth a look", never accusations; no speculation in narrative), how to add a state, how to propose a flag or chart (open an issue with the rule and why it is a fact not a judgment), PR review checklist (validate passes, sources resolve, narrative sourced, screenshots attached, `npm test` passes), disclaimer.
- [ ] **Step 3:** Commit `git commit -m "Add README, contributing guide and code of conduct"`

---

### Task 10: Create GitHub repo, deploy Pages, verify

- [ ] **Step 1:** `gh repo create jpatel3/adult-day-care-watch --public --source=. --remote=origin --description "Public data on Medicaid-funded adult day care by state: money, providers, owners, enforcement. Forkable." --push`
- [ ] **Step 2:** `gh api -X POST repos/jpatel3/adult-day-care-watch/pages -f 'source[branch]=main' -f 'source[path]=/'`; poll `gh api repos/jpatel3/adult-day-care-watch/pages/builds/latest --jq .status` until `built`.
- [ ] **Step 3:** `curl -sI https://jpatel3.github.io/adult-day-care-watch/ | head -1` → 200; `curl -s .../states/nj/providers.csv | wc -l` → 169. Run the smoke test against the live URL (`SMOKE_URL=https://jpatel3.github.io/adult-day-care-watch/ node scripts/smoke_test.mjs`, script honors env var). Screenshot live site, add to README as `docs/screenshot.png`, commit and push.
- [ ] **Step 4:** Confirm CI run is green: `gh run list --limit 1`.
