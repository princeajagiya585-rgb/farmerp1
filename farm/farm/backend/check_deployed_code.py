"""Use railway run to check what code is deployed."""
# Check UserViewSet source
import inspect
from apps.accounts.views import UserViewSet

# Get source for suspend and activate methods
try:
    suspend_src = inspect.getsource(UserViewSet.suspend)
    print("=== SUSPEND method found ===")
    print(suspend_src[:300])
except AttributeError:
    print("=== SUSPEND method NOT FOUND ===")

try:
    activate_src = inspect.getsource(UserViewSet.activate)
    print("=== ACTIVATE method found ===")
    print(activate_src[:300])
except AttributeError:
    print("=== ACTIVATE method NOT FOUND ===")

# List all action methods
print("\n=== All UserViewSet methods ===")
for name in sorted(dir(UserViewSet)):
    if name.startswith('_'): 
        continue
    obj = getattr(UserViewSet, name)
    if callable(obj) and hasattr(obj, 'actions'):
        print(f"  {name}: actions={obj.actions}")
    elif callable(obj) and hasattr(obj, 'detail'):
        print(f"  {name}: detail={obj.detail}")
