"""Test suspend/activate by calling the API endpoints directly from Python."""
import os, sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.urls import resolve, Resolver404

# Test if the URL can be resolved
url_path = '/api/v1/auth/users/test-id/suspend/'
try:
    match = resolve(url_path)
    print(f"URL '{url_path}' resolved to: {match.func.__name__ if hasattr(match.func, '__name__') else match.func}")
    print(f"  URL name: {match.url_name}")
    print(f"  kwargs: {match.kwargs}")
except Resolver404 as e:
    print(f"URL '{url_path}' NOT FOUND!")

# Try with a simpler path (without /api/v1 prefix)
url_path2 = '/auth/users/test-id/suspend/'
try:
    match = resolve(url_path2)
    print(f"URL '{url_path2}' resolved to: {match.func.__name__ if hasattr(match.func, '__name__') else match.func}")
    print(f"  URL name: {match.url_name}")
    print(f"  kwargs: {match.kwargs}")
except Resolver404 as e:
    print(f"URL '{url_path2}' NOT FOUND!")

# Test the actual suspend/activate endpoints
from apps.accounts.models import User
from django.test import RequestFactory
from rest_framework.test import APIRequestFactory
from rest_framework import status

# Find a test user
test_user = User.objects.filter(role='EMPLOYEE').first()
if not test_user:
    test_user = User.objects.filter(role='FARM_MANAGER').first()

if test_user:
    print(f"\nFound test user: {test_user.username} (ID: {test_user.id})")
    print(f"  Role: {test_user.role}")
    print(f"  Active: {test_user.is_active}")
    
    # Try calling the viewset action directly
    from apps.accounts.views import UserViewSet
    from rest_framework.test import APIRequestFactory
    from django.contrib.auth import get_user_model
    
    User = get_user_model()
    admin = User.objects.filter(role='SUPER_ADMIN').first()
    
    if admin:
        factory = APIRequestFactory()
        
        # Test suspend
        request = factory.post(f'/auth/users/{test_user.id}/suspend/')
        request.user = admin
        request.auth = None
        
        view = UserViewSet.as_view({'post': 'suspend'})
        response = view(request, pk=str(test_user.id))
        
        print(f"\nDirect ViewSet call - Suspend:")
        print(f"  HTTP {response.status_code}")
        print(f"  Response: {response.data}")
        
        # Check if user was actually suspended
        test_user.refresh_from_db()
        print(f"  User is_active after suspend: {test_user.is_active}")
        
        # Reactivate
        if not test_user.is_active:
            request2 = factory.post(f'/auth/users/{test_user.id}/activate/')
            request2.user = admin
            request2.auth = None
            
            view2 = UserViewSet.as_view({'post': 'activate'})
            response2 = view2(request2, pk=str(test_user.id))
            
            print(f"\nDirect ViewSet call - Activate:")
            print(f"  HTTP {response2.status_code}")
            print(f"  Response: {response2.data}")
            
            test_user.refresh_from_db()
            print(f"  User is_active after activate: {test_user.is_active}")
else:
    print("No test user found!")
