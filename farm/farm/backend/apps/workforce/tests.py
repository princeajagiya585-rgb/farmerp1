from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.models import Role, User
from apps.farms.models import Farm
from apps.workforce.models import Attendance, Employee
from apps.workforce.views import AttendanceViewSet


class CheckOutHalfDayTests(TestCase):
    """On check-out, a monthly-wage employee who worked under 5 hours is a
    HALF DAY; 5+ hours (or no check-out at all) is a full day."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="attadmin", password="x", role=Role.SUPER_ADMIN
        )
        self.farm = Farm.objects.create(name="Att Farm", code="FATT")
        self.factory = APIRequestFactory()

    def _employee(self, wage_type=Employee.WageType.MONTHLY):
        return Employee.objects.create(
            employee_code=f"E{wage_type}", first_name="A", last_name="B",
            farm=self.farm, wage_type=wage_type,
        )

    def _attendance(self, employee, hours_ago):
        return Attendance.objects.create(
            employee=employee,
            farm=self.farm,
            date=timezone.localdate(),
            check_in_time=timezone.now() - timedelta(hours=hours_ago),
            geofence_status=True,  # checked in inside the farm
        )

    def _check_out(self, attendance):
        request = self.factory.post(
            f"/api/workforce/attendance/{attendance.id}/check_out/", {}
        )
        force_authenticate(request, user=self.admin)
        view = AttendanceViewSet.as_view({"post": "check_out"})
        resp = view(request, pk=str(attendance.id))
        attendance.refresh_from_db()
        return resp

    def test_under_five_hours_is_half_day(self):
        emp = self._employee()
        att = self._attendance(emp, hours_ago=3)  # 3 hours worked
        resp = self._check_out(att)
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", None))
        self.assertEqual(att.status, Attendance.Status.HALF_DAY)

    def test_over_five_hours_is_full_day(self):
        emp = self._employee()
        att = self._attendance(emp, hours_ago=6)  # 6 hours worked
        resp = self._check_out(att)
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", None))
        self.assertEqual(att.status, Attendance.Status.PRESENT_DONE)

    def test_hourly_employee_short_shift_stays_present_done(self):
        # Hourly workers are paid by the hour; a short check-out is not a
        # half day for them.
        emp = self._employee(wage_type=Employee.WageType.HOURLY)
        att = self._attendance(emp, hours_ago=2)
        resp = self._check_out(att)
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", None))
        self.assertEqual(att.status, Attendance.Status.PRESENT_DONE)
