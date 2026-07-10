
import os
import django
from django.urls import get_resolver

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

resolver = get_resolver()
print("All task-related URLs under api/v1/:")
for url_pattern in resolver.url_patterns:
    if getattr(url_pattern.pattern, '_route', '') == 'api/v1/':
        for inner in url_pattern.url_patterns:
            if getattr(inner.pattern, '_route', '') == 'tasks/':
                print(f"\n{inner.pattern}")
                for action in inner.url_patterns:
                    print(f"  - {action.pattern}")
