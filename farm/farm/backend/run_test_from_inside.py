"""Test suspend/activate from INSIDE the Railway container using curl."""
import subprocess, json

# First login
result = subprocess.run([
    'curl', '-s', 
    'https://farmerp-backend-production.up.railway.app/api/v1/auth/login/',
    '-X', 'POST',
    '-H', 'Content-Type: application/json',
    '-d', '{"username":"risingyeti","password":"risingyeti123"}'
], capture_output=True, text=True)

login_data = json.loads(result.stdout)
token = login_data.get('access', '')
print(f"Login: {'OK' if token else 'FAIL'}")
print(f"Token: {token[:50]}...")

# List users
result = subprocess.run([
    'curl', '-s',
    'https://farmerp-backend-production.up.railway.app/api/v1/auth/users/?page=1&page_size=20',
    '-H', f'Authorization: Bearer {token}'
], capture_output=True, text=True)

users_data = json.loads(result.stdout)
users = users_data.get('results', [])

# Find an active non-admin user
for u in users:
    if u['role'] != 'SUPER_ADMIN' and u['is_active']:
        test_id = u['id']
        test_name = u['username']
        print(f"\nTesting suspend on: {test_name} (ID: {test_id})")
        
        # Test with curl verbose
        result = subprocess.run([
            'curl', '-v', '-s',
            f'https://farmerp-backend-production.up.railway.app/api/v1/auth/users/{test_id}/suspend/',
            '-X', 'POST',
            '-H', 'Content-Type: application/json',
            '-H', f'Authorization: Bearer {token}'
        ], capture_output=True, text=True)
        
        print(f"STDOUT: {result.stdout[:500]}")
        print(f"STDERR: {result.stderr[:500]}")
        break
else:
    print("No active non-admin users found")
    # Test with the admin user
    admin_id = users[0]['id']
    print(f"\nTesting suspend on admin: {users[0]['username']}")
    result = subprocess.run([
        'curl', '-s', '-w', '\nHTTP_CODE: %{http_code}',
        f'https://farmerp-backend-production.up.railway.app/api/v1/auth/users/{admin_id}/suspend/',
        '-X', 'POST',
        '-H', 'Content-Type: application/json',
        '-H', f'Authorization: Bearer {token}'
    ], capture_output=True, text=True)
    print(result.stdout[:500])
