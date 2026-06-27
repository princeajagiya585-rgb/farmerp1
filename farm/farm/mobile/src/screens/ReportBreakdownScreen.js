import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextInput,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { ScreenContainer, Card, PrimaryButton, theme } from '../components/ui';
import client from '../api/client';
import { useOffline } from '../context/OfflineContext';

const SEVERITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

export default function ReportBreakdownScreen() {
  const { enqueue } = useOffline();
  const [farms, setFarms] = useState([]);
  const [loadingFarms, setLoadingFarms] = useState(true);
  const [farm, setFarm] = useState(null);
  const [machineName, setMachineName] = useState('');
  const [severity, setSeverity] = useState('HIGH');
  const [details, setDetails] = useState('');
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null); // { type, text }

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/farms/');
        const list = res.data?.results || res.data || [];
        setFarms(list);
        if (list.length === 1) setFarm(list[0]);
      } catch (e) {
        setStatus({ type: 'error', text: 'Could not load farms.' });
      } finally {
        setLoadingFarms(false);
      }
    })();
  }, []);

  const capturePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera permission is required to attach a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (!result.canceled && result.assets?.length) {
      setPhoto(result.assets[0]);
      setStatus({ type: 'info', text: 'Photo attached.' });
    }
  };

  const tryGetLocation = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return loc.coords;
    } catch (e) {
      return null;
    }
  };

  const reset = () => {
    setMachineName('');
    setSeverity('HIGH');
    setDetails('');
    setPhoto(null);
  };

  const submit = async () => {
    if (!farm) {
      setStatus({ type: 'error', text: 'Select the farm you are working on.' });
      return;
    }
    if (!machineName.trim()) {
      setStatus({ type: 'error', text: 'Enter which machine crashed.' });
      return;
    }
    if (!details.trim()) {
      setStatus({ type: 'error', text: 'Describe what happened.' });
      return;
    }

    setSubmitting(true);
    setStatus(null);

    const coords = await tryGetLocation();
    const fields = {
      farm: farm.id,
      machine_name: machineName.trim(),
      severity,
      details: details.trim(),
    };
    if (coords) {
      fields.latitude = coords.latitude;
      fields.longitude = coords.longitude;
    }

    try {
      if (photo) {
        const form = new FormData();
        Object.entries(fields).forEach(([k, v]) => form.append(k, String(v)));
        form.append('photo', {
          uri: photo.uri,
          name: photo.fileName || 'breakdown.jpg',
          type: photo.mimeType || 'image/jpeg',
        });
        await client.post('/breakdowns/reports/', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await client.post('/breakdowns/reports/', fields);
      }
      setStatus({
        type: 'success',
        text: 'Reported. Your manager and the admins have been notified.',
      });
      reset();
    } catch (e) {
      // Offline-first: queue the report (without photo) for later sync.
      await enqueue({ url: '/breakdowns/reports/', method: 'post', data: fields });
      setStatus({
        type: 'info',
        text: 'No connection — report saved offline and will sync from Profile > Sync.',
      });
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <Text style={styles.h1}>Report Breakdown</Text>
      <Text style={styles.muted}>
        Working on the farm and a machine crashed? Tell the managers and admins here.
      </Text>

      <Text style={styles.h2}>Farm</Text>
      {loadingFarms ? (
        <ActivityIndicator color={theme.primary} />
      ) : farms.length === 0 ? (
        <Card>
          <Text style={styles.muted}>No farms assigned to you.</Text>
        </Card>
      ) : (
        farms.map((f) => {
          const active = farm?.id === f.id;
          return (
            <TouchableOpacity key={f.id} activeOpacity={0.8} onPress={() => setFarm(f)}>
              <Card style={active ? styles.selectedCard : null}>
                <Text style={styles.itemName}>{f.name}</Text>
                {f.location ? <Text style={styles.muted}>{f.location}</Text> : null}
              </Card>
            </TouchableOpacity>
          );
        })
      )}

      <Text style={styles.h2}>Machine</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. John Deere 5050D Tractor"
        placeholderTextColor={theme.muted}
        value={machineName}
        onChangeText={setMachineName}
      />

      <Text style={styles.h2}>Severity</Text>
      <View style={styles.severityRow}>
        {SEVERITIES.map((s) => {
          const active = severity === s.value;
          return (
            <TouchableOpacity
              key={s.value}
              activeOpacity={0.8}
              onPress={() => setSeverity(s.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.h2}>What happened?</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        placeholder="Describe the breakdown — what you saw, heard, when it happened…"
        placeholderTextColor={theme.muted}
        value={details}
        onChangeText={setDetails}
        multiline
      />

      <Text style={styles.h2}>Photo (recommended)</Text>
      {photo ? <Image source={{ uri: photo.uri }} style={styles.preview} /> : null}
      <PrimaryButton title="📷  Capture Photo" variant="outline" onPress={capturePhoto} />

      <View style={{ height: 8 }} />
      <PrimaryButton title="🚨  Send Report" onPress={submit} loading={submitting} />

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
  h1: { fontSize: 26, fontWeight: '800', color: theme.text, marginBottom: 4 },
  h2: { fontSize: 16, fontWeight: '700', color: theme.text, marginTop: 14, marginBottom: 6 },
  muted: { color: theme.muted, marginTop: 2 },
  itemName: { fontSize: 16, fontWeight: '600', color: theme.text },
  selectedCard: { borderColor: theme.primary, borderWidth: 2 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.text,
    backgroundColor: '#fff',
  },
  textarea: { height: 110, textAlignVertical: 'top' },
  severityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { color: theme.text, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  preview: { width: '100%', height: 180, borderRadius: 12, marginBottom: 8 },
  statusCard: { borderLeftWidth: 4, marginTop: 16 },
  statusText: { color: theme.text },
});
