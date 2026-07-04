"""Check if views.py has suspend/activate actions."""
import os

# Get the views.py file path
views_path = os.path.join(os.path.dirname(__file__), 'apps/accounts/views.py')

with open(views_path) as f:
    content = f.read()

# Check for suspend
if '@action(detail=True' in content and 'def suspend' in content:
    # Find the suspend section
    idx = content.index('def suspend')
    start = max(0, idx - 200)
    end = min(len(content), idx + 500)
    print("=== SUSPEND SECTION ===")
    print(content[start:end])
else:
    print("SUSPEND NOT FOUND in views.py!")

print("\n\n")

# Check for activate
if '@action(detail=True' in content and 'def activate' in content:
    idx = content.index('def activate')
    start = max(0, idx - 200)
    end = min(len(content), idx + 500)
    print("=== ACTIVATE SECTION ===")
    print(content[start:end])
else:
    print("ACTIVATE NOT FOUND in views.py!")
