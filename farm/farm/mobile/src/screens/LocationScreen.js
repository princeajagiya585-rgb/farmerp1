import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Linking,
  Image,
  Alert,
  Modal,
  ScrollView,
  BackHandler,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { ScreenContainer, Card, theme, Badge, PrimaryButton } from '../components/ui';
import client from '../api/client';
import { connectLocationStream } from '../lib/realtime';
import { exportCSV } from '../lib/export';

const INDIA_EMBED =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d30773484.55170563!2d61.0245165611659!3d19.69009515037612!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x30635ff06b92b791%3A0xd78c4fa1854213a6!2sIndia!5e0!3m2!1sen!2sin!4v1781959490463!5m2!1sen!2sin';

/** Photo thumbnail with broken-image fallback. */
function PhotoThumb({ uri, size = 48 }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={[styles.photoThumb, { width: size, height: size }]}>
        <Text style={styles.photoThumbIcon}>📷</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[styles.photoThumb, { width: size, height: size }]}
      onError={() => setFailed(true)}
    />
  );
}

export default function LocationScreen() {
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [sendingDuringWork, setSendingDuringWork] = useState(false);
  const [pings, setPings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckin, setLastCheckin] = useState(null);
  const [lastCheckout, setLastCheckout] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [currentAddress, setCurrentAddress] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [wsStatus, setWsStatus] = useState('connecting');

  // Modal state
  const [modalType, setModalType] = useState(null); // 'checkin' | 'during' | 'checkout'
  const [modalVisible, setModalVisible] = useState(false);
  const [modalPhoto, setModalPhoto] = useState(null);
  const [modalPhotoPreview, setModalPhotoPreview] = useState(null);
  const [modalMsg, setModalMsg] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState('');

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const webViewRef = useRef(null);
  const wsCleanup = useRef(null);

  const showToast = (msg, isError = false) => {
    setSuccessMsg(msg);
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(3000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setSuccessMsg(''));
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await client.get('/gps/pings/', { params: { page_size: 20, ordering: '-recorded_at' } });
      setPings(res.data?.results || []);
      // Find latest checkin and checkout
      const all = res.data?.results || [];
      const lastIn = all.find((p) => p.activity === 'CHECKIN');
      const lastOut = all.find((p) => p.activity === 'CHECKOUT');
      if (lastIn) setLastCheckin(lastIn);
      if (lastOut) setLastCheckout(lastOut);
    } catch (e) {
      setError('Could not load location history. Pull to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load tasks for task picker
  const loadTasks = useCallback(async () => {
    try {
      const res = await client.get('/tasks/', { params: { page_size: 200 } });
      const all = res.data?.results || [];
      // Only show active tasks (not completed/cancelled/verified)
      const active = all.filter((tk) => !['CANCELLED', 'COMPLETED', 'VERIFIED', 'SUBMITTED'].includes(tk.status));
      setTasks(active);
    } catch {
      // ignore
    }
  }, []);

  // ── WebSocket for real-time ping updates ───────────────────────────
  useEffect(() => {
    load();
    loadTasks();

    wsCleanup.current = connectLocationStream({
      onMessage: (ping) => {
        if (ping._type === 'field_activity') return;
        setPings((prev) => {
          if (prev.some((p) => p.id === ping.id)) return prev;
          const next = [ping, ...prev];
          return next.slice(0, 20);
        });
        if (ping.activity === 'CHECKIN') {
          setLastCheckin(ping);
        }
        if (ping.activity === 'CHECKOUT') {
          setLastCheckout(ping);
        }
      },
      onStatus: (status) => setWsStatus(status),
    });

    return () => {
      if (wsCleanup.current) wsCleanup.current();
    };
  }, [load, loadTasks]);

  const webViewCanGoBackRef = useRef(false);

  // ── Android back button: WebView go back or exit confirm ──────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onBackPress = () => {
      if (webViewCanGoBackRef.current && webViewRef.current) {
        webViewRef.current.goBack();
        return true; // Prevent default, handled by WebView
      }
      // No WebView history — show exit confirmation
      Alert.alert('Do you want to exit?', '', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: () => BackHandler.exitApp(),
        },
      ]);
      return true; // Prevent default back behavior
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // ── Location helpers ────────────────────────────────────────────────
  const requestLocationPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Location Permission Required',
        'Please enable location access in your device settings to use this feature.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const getPosition = async () => {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return null;
    try {
      return await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 15000,
      });
    } catch {
      return null;
    }
  };

  const capturePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera Permission Required', 'Please enable camera access in your device settings.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.length) {
      setModalPhoto(result.assets[0]);
      setModalPhotoPreview(result.assets[0].uri);
    }
  };

  // ── Open modal for a work phase ─────────────────────────────────────
  const openModal = async (type) => {
    setModalType(type);
    setModalPhoto(null);
    setModalPhotoPreview(null);
    setModalMsg(null);
    setSelectedTask('');
    setModalLoading(true);
    setModalVisible(true);

    // Refresh tasks
    await loadTasks();

    // Get fresh location
    const pos = await getPosition();
    if (pos) {
      setCurrentCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        checkedInAt: new Date(),
      });
    }
    setModalLoading(false);
  };

  // ── Submit the work phase ───────────────────────────────────────────
  const submitWorkPhase = async () => {
    if (!currentCoords) {
      setModalMsg({ type: 'error', text: 'Could not get GPS location. Try again.' });
      return;
    }

    const isCheckin = modalType === 'checkin';
    const isDuring = modalType === 'during';
    const isCheckout = modalType === 'checkout';

    if (isCheckin) setCheckingIn(true);
    if (isDuring) setSendingDuringWork(true);
    if (isCheckout) setCheckingOut(true);

    setModalMsg(null);

    try {
      const lat = Number(currentCoords.lat.toFixed(6));
      const lng = Number(currentCoords.lng.toFixed(6));
      const accuracy = Math.round(currentCoords.accuracy);

      let activity;
      if (isCheckin) activity = 'CHECKIN';
      else if (isDuring) activity = 'DURING_WORK';
      else activity = 'CHECKOUT';

      const payload = {
        latitude: lat,
        longitude: lng,
        accuracy,
        activity,
        ...(selectedTask ? { task: selectedTask } : {}),
      };

      let result;
      if (modalPhoto) {
        const form = new FormData();
        Object.entries(payload).forEach(([k, v]) => form.append(k, String(v)));
        form.append('photo', {
          uri: modalPhoto.uri,
          name: modalPhoto.fileName || `${activity.toLowerCase()}.jpg`,
          type: modalPhoto.mimeType || 'image/jpeg',
        });
        result = await client.post('/gps/pings/', form);
      } else {
        result = await client.post('/gps/pings/', payload);
      }

      const msg = result.data?.location_name
        ? `📍 ${result.data.location_name}`
        : `✅ ${activity === 'CHECKIN' ? 'Checked in' : activity === 'DURING_WORK' ? 'During work' : 'Checked out'} at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      setModalMsg({ type: 'success', text: msg });
      showToast(msg);

      if (isCheckin) setLastCheckin(result.data);
      if (isCheckout) setLastCheckout(result.data);

      // Close modal after brief delay
      setTimeout(() => {
        setModalVisible(false);
        load();
      }, 1500);
    } catch (e) {
      const errMsg = e?.response?.data?.detail || e?.message || 'Request failed. Try again.';
      setModalMsg({ type: 'error', text: errMsg });
    } finally {
      setCheckingIn(false);
      setSendingDuringWork(false);
      setCheckingOut(false);
    }
  };

  const openInMaps = (lat, lng) => {
    const coords = `${lat},${lng}`;
    let url;
    if (Platform.OS === 'android') {
      // Android: use geo: URI to open in Google Maps app directly
      url = `geo:0,0?q=${coords}`;
    } else {
      // iOS: use maps URL scheme for Apple Maps, fall back to Google Maps web
      url = `maps://app?ll=${coords}&q=${coords}`;
    }
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        }
        // Fallback: open in browser
        const fallbackUrl = `https://www.google.com/maps?q=${coords}`;
        return Linking.openURL(fallbackUrl);
      })
      .catch(() => showToast('⚠️ Could not open Maps. Please check your map app is installed.'));
  };



  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      scroll
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Location</Text>
        <View style={styles.headerRight}>
          {wsStatus === 'connected' && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          )}
          {wsStatus === 'reconnecting' && (
            <Text style={styles.connectingText}>Reconnecting…</Text>
          )}
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Success Toast */}
      {successMsg ? (
        <Animated.View style={[styles.toast, { opacity: toastOpacity, backgroundColor: '#16a34a' }]}>
          <Text style={styles.toastText}>{successMsg}</Text>
        </Animated.View>
      ) : null}

      {/* Google Maps */}
      <Card style={styles.mapCard}>
        <View style={styles.mapContainer}>
          <WebView
            ref={webViewRef}
            source={{ html: `<iframe src="${INDIA_EMBED}" width="100%" height="100%" style="border:0;border-radius:12px" allowfullscreen loading="lazy"></iframe>` }}
            style={styles.map}
            scrollEnabled={false}
            bounces={false}
            onNavigationStateChange={(navState) => { webViewCanGoBackRef.current = navState.canGoBack; }}
          />
        </View>
        {(lastCheckin || currentCoords) && (
          <View style={styles.lastPinBadge}>
            <Text style={styles.lastPinText}>
              📍{' '}
              {currentCoords
                ? `${currentCoords.lat.toFixed(4)}, ${currentCoords.lng.toFixed(4)}`
                : `${Number(lastCheckin.latitude).toFixed(4)}, ${Number(lastCheckin.longitude).toFixed(4)}`
              }
            </Text>
          </View>
        )}
      </Card>

      {/* ── Three Work Phase Buttons ─────────────────────────────────── */}
      <View style={styles.workButtons}>
        <TouchableOpacity
          style={[styles.workBtn, styles.workBtnCheckin]}
          onPress={() => openModal('checkin')}
          disabled={checkingIn}
          activeOpacity={0.85}
        >
          {checkingIn ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.workBtnIcon}>📥</Text>
              <Text style={styles.workBtnLabel}>Before Work</Text>
              <Text style={styles.workBtnSub}>Check In</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.workBtn, styles.workBtnDuring]}
          onPress={() => openModal('during')}
          disabled={sendingDuringWork}
          activeOpacity={0.85}
        >
          {sendingDuringWork ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.workBtnIcon}>🔄</Text>
              <Text style={styles.workBtnLabel}>During Work</Text>
              <Text style={styles.workBtnSub}>Mid-shift</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.workBtn, styles.workBtnCheckout]}
          onPress={() => openModal('checkout')}
          disabled={checkingOut}
          activeOpacity={0.85}
        >
          {checkingOut ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.workBtnIcon}>📤</Text>
              <Text style={styles.workBtnLabel}>Completed Work</Text>
              <Text style={styles.workBtnSub}>Check Out</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Current Location Card */}
      {currentCoords && (
        <Card style={styles.currentLocationCard}>
          <View style={styles.currentLocHeader}>
            <Text style={styles.currentLocIcon}>📍</Text>
            <View style={styles.currentLocBody}>
              <Text style={styles.currentLocTitle}>Current Location</Text>
              {currentAddress ? (
                <Text style={styles.currentLocAddress} numberOfLines={2}>{currentAddress}</Text>
              ) : null}
              <Text style={styles.currentLocCoords}>
                {currentCoords.lat.toFixed(6)}, {currentCoords.lng.toFixed(6)}
              </Text>
            </View>
            <Text style={styles.currentLocTime}>
              {currentCoords.checkedInAt.toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit', second: '2-digit',
              })}
            </Text>
          </View>
          <View style={styles.currentLocDetails}>
            <View style={styles.currentLocStat}>
              <Text style={styles.currentLocStatValue}>{currentCoords.lat.toFixed(4)}°N</Text>
              <Text style={styles.currentLocStatLabel}>Latitude</Text>
            </View>
            <View style={styles.currentLocDivider} />
            <View style={styles.currentLocStat}>
              <Text style={styles.currentLocStatValue}>{currentCoords.lng.toFixed(4)}°E</Text>
              <Text style={styles.currentLocStatLabel}>Longitude</Text>
            </View>
            <View style={styles.currentLocDivider} />
            <View style={styles.currentLocStat}>
              <Text style={styles.currentLocStatValue}>
                {currentCoords.accuracy < 1 ? '<1' : Math.round(currentCoords.accuracy)}m
              </Text>
              <Text style={styles.currentLocStatLabel}>Accuracy</Text>
            </View>
          </View>
        </Card>
      )}

      {/* Open Map Link */}
      {(lastCheckin || currentCoords) && (
        <TouchableOpacity
          style={styles.mapLinkBtn}
          onPress={() =>
            openInMaps(
              currentCoords ? currentCoords.lat : lastCheckin.latitude,
              currentCoords ? currentCoords.lng : lastCheckin.longitude,
            )
          }
          activeOpacity={0.85}
        >
          <Text style={styles.mapLinkIcon}>🗺️</Text>
          <Text style={styles.mapLinkText}>View on Google Maps</Text>
        </TouchableOpacity>
      )}

      {/* Export button */}
      {pings.length > 0 && (
        <PrimaryButton
          title="📊  Export Location History (CSV)"
          variant="outline"
          onPress={async () => {
            try {
              await exportCSV(
                pings,
                [
                  { key: 'activity', header: 'Activity' },
                  { key: 'latitude', header: 'Latitude' },
                  { key: 'longitude', header: 'Longitude' },
                  { key: 'location_name', header: 'Location' },
                  { key: 'recorded_at', header: 'Timestamp' },
                ],
                'location-history.csv',
              );
            } catch (e) {
              showToast('⚠️ Could not export data.');
            }
          }}
        />
      )}

      {/* Quick Stats */}
      <Card>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{pings.length}</Text>
            <Text style={styles.statLabel}>Total Pings</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{pings.filter((p) => p.activity === 'CHECKIN').length}</Text>
            <Text style={styles.statLabel}>Check-ins</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{pings.filter((p) => p.activity === 'CHECKOUT').length}</Text>
            <Text style={styles.statLabel}>Check-outs</Text>
          </View>
        </View>
      </Card>

      {/* Location History with Photos */}
      <Text style={styles.h2}>
        Recent Pings
        {lastCheckin ? ` · Latest ${new Date(lastCheckin.recorded_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
      </Text>

      {pings.length === 0 ? (
        <Card>
          <Text style={styles.muted}>
            No location data yet. Tap "Before Work" above to check in.
          </Text>
        </Card>
      ) : (
        pings.map((ping) => (
          <Card key={ping.id}>
            <View style={styles.pingRow}>
              <PhotoThumb uri={ping.photo} size={48} />
              <View style={styles.pingLeft}>
                {ping.location_name ? (
                  <Text style={styles.pingAddress} numberOfLines={1}>{ping.location_name}</Text>
                ) : null}
                <Text style={styles.pingCoords}>
                  {Number(ping.latitude).toFixed(4)}, {Number(ping.longitude).toFixed(4)}
                </Text>
                <View style={styles.pingMeta}>
                  <Badge
                    label={ping.activity || '—'}
                    color={ping.activity === 'CHECKIN' ? 'green' : ping.activity === 'CHECKOUT' ? 'red' : ping.activity === 'DURING_WORK' ? 'purple' : 'gray'}
                  />
                  <Text style={styles.pingTime}>
                    {ping.recorded_at ? new Date(ping.recorded_at).toLocaleString() : '—'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.viewMapBtn}
                onPress={() => openInMaps(ping.latitude, ping.longitude)}
                activeOpacity={0.7}
              >
                <Text style={styles.viewMapBtnText}>View</Text>
              </TouchableOpacity>
            </View>
            {ping.task_title ? (
              <Text style={styles.pingTask}>📋 {ping.task_title}</Text>
            ) : null}
          </Card>
        ))
      )}

      {/* ── Work Phase Modal ──────────────────────────────────────────── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {modalType === 'checkin' ? '📥 Before Work — Check In' :
                   modalType === 'during' ? '🔄 During Work — Mid-shift' :
                   '📤 Completed Work — Check Out'}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {modalMsg && (
                <Card style={modalMsg.type === 'success' ? styles.msgSuccess : styles.msgError}>
                  <Text style={styles.msgText}>{modalMsg.text}</Text>
                </Card>
              )}

              {/* Location status */}
              {modalLoading ? (
                <Card>
                  <ActivityIndicator size="small" color={theme.primary} />
                  <Text style={styles.modalLocationText}>Getting current location...</Text>
                </Card>
              ) : currentCoords ? (
                <Card style={styles.locationCard}>
                  <Text style={styles.locationLabel}>📍 Current Location</Text>
                  <Text style={styles.locationCoords}>
                    {currentCoords.lat.toFixed(6)}, {currentCoords.lng.toFixed(6)}
                  </Text>
                  <Text style={styles.locationAccuracy}>
                    Accuracy: {Math.round(currentCoords.accuracy)}m
                  </Text>
                </Card>
              ) : (
                <Card style={styles.locationCardError}>
                  <Text style={styles.locationErrorText}>
                    ⚠️ Could not get GPS location. Make sure location is enabled.
                  </Text>
                </Card>
              )}

              {/* Task picker */}
              <Text style={styles.modalSectionTitle}>📋 Select Task (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.taskScroll}>
                <TouchableOpacity
                  style={[styles.taskChip, !selectedTask ? styles.taskChipActive : null]}
                  onPress={() => setSelectedTask('')}
                >
                  <Text style={[styles.taskChipText, !selectedTask ? styles.taskChipTextActive : null]}>
                    No task
                  </Text>
                </TouchableOpacity>
                {tasks.map((tk) => (
                  <TouchableOpacity
                    key={tk.id}
                    style={[styles.taskChip, selectedTask === String(tk.id) ? styles.taskChipActive : null]}
                    onPress={() => setSelectedTask(String(tk.id))}
                  >
                    <Text style={[styles.taskChipText, selectedTask === String(tk.id) ? styles.taskChipTextActive : null]}>
                      {tk.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Photo capture */}
              <Text style={styles.modalSectionTitle}>📷 Take Photo</Text>
              {modalPhotoPreview ? (
                <View style={styles.photoPreviewContainer}>
                  <Image source={{ uri: modalPhotoPreview }} style={styles.photoPreview} />
                  <TouchableOpacity
                    style={styles.photoRetake}
                    onPress={capturePhoto}
                  >
                    <Text style={styles.photoRetakeText}>Retake</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <PrimaryButton
                  title="📷  Capture Photo"
                  variant="outline"
                  onPress={capturePhoto}
                />
              )}

              {/* Submit button */}
              <PrimaryButton
                title={
                  modalType === 'checkin' ? '📍 Confirm Check In' :
                  modalType === 'during' ? '🔄 Submit Mid-shift' :
                  '📤 Confirm Check Out'
                }
                onPress={submitWorkPhase}
                loading={checkingIn || sendingDuringWork || checkingOut}
                disabled={!currentCoords}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 26, fontWeight: '800', color: theme.text, marginBottom: 8 },
  h2: { fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 8, marginBottom: 8 },
  muted: { color: theme.muted },
  error: { color: theme.danger, marginBottom: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#dcfce7',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#16a34a', marginRight: 5 },
  liveText: { fontSize: 11, fontWeight: '700', color: '#16a34a', letterSpacing: 0.5 },
  connectingText: { fontSize: 11, fontWeight: '600', color: '#d97706' },
  mapCard: { padding: 0, overflow: 'hidden' },
  mapContainer: { height: 260, width: '100%' },
  map: { borderRadius: 16 },
  lastPinBadge: {
    position: 'absolute', bottom: 8, left: 8,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  lastPinText: { fontSize: 12, fontWeight: '600', color: '#1f2937' },

  // ── Work Phase Buttons ──────────────────────────────────────────────
  workButtons: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  workBtn: {
    flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  workBtnCheckin: { backgroundColor: '#2563eb' },
  workBtnDuring: { backgroundColor: '#9333ea' },
  workBtnCheckout: { backgroundColor: '#16a34a' },
  workBtnIcon: { fontSize: 20, marginBottom: 2 },
  workBtnLabel: { color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  workBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 1 },

  // ── Current Location Card ──────────────────────────────────────────
  currentLocationCard: {
    borderLeftWidth: 4, borderLeftColor: theme.primary, backgroundColor: '#f0fdf4',
  },
  currentLocHeader: { flexDirection: 'row', alignItems: 'center' },
  currentLocIcon: { fontSize: 24, marginRight: 12 },
  currentLocBody: { flex: 1 },
  currentLocTitle: { fontSize: 16, fontWeight: '800', color: theme.primaryDark },
  currentLocAddress: { fontSize: 13, color: theme.primaryDark, fontWeight: '600', marginTop: 2, lineHeight: 18 },
  currentLocCoords: { fontSize: 13, color: theme.muted, marginTop: 2, fontFamily: 'monospace' },
  currentLocTime: { fontSize: 12, color: theme.primary, fontWeight: '600', marginTop: 2 },
  currentLocDetails: { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#dcfce7' },
  currentLocStat: { flex: 1, alignItems: 'center' },
  currentLocStatValue: { fontSize: 18, fontWeight: '700', color: theme.text },
  currentLocStatLabel: { fontSize: 11, color: theme.muted, marginTop: 2 },
  currentLocDivider: { width: 1, backgroundColor: '#dcfce7' },

  // ── Map Link ────────────────────────────────────────────────────────
  mapLinkBtn: {
    flexDirection: 'row', backgroundColor: theme.card, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    borderWidth: 1.5, borderColor: theme.primary,
  },
  mapLinkIcon: { fontSize: 18, marginRight: 8 },
  mapLinkText: { color: theme.primary, fontSize: 15, fontWeight: '700' },

  // ── Stats ───────────────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: theme.text },
  statLabel: { fontSize: 12, color: theme.muted, marginTop: 2 },

  // ── Ping Row with Photo ─────────────────────────────────────────────
  pingRow: { flexDirection: 'row', alignItems: 'center' },
  photoThumb: {
    borderRadius: 8, marginRight: 10, backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  photoThumbIcon: { fontSize: 18 },
  pingLeft: { flex: 1, paddingRight: 8 },
  pingAddress: { fontSize: 12, color: theme.primary, fontWeight: '600', marginBottom: 2 },
  pingCoords: { fontSize: 14, fontWeight: '700', color: theme.text },
  pingMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  pingTime: { fontSize: 11, color: theme.muted },
  pingTask: { fontSize: 12, color: theme.primaryDark, fontWeight: '600', marginTop: 6 },
  viewMapBtn: { backgroundColor: theme.primaryLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  viewMapBtnText: { color: theme.primaryDark, fontWeight: '700', fontSize: 12 },

  // ── Toast ───────────────────────────────────────────────────────────
  toast: {
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },

  // ── Modal ───────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.text, flex: 1 },
  modalClose: { fontSize: 22, color: theme.muted, paddingLeft: 16 },

  // ── Modal Messages ──────────────────────────────────────────────────
  msgSuccess: { backgroundColor: '#f0fdf4', borderLeftWidth: 4, borderLeftColor: '#16a34a' },
  msgError: { backgroundColor: '#fef2f2', borderLeftWidth: 4, borderLeftColor: '#dc2626' },
  msgText: { fontSize: 14, fontWeight: '600', color: theme.text },

  // ── Modal Location ──────────────────────────────────────────────────
  modalLocationText: { textAlign: 'center', marginTop: 8, color: theme.muted, fontSize: 13 },
  locationCard: { backgroundColor: '#eff6ff', borderLeftWidth: 4, borderLeftColor: '#2563eb' },
  locationLabel: { fontSize: 14, fontWeight: '700', color: '#1e40af', marginBottom: 4 },
  locationCoords: { fontSize: 16, fontWeight: '800', color: theme.text, fontFamily: 'monospace' },
  locationAccuracy: { fontSize: 12, color: theme.muted, marginTop: 2 },
  locationCardError: { backgroundColor: '#fef2f2', borderLeftWidth: 4, borderLeftColor: '#dc2626' },
  locationErrorText: { fontSize: 13, fontWeight: '600', color: '#991b1b' },

  // ── Modal Task Picker ───────────────────────────────────────────────
  modalSectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginTop: 12, marginBottom: 8 },
  taskScroll: { marginBottom: 4 },
  taskChip: {
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: theme.card, marginRight: 8,
    borderWidth: 1.5, borderColor: theme.border,
  },
  taskChipActive: { borderColor: theme.primary, backgroundColor: '#f0fdf4' },
  taskChipText: { fontSize: 13, fontWeight: '600', color: theme.muted },
  taskChipTextActive: { color: theme.primaryDark },

  // ── Modal Photo ────────────────────────────────────────────────────
  photoPreviewContainer: { position: 'relative', marginBottom: 8 },
  photoPreview: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#e2e8f0' },
  photoRetake: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  photoRetakeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
