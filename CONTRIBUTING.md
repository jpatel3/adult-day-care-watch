# Contributing

Thanks for wanting to do this for your community. This guide covers the ground rules, how to add a state, how to propose a change to the viewer, and what a reviewer checks before merging.

## Ground rules

1. **Public sources only.** Every row and every number traces to a document a government agency published, or to the federal NPI registry. No leaked documents, no scraped private sites, no hearsay.
2. **Cite everything.** Every `source` field in `config.json` is a URL. Every enforcement row links to the agency's own document. If you cannot link it, leave it out.
3. **No personal data beyond the official record.** Licensee, administrator and authorized-official names are included because the state and the federal registry publish them for that purpose. Do not add home addresses, personal phone numbers, social media, family members, or anything found by searching a person's name.
4. **Flags are facts, not judgments.** A flag must be computable from a column and phrased "Worth a look". If a rule needs a human opinion to apply, it is not a flag; write it in the narrative with a source instead.
5. **Narrative is sourced and calm.** Describe what the record shows. Do not speculate about motive, do not name a center as suspicious, and do not use the words fraud or fraudulent except when quoting an agency's own finding or charge.
6. **Corrections come first.** If a provider or agency tells us something is wrong, we fix or remove it promptly and note the change in the commit message.

## Adding a state

Follow [`states/_template/HOWTO.md`](states/_template/HOWTO.md). In short:

1. Copy `states/_template/` to `states/<xx>/` (two-letter code, lower case).
2. Fill `providers.csv`, `npi_registry.csv` (use `scripts/fetch_nppes.py`), `enforcement.csv`, and `config.json`.
3. Save the key source PDFs under `states/<xx>/sources/` and list them in `config.json` with `local` paths.
4. Run `python3 scripts/validate.py --state xx` until it prints `OK`.
5. Preview with `python3 -m http.server 8000` and check every tab at desktop and phone width.
6. Add your state to `states/index.json` and open a pull request. Include screenshots.

A state does not have to be complete to be useful. A roster plus the per diem is a fine first pull request; spending, enforcement and narrative can follow.

## Proposing a new flag, chart or column

Open an issue first. For a flag, state the rule as one sentence that a script could evaluate, name the columns it uses, and explain why the result is a fact rather than an opinion. For a chart, say what question it answers and which `config.json` fields it needs. Keep in mind the site has no build step and must stay readable by someone who is not a developer.

Viewer changes go in `app.js`, `styles.css`, `index.html`; flag logic goes in `flags.js` with a test in `scripts/tests/flags.test.mjs`. Run `npm test` before opening the pull request.

## Review checklist

A maintainer checks these before merging a state or a data update:

- [ ] `python3 scripts/validate.py` passes (CI runs it).
- [ ] Every `source` URL and enforcement `url` resolves and is on an agency, court or `.gov` domain (or a reputable news archive when the agency page is gone; say so in a note).
- [ ] Narrative claims each have a source in the `sources` list; no speculation, no motive.
- [ ] `matched_license_no` is set only where the match is certain.
- [ ] No personal data beyond what the roster and NPI registry publish.
- [ ] Screenshots of the overview and providers tabs attached.
- [ ] `npm test` passes when viewer code changed.

## Public records requests

Provider-level payment data is the biggest gap in every state. A template request is at the end of `states/_template/HOWTO.md`. If you file one, consider doing it through [MuckRock](https://www.muckrock.com/) so the request and the response are public, and link it from your state's `config.json` sources.

## Code of conduct

Be kind and factual. Assume the people running these centers are running legitimate businesses until a document says otherwise. Harassment of anyone, including providers, will get you removed. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Not legal advice

Nothing in this repository is legal advice or an accusation. If you believe you have found wrongdoing, report it to your state's Medicaid fraud unit or the HHS OIG hotline (tips.hhs.gov), not in a GitHub issue.
