from decimal import Decimal

from django.db.models import Sum
from django.utils.dateparse import parse_date
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.core.mixins import BaseModelViewSet
from apps.core.permissions import RoleAllowed
from apps.farms.models import Farm
from apps.farms.views import FarmScopedQuerysetMixin

from .models import (
    Budget,
    CostCenter,
    Expense,
    LedgerEntry,
    Payment,
    Purchase,
    PurchaseItem,
    RevenueEntry,
    Sale,
)
from .serializers import (
    BudgetSerializer,
    CostCenterSerializer,
    ExpenseSerializer,
    LedgerEntrySerializer,
    PaymentSerializer,
    PurchaseItemSerializer,
    PurchaseSerializer,
    RevenueEntrySerializer,
    SaleSerializer,
)


class ExpenseViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Expense.objects.select_related(
        "farm", "approved_by", "created_by"
    ).all()
    serializer_class = ExpenseSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = []
    filterset_fields = ["farm", "category", "status", "is_paid", "created_by"]
    search_fields = ["description"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        expense = self.get_object()
        # Idempotent: approving an already-approved expense must not post a
        # second ledger entry (which would double the expense).
        if expense.status == Expense.Status.APPROVED:
            return Response({"detail": "Expense is already approved."}, status=400)
        expense.status = Expense.Status.APPROVED
        expense.approved_by = request.user
        expense.save(update_fields=["status", "approved_by", "updated_at"])

        LedgerEntry.objects.update_or_create(
            source_type="expense",
            source_id=str(expense.id),
            defaults=dict(
                created_by=request.user,
                farm=expense.farm,
                entry_type=LedgerEntry.EntryType.DEBIT,
                account=expense.category,
                amount=expense.amount,
                date=expense.date,
                reference=f"Expense {expense.id}",
                description=expense.description,
            ),
        )
        return Response(self.get_serializer(expense).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        expense = self.get_object()
        expense.status = Expense.Status.REJECTED
        expense.save(update_fields=["status", "updated_at"])
        # If this expense was previously approved, its ledger DEBIT must be
        # reversed — otherwise the rejected expense keeps inflating the books.
        LedgerEntry.objects.filter(
            source_type="expense", source_id=str(expense.id)
        ).delete()
        return Response(self.get_serializer(expense).data)


class PurchaseViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Purchase.objects.select_related(
        "farm", "approved_by", "created_by"
    ).prefetch_related("items").all()
    serializer_class = PurchaseSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = []
    filterset_fields = ["farm", "status", "is_paid", "created_by"]
    search_fields = ["invoice_no", "notes"]

    def perform_create(self, serializer):
        """Auto-approve purchase and create a debit LedgerEntry."""
        purchase = serializer.save(
            created_by=self.request.user,
            status=Purchase.Status.APPROVED,
            approved_by=self.request.user,
        )
        LedgerEntry.objects.create(
            created_by=self.request.user,
            farm=purchase.farm,
            entry_type=LedgerEntry.EntryType.DEBIT,
            account="PURCHASE",
            amount=purchase.total_amount,
            date=purchase.date,
            reference=purchase.invoice_no or f"Purchase {purchase.id}",
            description=purchase.notes,
            source_type="purchase",
            source_id=str(purchase.id),
        )

    def perform_update(self, serializer):
        """Update the purchase and sync its LedgerEntry."""
        purchase = serializer.save()
        LedgerEntry.objects.filter(
            source_type="purchase",
            source_id=str(purchase.id),
        ).update(
            amount=purchase.total_amount,
            date=purchase.date,
            reference=purchase.invoice_no or f"Purchase {purchase.id}",
            description=purchase.notes,
        )


class PurchaseItemViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = PurchaseItem.objects.select_related(
        "purchase", "purchase__farm", "inventory_item"
    ).all()
    serializer_class = PurchaseItemSerializer
    farm_lookup = "purchase__farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = []
    filterset_fields = ["purchase"]
    search_fields = ["name", "purchase__invoice_no"]


class LedgerEntryViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = LedgerEntry.objects.select_related(
        "farm", "created_by"
    ).all()
    serializer_class = LedgerEntrySerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = [Role.FARM_MANAGER]
    filterset_fields = ["farm", "entry_type", "account", "created_by"]
    search_fields = ["reference", "description", "account"]
    # The month/year filter should scope by the entry's transaction date, not
    # the row-creation timestamp.
    date_range_field = "date"


class PaymentViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Payment.objects.select_related(
        "farm", "expense", "purchase", "created_by"
    ).all()
    serializer_class = PaymentSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = []
    filterset_fields = ["farm", "mode", "created_by"]
    search_fields = ["reference"]

    def perform_create(self, serializer):
        payment = serializer.save(created_by=self.request.user)
        LedgerEntry.objects.create(
            created_by=self.request.user,
            farm=payment.farm,
            entry_type=LedgerEntry.EntryType.CREDIT,
            account="PAYMENT",
            amount=payment.amount,
            date=payment.date,
            reference=payment.reference,
            description=f"Payment via {payment.mode}",
            source_type="payment",
            source_id=str(payment.id),
        )


class RevenueEntryViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = RevenueEntry.objects.select_related("farm", "created_by").all()
    serializer_class = RevenueEntrySerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = []
    filterset_fields = ["farm", "source", "created_by"]
    search_fields = ["description"]

    def perform_create(self, serializer):
        revenue = serializer.save(created_by=self.request.user)
        LedgerEntry.objects.create(
            created_by=self.request.user,
            farm=revenue.farm,
            entry_type=LedgerEntry.EntryType.CREDIT,
            account=revenue.source,
            amount=revenue.amount,
            date=revenue.date,
            reference=f"Revenue {revenue.id}",
            description=revenue.description,
            source_type="revenue",
            source_id=str(revenue.id),
        )


class CostCenterViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = CostCenter.objects.select_related("farm").all()
    serializer_class = CostCenterSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = []
    filterset_fields = ["farm"]
    search_fields = ["name", "code", "description"]


class BudgetViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Budget.objects.select_related("farm", "cost_center").all()
    serializer_class = BudgetSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = []
    filterset_fields = ["farm", "cost_center", "category", "fiscal_year", "month"]
    search_fields = ["notes", "cost_center__name"]


class SaleViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Sale.objects.select_related("farm", "crop", "created_by").all()
    serializer_class = SaleSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = []
    filterset_fields = ["farm", "crop", "buyer", "created_by"]
    search_fields = ["buyer", "notes"]

    def perform_create(self, serializer):
        user = self.request.user
        # `buyer` is the customer name supplied by the client — do NOT overwrite
        # it with the logged-in seller's name. Who entered the sale is recorded
        # in `created_by`.
        sale = serializer.save(created_by=user)
        LedgerEntry.objects.create(
            created_by=self.request.user,
            farm=sale.farm,
            entry_type=LedgerEntry.EntryType.CREDIT,
            account="SALE",
            amount=sale.amount,
            date=sale.date,
            reference=f"Sale {sale.id}",
            description=f"Sale to {sale.buyer}" if sale.buyer else "Sale",
            source_type="sale",
            source_id=str(sale.id),
        )

    def perform_update(self, serializer):
        """Update the sale and sync its LedgerEntry."""
        sale = serializer.save()
        LedgerEntry.objects.filter(
            source_type="sale",
            source_id=str(sale.id),
        ).update(
            amount=sale.amount,
            date=sale.date,
            description=f"Sale to {sale.buyer}" if sale.buyer else "Sale",
        )


class FinanceReportViewSet(viewsets.ViewSet):
    """Financial reports: cash flow, P&L, farm- and crop-wise profitability."""

    permission_classes = [RoleAllowed]
    allowed_roles = [Role.FARM_MANAGER]
    serializer_class = serializers.Serializer
    readonly_roles = [Role.FARM_MANAGER]
    GLOBAL_ROLES = {Role.SUPER_ADMIN}

    def _scope(self, qs, farm_field="farm_id"):
        user = self.request.user
        if user.role in self.GLOBAL_ROLES:
            return qs
        ids = list(user.farms.values_list("id", flat=True))
        return qs.filter(**{f"{farm_field}__in": ids})

    @staticmethod
    def _total(qs, field="amount"):
        return qs.aggregate(s=Sum(field))["s"] or Decimal("0")

    @action(detail=False, methods=["get"])
    def cash_flow(self, request):
        """Cash in (revenue + sales) vs cash out (payments), grouped by period."""
        farm = request.query_params.get("farm")
        user_param = request.query_params.get("user")
        start = parse_date(request.query_params.get("start") or "")
        end = parse_date(request.query_params.get("end") or "")
        group = request.query_params.get("group", "day")

        # Sales are mirrored into RevenueEntry, so inflow comes from RevenueEntry
        # ONLY (adding Sale again would double-count). Outflow stays cash Payments.
        rev = self._scope(RevenueEntry.objects.all())
        pay = self._scope(Payment.objects.all())
        if farm:
            rev, pay = rev.filter(farm_id=farm), pay.filter(farm_id=farm)
        if user_param:
            rev, pay = rev.filter(created_by_id=user_param), pay.filter(created_by_id=user_param)
        if start:
            rev, pay = rev.filter(date__gte=start), pay.filter(date__gte=start)
        if end:
            rev, pay = rev.filter(date__lte=end), pay.filter(date__lte=end)

        def key_for(d):
            if group == "week":
                iso = d.isocalendar()
                return f"{iso[0]}-W{iso[1]:02d}"
            if group == "month":
                return f"{d.year}-{d.month:02d}"
            return d.isoformat()

        buckets = {}

        def add(d, inflow=Decimal("0"), outflow=Decimal("0")):
            b = buckets.setdefault(key_for(d), {"inflow": Decimal("0"), "outflow": Decimal("0")})
            b["inflow"] += inflow
            b["outflow"] += outflow

        for r in rev:
            add(r.date, inflow=r.amount or Decimal("0"))
        for p in pay:
            add(p.date, outflow=p.amount or Decimal("0"))

        rows = [
            {
                "period": k,
                "inflow": v["inflow"],
                "outflow": v["outflow"],
                "net": v["inflow"] - v["outflow"],
            }
            for k, v in sorted(buckets.items())
        ]
        tin = sum((r["inflow"] for r in rows), Decimal("0"))
        tout = sum((r["outflow"] for r in rows), Decimal("0"))
        return Response(
            {
                "group": group,
                "rows": rows,
                "totals": {"inflow": tin, "outflow": tout, "net": tin - tout},
            }
        )

    @action(detail=False, methods=["get"])
    def pnl(self, request):
        """Profit & Loss for a month/year/date range (optionally one farm)."""
        farm = request.query_params.get("farm")
        user_param = request.query_params.get("user")
        month = request.query_params.get("month")
        year = request.query_params.get("year")
        start = parse_date(request.query_params.get("start") or "")
        end = parse_date(request.query_params.get("end") or "")

        # Sales are mirrored into RevenueEntry and Purchases into Expense, so
        # income/expenses are computed from the unified tables ONLY — counting
        # Sale/Purchase again here would double-count.
        rev = self._scope(RevenueEntry.objects.all())
        exp = self._scope(Expense.objects.filter(status=Expense.Status.APPROVED))

        def flt(qs):
            if farm:
                qs = qs.filter(farm_id=farm)
            if user_param:
                qs = qs.filter(created_by_id=user_param)
            if year:
                qs = qs.filter(date__year=year)
            if month:
                qs = qs.filter(date__month=month)
            if start:
                qs = qs.filter(date__gte=start)
            if end:
                qs = qs.filter(date__lte=end)
            return qs

        rev, exp = flt(rev), flt(exp)

        income = self._total(rev)
        expense_total = self._total(exp)

        by_category = []
        for row in (
            exp.values("category").annotate(total=Sum("amount")).order_by("-total")
        ):
            by_category.append({"category": row["category"], "total": row["total"]})

        # Breakdowns derived from the source link on the unified rows.
        sales_income = self._total(rev.filter(source_type="sale"))
        purchases_total = self._total(exp.filter(source_type="purchase"))

        return Response(
            {
                "income": income,
                "expenses": expense_total,
                "profit": income - expense_total,
                "income_breakdown": {
                    "revenue": income - sales_income,
                    "sales": sales_income,
                },
                "expense_by_category": by_category,
                "purchases": purchases_total,
            }
        )

    @action(detail=False, methods=["get"])
    def farm_profitability(self, request):
        """Revenue, expense and profit per farm."""
        year = request.query_params.get("year")
        user_param = request.query_params.get("user")
        farms = self._scope(Farm.objects.all(), "id")
        rows = []
        for farm in farms:
            # Unified tables only — sales live in RevenueEntry, purchases in Expense.
            rev = RevenueEntry.objects.filter(farm=farm)
            exp = Expense.objects.filter(farm=farm, status=Expense.Status.APPROVED)
            if user_param:
                rev, exp = (
                    rev.filter(created_by_id=user_param),
                    exp.filter(created_by_id=user_param),
                )
            if year:
                rev, exp = (
                    rev.filter(date__year=year),
                    exp.filter(date__year=year),
                )
            income = self._total(rev)
            expense_total = self._total(exp)
            rows.append(
                {
                    "farm": farm.name,
                    "income": income,
                    "expenses": expense_total,
                    "profit": income - expense_total,
                }
            )
        return Response({"rows": rows})

    @action(detail=False, methods=["get"])
    def crop_profitability(self, request):
        """Sales income vs tagged expenses, per crop."""
        from apps.agronomy.models import Crop

        year = request.query_params.get("year")
        user_param = request.query_params.get("user")
        crops = self._scope(Crop.objects.all())
        rows = []
        for crop in crops:
            # Sales are mirrored into RevenueEntry (carrying the crop link), so
            # crop income now reads from RevenueEntry instead of Sale.
            rev = RevenueEntry.objects.filter(crop=crop)
            exp = Expense.objects.filter(crop=crop, status=Expense.Status.APPROVED)
            if user_param:
                rev = rev.filter(created_by_id=user_param)
                exp = exp.filter(created_by_id=user_param)
            if year:
                rev = rev.filter(date__year=year)
                exp = exp.filter(date__year=year)
            income = self._total(rev)
            expense_total = self._total(exp)
            if income == 0 and expense_total == 0:
                continue
            rows.append(
                {
                    "crop": f"{crop.name} {crop.variety}".strip(),
                    "income": income,
                    "expenses": expense_total,
                    "profit": income - expense_total,
                }
            )
        return Response({"rows": rows})
