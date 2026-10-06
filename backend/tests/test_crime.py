"""
Historical Crime Evidence — unit and integration tests.
Run: cd backend && pytest tests/test_crime.py -v

All tests use SYNTHETIC fixtures in tests/fixtures/crime/.
No real NCRB data is ever used in tests.
"""
from __future__ import annotations

import csv
import json
import math
import os
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock

import pytest

FIXTURES = Path(__file__).parent / "fixtures" / "crime"
CSV_FILE  = FIXTURES / "test_crime_data.csv"
JSON_FILE = FIXTURES / "test_crime_data.json"


# ===========================================================
# Normaliser
# ===========================================================

class TestNormaliser:
    def _make(self):
        from app.services.crime.normalizer import Normaliser
        n = Normaliser("TEST", "Test Dataset 2022")
        return n

    def test_maps_csv_headers(self):
        n = self._make()
        n.set_columns(["State","District","Crime Head","Cases Reported","Year"])
        assert "state" in n._col_map
        assert "crime_category" in n._col_map
        assert "incident_count" in n._col_map

    def test_valid_row(self):
        n = self._make()
        n.set_columns(["State","District","Crime Head","Cases Reported","Year"])
        rec, err = n.normalise({"State":"Maharashtra","District":"Pune","Crime Head":"Theft","Cases Reported":"1234","Year":"2022"})
        assert err is None
        assert rec is not None
        assert rec.state == "Maharashtra"
        assert rec.crime_category == "theft"
        assert rec.incident_count == 1234
        assert rec.year == 2022

    def test_missing_state_invalid(self):
        n = self._make()
        n.set_columns(["State","District","Crime Head","Cases Reported","Year"])
        rec, err = n.normalise({"State":"","District":"Pune","Crime Head":"Theft","Cases Reported":"100","Year":"2022"})
        assert rec is None
        assert err is not None

    def test_missing_category_invalid(self):
        n = self._make()
        n.set_columns(["State","District","Crime Head","Cases Reported","Year"])
        rec, err = n.normalise({"State":"Bihar","District":"Patna","Crime Head":"","Cases Reported":"200","Year":"2022"})
        assert rec is None

    def test_invalid_count_invalid(self):
        n = self._make()
        n.set_columns(["State","District","Crime Head","Cases Reported","Year"])
        rec, err = n.normalise({"State":"Raj","District":"J","Crime Head":"Burglary","Cases Reported":"abc","Year":"2022"})
        assert rec is None

    def test_invalid_year_invalid(self):
        n = self._make()
        n.set_columns(["State","District","Crime Head","Cases Reported","Year"])
        rec, err = n.normalise({"State":"X","District":"Y","Crime Head":"Theft","Cases Reported":"10","Year":"1800"})
        assert rec is None

    def test_severity_applied(self):
        n = self._make()
        n.set_columns(["State","District","Crime Head","Cases Reported","Year"])
        rec, _ = n.normalise({"State":"Delhi","District":"Central","Crime Head":"Murder","Cases Reported":"5","Year":"2022"})
        assert rec is not None
        assert rec.severity_weight == 1.0

    def test_unknown_category_default_severity(self):
        from app.services.crime.config import DEFAULT_SEVERITY_WEIGHT
        n = self._make()
        n.set_columns(["State","District","Crime Head","Cases Reported","Year"])
        rec, _ = n.normalise({"State":"X","District":"Y","Crime Head":"Unusual Offence XYZ","Cases Reported":"10","Year":"2022"})
        assert rec is not None
        assert rec.severity_weight == DEFAULT_SEVERITY_WEIGHT

    def test_metadata_preserved(self):
        n = self._make()
        n.set_columns(["State","District","Crime Head","Cases Reported","Year","Extra"])
        rec, _ = n.normalise({"State":"X","District":"Y","Crime Head":"Theft","Cases Reported":"10","Year":"2022","Extra":"val"})
        assert rec is not None
        assert "Extra" in rec.metadata

    def test_json_column_aliases(self):
        n = self._make()
        n.set_columns(["state_name","district_name","crime_category","incident_count","year"])
        rec, err = n.normalise({"state_name":"Delhi","district_name":"South","crime_category":"Robbery","incident_count":50,"year":2021})
        assert err is None
        assert rec is not None


# ===========================================================
# Importer
# ===========================================================

class TestImporter:
    def test_csv_parse(self):
        from app.services.crime.importer import CrimeDataImporter
        imp = CrimeDataImporter("TEST","Fixture 2022")
        records, summary = imp.parse(CSV_FILE)
        # 4 valid rows in fixture (rows with state/category/year/count)
        assert summary.imported >= 4
        assert summary.skipped >= 3   # the invalid rows
        assert summary.total_rows == summary.imported + summary.skipped

    def test_json_parse(self):
        from app.services.crime.importer import CrimeDataImporter
        imp = CrimeDataImporter("TEST","Fixture JSON")
        records, summary = imp.parse(JSON_FILE)
        assert summary.imported == 2
        assert summary.skipped == 0

    def test_missing_file_raises(self):
        from app.services.crime.importer import CrimeDataImporter
        imp = CrimeDataImporter("TEST","X")
        with pytest.raises(FileNotFoundError):
            imp.parse(Path("/no/such/file.csv"))

    def test_year_override(self):
        from app.services.crime.importer import CrimeDataImporter
        # Use JSON file which has "year" column; override should take precedence
        imp = CrimeDataImporter("TEST","X", year_override=2020)
        records, _ = imp.parse(JSON_FILE)
        assert all(r.year == 2020 for r in records)

    def test_import_summary_str(self):
        from app.services.crime.importer import CrimeDataImporter
        imp = CrimeDataImporter("TEST","X")
        _, summary = imp.parse(CSV_FILE)
        s = str(summary)
        assert "imported" in s.lower()


# ===========================================================
# Time decay
# ===========================================================

class TestTimeDecay:
    def test_recent_year_high_weight(self):
        from app.services.crime.evidence import _time_weight
        w = _time_weight(2023, reference_year=2024)
        assert w > 0.8

    def test_old_data_lower_weight(self):
        from app.services.crime.evidence import _time_weight
        w_new = _time_weight(2023, reference_year=2024)
        w_old = _time_weight(2010, reference_year=2024)
        assert w_old < w_new

    def test_very_old_above_minimum(self):
        from app.services.crime.evidence import _time_weight
        from app.services.crime.config import MIN_TIME_WEIGHT
        w = _time_weight(1990, reference_year=2024)
        assert w >= MIN_TIME_WEIGHT


# ===========================================================
# Evidence aggregation
# ===========================================================

class TestEvidenceAggregation:
    def _ix(self, category="theft", count=500, year=2022, sev=0.4, exp=0.2):
        from app.services.crime.models import CrimeIntersection
        return CrimeIntersection(
            district="Pune", state="Maharashtra",
            crime_category=category, incident_count=count, year=year,
            severity_weight=sev, intersection_m=exp*1000, route_length_m=1000,
            source="TEST", source_dataset="Test 2022",
        )

    def test_unavailable_when_dataset_absent(self):
        from app.services.crime.evidence import aggregate
        ev = aggregate([], dataset_available=False)
        assert ev.evidence_level == "UNAVAILABLE"
        assert ev.score_adjustment == 0.0
        assert not ev.dataset_available

    def test_none_when_no_intersections(self):
        from app.services.crime.evidence import aggregate
        ev = aggregate([], dataset_available=True)
        assert ev.evidence_level == "NONE"
        assert ev.score_adjustment == 0.0

    def test_adjustment_negative(self):
        from app.services.crime.evidence import aggregate
        ixs = [self._ix(count=2000, sev=0.8, exp=0.5) for _ in range(3)]
        ev = aggregate(ixs, dataset_available=True)
        assert ev.score_adjustment <= 0.0

    def test_high_exposure_gives_high_level(self):
        from app.services.crime.evidence import aggregate
        ixs = [self._ix(exp=0.4) for _ in range(3)]
        ev = aggregate(ixs, dataset_available=True)
        assert ev.evidence_level in ("HIGH", "MODERATE")

    def test_categories_populated(self):
        from app.services.crime.evidence import aggregate
        ixs = [self._ix("theft"), self._ix("robbery")]
        ev = aggregate(ixs, dataset_available=True)
        assert "theft" in ev.categories or "robbery" in ev.categories

    def test_disclaimer_present(self):
        from app.services.crime.evidence import aggregate
        from app.services.crime.config import SOURCE_DISCLAIMER
        ev = aggregate([self._ix()], dataset_available=True)
        assert ev.disclaimer == SOURCE_DISCLAIMER

    def test_explanation_not_probability_language(self):
        from app.services.crime.evidence import aggregate
        ev = aggregate([self._ix()], dataset_available=True)
        assert "% safe" not in ev.explanation.lower()


# ===========================================================
# Safety Engine integration
# ===========================================================

class TestSafetyEngineIntegration:
    def test_zero_adjustment_unchanged(self):
        from app.services.safety_engine import calculate_safety_score, SafetyInput, apply_historical_evidence
        inp = SafetyInput(lighting=70, pedestrian_activity=70, emergency_access="Good", reports=[])
        result = calculate_safety_score(inp)
        adjusted = apply_historical_evidence(result, 0.0, "no evidence")
        assert adjusted.safety_score == result.safety_score

    def test_negative_adjustment_lowers_score(self):
        from app.services.safety_engine import calculate_safety_score, SafetyInput, apply_historical_evidence
        inp = SafetyInput(lighting=70, pedestrian_activity=70, emergency_access="Good", reports=[])
        result = calculate_safety_score(inp)
        adjusted = apply_historical_evidence(result, -8.0, "elevated crime exposure")
        assert adjusted.safety_score < result.safety_score

    def test_adjustment_never_below_zero(self):
        from app.services.safety_engine import calculate_safety_score, SafetyInput, apply_historical_evidence
        inp = SafetyInput(lighting=0, pedestrian_activity=0, emergency_access="Limited", reports=[])
        result = calculate_safety_score(inp)
        adjusted = apply_historical_evidence(result, -12.0, "high crime exposure")
        assert adjusted.safety_score >= 0

    def test_fallback_when_unavailable(self):
        from app.services.safety_engine import calculate_safety_score, SafetyInput
        # When dataset is unavailable, score_adjustment is 0 so no change
        inp = SafetyInput(lighting=70, pedestrian_activity=70, emergency_access="Good", reports=[])
        result = calculate_safety_score(inp)
        assert 0 <= result.safety_score <= 100


# ===========================================================
# Config: weights sum
# ===========================================================

class TestWeights:
    def test_evidence_weights_sum_to_1(self):
        from app.services.crime.config import EVIDENCE_WEIGHTS
        total = (
            EVIDENCE_WEIGHTS.density + EVIDENCE_WEIGHTS.severity
            + EVIDENCE_WEIGHTS.exposure + EVIDENCE_WEIGHTS.time_weight
        )
        assert abs(total - 1.0) < 1e-9