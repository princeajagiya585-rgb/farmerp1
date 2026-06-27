# FarmERP Pro — Mobile (Expo)

Field-worker companion app for the FarmERP Pro Django REST backend. Built with
React Native + Expo SDK 52, React Navigation, axios, and AsyncStorage.

## Features

- **Authentication** — JWT login with automatic access-token refresh on 401, session persisted in AsyncStorage.
- **Dashboard** — live KPI cards (farms, employees, present today, open tasks, net balance) plus an alerts feed, with pull-to-refresh.
- **GPS Attendance** — pick an employee, capture a photo with the device camera, grab the current GPS fix, and check in. Photos upload via multipart `FormData`.
- **Camera Capture** — `expo-image-picker` `launchCameraAsync` for attendance photos.
- **Offline Queue** — when a check-in POST fails (no connectivity in the field), it is saved to an offline queue in AsyncStorage and replayed later from **Profile → Sync Offline Data**. This gives offline-first capture.
- **Tasks** — list assigned tasks with status/priority/progress; update progress (±10%) or submit a task.
- **Profile** — user name/role, current API base, pending offline-action count, sync, and logout.

## Tech / Project Layout

```
mobile/
  App.js                      # entry: providers + NavigationContainer + root navigator
  app.json                    # Expo config (permissions, plugins, newArch)
  babel.config.js
  package.json
  src/
    config.js                 # API_BASE constant (edit per environment)
    api/client.js             # axios instance, interceptors, login/logout/getStored
    context/AuthContext.js    # AuthProvider + useAuth
    context/OfflineContext.js # offline queue: enqueue() / flush()
    navigation/AppNavigator.js# AuthStack (Login) + AppTabs (bottom tabs)
    components/ui.js           # Card, PrimaryButton, ScreenContainer, StatCard, theme
    screens/
      LoginScreen.js
      DashboardScreen.js
      AttendanceScreen.js
      TasksScreen.js
      ProfileScreen.js
```

## Install & Run

```bash
cd mobile
npm install
npx expo start
```

Then press `a` (Android emulator), `i` (iOS simulator), or scan the QR with
Expo Go on a physical device.

## Configure the API base URL

Edit `API_BASE` in `src/config.js` to match where your Django backend runs:

| Target                | API_BASE                                   |
|-----------------------|--------------------------------------------|
| Android emulator      | `http://10.0.2.2:8000/api/v1`              |
| iOS simulator         | `http://localhost:8000/api/v1`             |
| Physical device       | `http://<YOUR-MACHINE-LAN-IP>:8000/api/v1` |

For physical devices, run Django bound to all interfaces:
`python manage.py runserver 0.0.0.0:8000`, and make sure the phone is on the
same network as your dev machine.

## Demo Login

```
username: admin
password: Passw0rd!
```

(The login form is prefilled with these values.)

## Notes / Roadmap

- **Push notifications (FCM):** can be added with `expo-notifications` — register
  for a push token after login and send it to the backend, then handle incoming
  task/attendance alerts. Not wired up in this build.
- The offline queue replays JSON payloads. Photos captured while offline are best
  re-attached on the next online check-in (multipart bodies are not persisted).
