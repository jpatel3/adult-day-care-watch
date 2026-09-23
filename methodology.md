# Methodology

Everything on this site comes from documents a government agency published, or from the federal NPI registry. Each state folder carries the source list, and the saved PDFs, so a reader can check any number.

## What the numbers mean

**Medicaid paid** is the total the state Medicaid program (fee-for-service plus managed care) paid for adult day health services in a calendar year, as reported by the state's own oversight agency. It is not the centers' total revenue: private pay, other insurance and state grants are not included.

**Recipients** is the count of distinct people with at least one paid day in the year.

**Implied billed days per recipient** is `paid ÷ recipients ÷ per diem`, using the minimum per diem in effect at the start of the state fiscal year. It is a rough average. It overstates days where managed care organizations pay above the minimum, and understates them where they pay less. The ceiling under most states' rules is 5 days × 52 weeks = 260.

**Licensed slots** is the daily capacity on the license. It is not attendance. A center cannot legally bill more participant-days than slots × operating days, so slots put an upper bound on plausible billing.

## The data files

### providers.csv (one row per license)

| Column | Meaning |
|---|---|
| license_no | The licensing agency's identifier |
| licensed_name | Name on the license |
| dba_alpha_name | Trade name or entity name as the agency lists it |
| address, city, zip, county | Facility location |
| phone, email | Facility contacts as published by the agency |
| license_expires | Expiry date on the roster, YYYY-MM-DD |
| licensed_slots | Licensed daily capacity |
| administrator | Administrator of record |
| licensed_owner | The owner entity on the license (usually an LLC or corporation, not a person) |
| owner_type | Agency's ownership classification (for-profit LLC, nonprofit, government, etc.) |
| lat, lng | Coordinates as geocoded by the agency; blank where the source was wrong or missing |
| npi_matches | NPI numbers whose registry address matches this facility address |
| npi_authorized_official | The authorized official named on those NPI records |

Any extra columns a state adds are shown in the detail drawer.

### npi_registry.csv

Every organization in the federal NPI registry with taxonomy 261QA0600X (Adult Day Care) in the state. The registry is self-reported by providers. It includes social day programs, closed centers, and duplicates, so its count is always higher than the license count.

### enforcement.csv

One row per public enforcement document: settlement agreements, notices of overpayment, cease-and-desist orders, license actions. `amount` is the largest dollar figure in the document, which is usually the settlement total or identified overpayment. `issues` lists violation types mentioned in the document. `matched_license_no` links the row to a current license when the match is confident; the viewer also matches by normalized name and labels those "name match".

## Flags

Each flag is a fact computed from the columns above. The label always starts with "Worth a look". A flag is a reason to read more, not a finding. The rules for this build are listed below the text.

## What is not public, and how to get it

Per-provider Medicaid payments are the single most important missing number. Every state Medicaid agency has them (managed care encounter data plus fee-for-service claims). Ask under your state's public records law for: paid units and paid dollars for the adult day health procedure code (HCPCS S5102 in most states) by billing provider NPI and by year. Units are attendance days. Divide by licensed slots × operating days to see whether a center's billing is plausible.

Also worth requesting: routine licensing survey reports, complaint logs, and the Medicaid Disclosure of Ownership statements that name the people behind the licensed entities.

## Disclaimer

This is a public-data project. Nothing here is an accusation against any person or business, and nothing is legal advice. Corrections are welcome as GitHub issues or pull requests with a source.
