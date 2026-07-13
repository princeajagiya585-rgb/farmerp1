from datetime import date
from decimal import Decimal

from django.test import TestCase

from apps.farms.models import Farm
from apps.assets.models import Asset


class AssetDepreciationTests(TestCase):
    def setUp(self):
        self.farm = Farm.objects.create(name="F", code="F1")

    def _asset(self, **kw):
        return Asset.objects.create(
            farm=self.farm, name="A", purchase_cost=Decimal("13000"), **kw
        )

    def test_per_day(self):
        a = self._asset(
            depreciation_period=Asset.DepreciationPeriod.DAY,
            depreciation_percent=Decimal("2"),
            purchase_date=date(2026, 7, 1),
        )
        # 10 days × (13000×2%) = 10 × 260 = 2600 → 13000 − 2600 = 10400
        self.assertEqual(a.computed_current_value(as_of=date(2026, 7, 11)), Decimal("10400"))

    def test_per_month(self):
        a = self._asset(
            depreciation_period=Asset.DepreciationPeriod.MONTH,
            depreciation_percent=Decimal("5"),
            purchase_date=date(2026, 1, 15),
        )
        # 3 full months × (13000×5%) = 3 × 650 = 1950 → 13000 − 1950 = 11050
        self.assertEqual(a.computed_current_value(as_of=date(2026, 4, 15)), Decimal("11050"))

    def test_per_year(self):
        a = self._asset(
            depreciation_period=Asset.DepreciationPeriod.YEAR,
            depreciation_percent=Decimal("10"),
            purchase_date=date(2023, 6, 1),
        )
        # 3 years × (13000×10%) = 3 × 1300 = 3900 → 13000 − 3900 = 9100
        self.assertEqual(a.computed_current_value(as_of=date(2026, 6, 1)), Decimal("9100"))

    def test_never_below_zero(self):
        a = self._asset(
            depreciation_period=Asset.DepreciationPeriod.DAY,
            depreciation_percent=Decimal("2"),
            purchase_date=date(2026, 1, 1),
        )
        self.assertEqual(a.computed_current_value(as_of=date(2026, 12, 31)), Decimal("0"))

    def test_no_depreciation_keeps_cost(self):
        a = self._asset(purchase_date=date(2026, 1, 1))
        self.assertEqual(a.computed_current_value(as_of=date(2026, 7, 1)), Decimal("13000"))

    def test_before_purchase_date_is_full_cost(self):
        a = self._asset(
            depreciation_period=Asset.DepreciationPeriod.DAY,
            depreciation_percent=Decimal("2"),
            purchase_date=date(2026, 7, 1),
        )
        self.assertEqual(a.computed_current_value(as_of=date(2026, 6, 1)), Decimal("13000"))
