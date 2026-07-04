"""Check the actual URL patterns loaded by the running Django service."""
import django
from django.conf import settings

# Need to setup Django first
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.urls import get_resolver
from config.urls import urlpatterns

# Print all URL patterns that contain 'users'
print("=== URL patterns containing 'users' ===")
resolver = get_resolver()

def print_urls(patterns, prefix=''):
    for pattern in patterns:
        if hasattr(pattern, 'url_patterns'):
            print_urls(pattern.url_patterns, prefix + str(pattern.pattern))
        else:
            name = getattr(pattern, 'name', '')
            route = prefix + str(pattern.pattern) if prefix else str(pattern.pattern)
            if 'users' in route or 'user' in route:
                print(f"  {route:50s} name={name}")

print_urls(urlpatterns)
print()

# Also check the resolver directly
print("=== Reverse URL check ===")
from django.urls import reverse

# Try to reverse the suspend URL name
try:
    suspend_url = reverse('user-suspend', kwargs={'pk': 'test-id'})
    print(f"user-suspend URL: {suspend_url}")
except Exception as e:
    print(f"user-suspend reverse failed: {e}")

try:
    activate_url = reverse('user-activate', kwargs={'pk': 'test-id'})
    print(f"user-activate URL: {activate_url}")
except Exception as e:
    print(f"user-activate reverse failed: {e}")

# Try different URL name patterns
for name_suffix in ['suspend', 'activate']:
    for basename in ['user', 'users', 'user-list', 'user-detail']:
        url_name = f"{basename}-{name_suffix}"
        try:
            url = reverse(url_name, kwargs={'pk': 'test-id'})
            print(f"  {url_name}: {url}")
        except:
            pass
