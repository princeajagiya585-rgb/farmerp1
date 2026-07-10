"""Re-test suspend/activate endpoints now that we know routes exist."""

import json
import ssl
import urllib.request
import urllib.error

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE = "https://farmerp-backend-production.up.railway.app/api/v1"


def req(method, url, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(r, context=ctx)
        return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, body[:500]


# Login
status, data = req("POST", f"{BASE}/auth/login/",
                   {"username": "risingyeti", "password": "risingyeti123"})
print(f"Login: HTTP {status}")
token = data["access"]
print(f"Token: {token[:50]}...\n")

# List users to find a non-admin user
status, data = req("GET", f"{BASE}/auth/users/?page=1&page_size=20", token=token)
users = data.get("results", [])

non_admin = [u for u in users if u["role"] != "SUPER_ADMIN" and u["is_active"]]
print(f"Active non-admin users: {len(non_admin)}")
for u in non_admin:
    print(f"  ID={u['id']} user={u['username']} role={u['role']}")

if non_admin:
    test_user = non_admin[0]
    print(f"\n=== Testing SUSPEND on '{test_user['username']}' ===")
    print(f"URL: POST {BASE}/auth/users/{test_user['id']}/suspend/")
    status, data = req("POST", f"{BASE}/auth/users/{test_user['id']}/suspend/", token=token)
    print(f"HTTP {status}")
    if isinstance(data, dict):
        print(f"JSON Response: {json.dumps(data, indent=2)[:500]}")
    else:
        print(f"Raw Response: {data[:500]}")

    if status == 200:
        print(f"\n=== Testing ACTIVATE on '{test_user['username']}' ===")
        status, data = req("POST", f"{BASE}/auth/users/{test_user['id']}/activate/", token=token)
        print(f"HTTP {status}")
        if isinstance(data, dict):
            print(f"JSON Response: {json.dumps(data, indent=2)[:500]}")
        else:
            print(f"Raw Response: {data[:500]}")
else:
    print("\nNo active non-admin users found!")
    # Try with the SUPER_ADMIN user to see what happens
    print("\n=== Testing SUSPEND on myself (SUPER_ADMIN) ===")
    my_id = data["user"]["id"] if "user" in locals() else users[0]["id"]
    status, data = req("POST", f"{BASE}/auth/users/{my_id}/suspend/", token=token)
    print(f"HTTP {status}")
    if isinstance(data, dict):
        print(f"Response: {json.dumps(data, indent=2)[:500]}")
    else:
        print(f"Raw: {data[:500]}")
