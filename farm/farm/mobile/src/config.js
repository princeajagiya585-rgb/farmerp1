// API base URL for the FarmERP Pro backend (Django REST).
//
// Pick the right host depending on where you run the app:
//   - Android emulator:  http://10.0.2.2:8000/api/v1  (10.0.2.2 = host machine loopback)
//   - iOS simulator:     http://localhost:8000/api/v1
//   - Physical device:   http://<YOUR-MACHINE-LAN-IP>:8000/api/v1  (e.g. http://192.168.1.42:8000/api/v1)
//
// The device must be able to reach your dev machine on the network, and the
// Django dev server must be started bound to 0.0.0.0 (e.g. `python manage.py runserver 0.0.0.0:8000`).
// Set to this PC's Wi-Fi LAN IP so a physical phone on the same network can reach the backend.
export const API_BASE = "http://192.168.1.9:8000/api/v1";
