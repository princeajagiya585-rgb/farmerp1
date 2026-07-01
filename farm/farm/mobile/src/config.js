// API base URL for the FarmERP Pro backend (Django REST).
//
// The app reads from EXPO_PUBLIC_API_URL at build time. If not set, it falls back
// to the default dev value below. For production builds, set:
//   EXPO_PUBLIC_API_URL=https://farmerp-backend-production.up.railway.app/api/v1
//
// Pick the right host depending on where you run the app:
//   - Android emulator:  http://10.0.2.2:8000/api/v1  (10.0.2.2 = host machine loopback)
//   - iOS simulator:     http://localhost:8000/api/v1
//   - Physical device:   http://<YOUR-MACHINE-LAN-IP>:8000/api/v1  (e.g. http://192.168.1.42:8000/api/v1)
//
// The device must be able to reach your dev machine on the network, and the
// Django dev server must be started bound to 0.0.0.0 (e.g. `python manage.py runserver 0.0.0.0:8000`).

export const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.9:8000/api/v1";
