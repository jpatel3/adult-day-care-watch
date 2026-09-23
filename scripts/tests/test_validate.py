import csv
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from validate import validate_state  # noqa: E402

PROVIDER_COLS = [
    "license_no", "licensed_name", "dba_alpha_name", "address", "city", "zip", "county",
    "phone", "email", "license_expires", "licensed_slots", "administrator", "licensed_owner",
    "owner_type", "lat", "lng",
]
NPI_COLS = ["npi", "name", "status", "enumerated", "official", "official_title", "address",
            "city", "zip", "phone", "primary_adc", "n_locations"]
ENF_COLS = ["date", "provider", "agency", "action", "amount", "issues", "url", "matched_license_no"]


def write_csv(path, cols, rows):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})


def good_config():
    return {
        "id": "zz", "name": "Testland", "data_as_of": "2026-01-01",
        "map_center": [40, -74], "map_zoom": 8, "bbox": [39, -75, 41, -73],
        "per_diem": [{"effective": "2020-01-01", "rate": 80.0, "source": "https://x.gov/a"}],
        "spending": [{"year": 2022, "paid": 100.0, "recipients": 10, "partial": False, "source": "https://x.gov/b"},
                     {"year": 2023, "paid": 110.0, "recipients": 11, "partial": False, "source": "https://x.gov/b"}],
        "payers": [], "narrative": {}, "sources": [{"title": "t", "url": "https://x.gov/c"}],
    }


class ValidateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.state = self.tmp / "zz"
        self.state.mkdir()
        self.config = good_config()
        self.providers = [{"license_no": "1", "licensed_name": "A", "city": "X", "county": "Y",
                           "licensed_slots": "100", "lat": "40.1", "lng": "-74.1",
                           "license_expires": "2027-01-01"}]
        self.npi = [{"npi": "1234567890", "name": "A", "status": "A"}]
        self.enf = [{"date": "2024-05-01", "provider": "A", "agency": "G", "action": "N", "amount": "12.5",
                     "url": "https://x.gov/d"}]

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def build(self, provider_cols=PROVIDER_COLS):
        (self.state / "config.json").write_text(json.dumps(self.config))
        write_csv(self.state / "providers.csv", provider_cols, self.providers)
        write_csv(self.state / "npi_registry.csv", NPI_COLS, self.npi)
        write_csv(self.state / "enforcement.csv", ENF_COLS, self.enf)
        return validate_state(self.state)

    def test_valid_state_has_no_errors(self):
        self.assertEqual(self.build(), [])

    def test_missing_required_column(self):
        cols = [c for c in PROVIDER_COLS if c != "licensed_owner"]
        errs = self.build(provider_cols=cols)
        self.assertIn("providers.csv: missing required column licensed_owner", errs)

    def test_bad_enforcement_date(self):
        self.enf[0]["date"] = "2025-13-40"
        errs = self.build()
        self.assertTrue(any(e.startswith("enforcement.csv row 2: bad date") for e in errs), errs)

    def test_source_url_must_be_https(self):
        self.config["sources"][0]["url"] = "http://x.gov/c"
        errs = self.build()
        self.assertIn("config.json sources[0].url must start with https://", errs)

    def test_spending_years_ascending(self):
        self.config["spending"].reverse()
        errs = self.build()
        self.assertIn("config.json spending years must be ascending", errs)

    def test_lat_outside_bbox(self):
        self.providers[0]["lat"] = "45.0"
        errs = self.build()
        self.assertIn("providers.csv row 2: lat/lng outside bbox", errs)

    def test_blank_or_zero_coordinates_are_skipped(self):
        self.providers[0]["lat"] = "0"
        self.providers[0]["lng"] = ""
        self.assertEqual(self.build(), [])

    def test_non_numeric_slots(self):
        self.providers[0]["licensed_slots"] = "many"
        errs = self.build()
        self.assertIn("providers.csv row 2: licensed_slots must be an integer or blank", errs)

    def test_config_id_must_match_folder(self):
        self.config["id"] = "nope"
        errs = self.build()
        self.assertIn("config.json id must equal folder name zz", errs)


if __name__ == "__main__":
    unittest.main()
