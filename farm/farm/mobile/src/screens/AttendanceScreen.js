import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { ScreenContainer, Card, PrimaryButton, theme } from '../components/ui';
import client from '../api/client';
import { useOffline } from '../context/OfflineContext';

export default function AttendanceScreen() {
  const { enqueue } = useOffline();
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [selected, setSelected] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success'|'error'|'info', text }

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/workforce/employees/');
        setEmployees(res.data?.results || []);
      } catch (e) {
        setStatus({ type: 'error', text: 'Could not load employees.' });
      } finally {
        setLoadingEmployees(false);
      }
    })();
  }, []);

  const capturePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera permission is required to capture a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.length) {
      setPhoto(result.assets[0]);
      setStatus({ type: 'info', text: 'Photo captured.' });
    }
  };

  const getLocation = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      throw new Error('Location permission denied.');
    }
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return loc.coords;
  };

  const checkIn = async () => {
    if (!selected) {
      setStatus({ type: 'error', text: 'Select an employee first.' });
      return;
    }
    setSubmitting(true);
    setStatus(null);

    let coords;
    try {
      coords = await getLocation();
    } catch (e) {
      setSubmitting(false);
      setStatus({ type: 'error', text: e.message || 'Could not get GPS location.' });
      return;
    }

    const fields = {
      employee: selected.id,
      farm: selected.farm,
      check_in_lat: coords.latitude,
      check_in_lng: coords.longitude,
    };

    let res;
    try {
      if (photo) {
        const form = new FormData();
        Object.entries(fields).forEach(([k, v]) => form.append(k, String(v)));
        form.append('check_in_photo', {
          uri: photo.uri,
          name: photo.fileName || 'check_in.jpg',
          type: photo.mimeType || 'image/jpeg',
        });
        res = await client.post('/workforce/attendance/check_in/', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        res = await client.post('/workforce/attendance/check_in/', fields);
      }
      setStatus({
        type: 'success',
        text: `✅ Checked in ${selected.name} at ${res.data?.location_name || `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`}.`,
      });
      setPhoto(null);
    } catch (e) {
      // Offline-first: queue the check-in (JSON fields) for later sync.
      await enqueue({ url: '/workforce/attendance/check_in/', method: 'post', data: fields });
      setStatus({
        type: 'info',
        text: 'No connection — check-in saved offline and will sync from Profile > Sync.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <Text style={styles.h1}>Attendance</Text>

      <Text style={styles.h2}>Select Employee</Text>
      {loadingEmployees ? (
        <ActivityIndicator color={theme.primary} />
      ) : employees.length === 0 ? (
        <Card>
          <Text style={styles.muted}>No employees available.</Text>
        </Card>
      ) : (
        employees.map((emp) => {
          const active = selected?.id === emp.id;
          return (
            <TouchableOpacity
              key={emp.id}
              activeOpacity={0.8}
              onPress={() => setSelected(emp)}
            >
              <Card style={active ? styles.selectedCard : null}>
                <Text style={styles.empName}>{emp.name}</Text>
                <Text style={styles.muted}>
                  {emp.employee_code ? `Code: ${emp.employee_code}` : ''}
                  {emp.farm ? `  ·  Farm #${emp.farm}` : ''}
                </Text>
              </Card>
            </TouchableOpacity>
          );
        })
      )}

      <Text style={styles.h2}>Photo (optional)</Text>
      {photo ? (
        <Image source={{ uri: photo.uri }} style={styles.preview} />
      ) : null}
      <PrimaryButton title="📷  Capture Photo" variant="outline" onPress={capturePhoto} />

      <View style={{ height: 8 }} />
      <PrimaryButton title="📍  GPS Check-In" onPress={checkIn} loading={submitting} />

      {status ? (
        <Card
          style={[
            styles.statusCard,
            status.type === 'success'
              ? { borderLeftColor: theme.primary }
              : status.type === 'error'
              ? { borderLeftColor: theme.danger }
              : { borderLeftColor: '#f59e0b' },
          ]}
        >
          <Text style={styles.statusText}>{status.text}</Text>
        </Card>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: '800', color: theme.text, marginBottom: 8 },
  h2: { fontSize: 16, fontWeight: '700', color: theme.text, marginTop: 12, marginBottom: 6 },
  muted: { color: theme.muted, marginTop: 2 },
  empName: { fontSize: 16, fontWeight: '600', color: theme.text },
  selectedCard: { borderColor: theme.primary, borderWidth: 2 },
  preview: { width: '100%', height: 180, borderRadius: 12, marginBottom: 8 },
  statusCard: { borderLeftWidth: 4, marginTop: 16 },
  statusText: { color: theme.text },
});
