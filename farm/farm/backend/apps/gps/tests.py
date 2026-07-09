from rest_framework.test import APITestCase
from django.urls import reverse
from rest_framework import status
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.farms.models import Farm
from apps.tasks.models import Task, TaskWorkSession
from apps.gps.models import LocationPing

User = get_user_model()

class LocationPingAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpass')
        self.farm = Farm.objects.create(name='Test Farm')
        self.task = Task.objects.create(title='Test Task', farm=self.farm, created_by=self.user, status=Task.Status.TODO)
        self.client.force_authenticate(user=self.user) # Authenticate the client
        self.list_url = reverse('locationping-list')

    def test_create_location_ping_checkin(self):
        data = {
            'task': self.task.id,
            'activity': LocationPing.Activity.CHECKIN,
            'latitude': 12.345678,
            'longitude': 98.765432,
            'accuracy': 10,
            'notes': 'Before work check-in',
        }
        response = self.client.post(self.list_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(LocationPing.objects.count(), 1)
        self.assertEqual(LocationPing.objects.get().activity, LocationPing.Activity.CHECKIN)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, Task.Status.IN_PROGRESS)
        self.assertTrue(TaskWorkSession.objects.filter(task=self.task, user=self.user, end_time__isnull=True).exists())

    def test_create_location_ping_during_work(self):
        # First, check-in
        self.client.post(self.list_url, {
            'task': self.task.id, 'activity': LocationPing.Activity.CHECKIN, 'latitude': 1, 'longitude': 1
        }, format='json')
        
        data = {
            'task': self.task.id,
            'activity': LocationPing.Activity.DURING_WORK,
            'latitude': 12.345678,
            'longitude': 98.765432,
            'accuracy': 10,
            'notes': 'During work update',
        }
        response = self.client.post(self.list_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(LocationPing.objects.filter(activity=LocationPing.Activity.DURING_WORK).count(), 1)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, Task.Status.IN_PROGRESS) # Should remain in progress

    def test_create_location_ping_break_and_resume(self):
        # First, check-in
        self.client.post(self.list_url, {
            'task': self.task.id, 'activity': LocationPing.Activity.CHECKIN, 'latitude': 1, 'longitude': 1
        }, format='json')

        # Take a break
        data_break = {
            'task': self.task.id,
            'activity': LocationPing.Activity.BREAK,
            'latitude': 12.345678,
            'longitude': 98.765432,
        }
        response_break = self.client.post(self.list_url, data_break, format='json')
        self.assertEqual(response_break.status_code, status.HTTP_201_CREATED)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, Task.Status.IN_PROGRESS) # Status remains IN_PROGRESS, but work session stops
        self.assertFalse(TaskWorkSession.objects.filter(task=self.task, user=self.user, end_time__isnull=True).exists())
        self.assertTrue(LocationPing.objects.filter(activity=LocationPing.Activity.BREAK).exists())

        # Resume work
        data_resume = {
            'task': self.task.id,
            'activity': LocationPing.Activity.RESUME,
            'latitude': 12.345678,
            'longitude': 98.765432,
        }
        response_resume = self.client.post(self.list_url, data_resume, format='json')
        self.assertEqual(response_resume.status_code, status.HTTP_201_CREATED)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, Task.Status.IN_PROGRESS) # Status goes back to IN_PROGRESS (if it changed)
        self.assertTrue(TaskWorkSession.objects.filter(task=self.task, user=self.user, end_time__isnull=True).exists())
        self.assertTrue(LocationPing.objects.filter(activity=LocationPing.Activity.RESUME).exists())

    def test_create_location_ping_checkout(self):
        # First, check-in
        self.client.post(self.list_url, {
            'task': self.task.id, 'activity': LocationPing.Activity.CHECKIN, 'latitude': 1, 'longitude': 1
        }, format='json')

        data = {
            'task': self.task.id,
            'activity': LocationPing.Activity.CHECKOUT,
            'latitude': 12.345678,
            'longitude': 98.765432,
            'accuracy': 10,
            'notes': 'Work completed',
        }
        response = self.client.post(self.list_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(LocationPing.objects.filter(activity=LocationPing.Activity.CHECKOUT).count(), 1)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, Task.Status.COMPLETED)
        self.assertEqual(self.task.progress, 100)
        self.assertFalse(TaskWorkSession.objects.filter(task=self.task, user=self.user, end_time__isnull=True).exists()) # All sessions stopped