import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { ScreenContainer, Card, theme, Badge } from '../components/ui';
import client from '../api/client';
import { connectLocationStream } from '../lib/realtime';

const INDIA_EMBED =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d30773484.55170563!2d61.0245165611659!3d19.69009515037612!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x30635ff06b92b791%3A0xd78c4fa1854213a6!2sIndia!5e0!3m2!1sen!2sin!4v1781959490463!5m2!1sen!2sin';

export default function LocationScreen() {
  const [checkingIn, setCheckingIn] = useState(false);
  const [pings, setPings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckin, setLastCheckin] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [currentAddress, setCurrentAddress] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [wsStatus, setWsStatus] = useState('connecting');
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const wsCleanup = useRef(null);

  const showToast = (msg) => {
    setSuccessMsg(msg);
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setSuccessMsg(''));
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await client.get('/gps/pings/', { params: { page_size: 20 } });
      setPings(res.data?.results || []);
    } catch (e) {
      setError('Could not load location history. Pull to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ── WebSocket for real-time ping updates ───────────────────────────
  useEffect(() => {
    load();

    wsCleanup.current = connectLocationStream({
      onMessage: (ping) => {
        setPings((prev) => {
          // Don't add duplicates
          if (prev.some((p) => p.id === ping.id)) return prev;
          // Prepend the new ping, keep max 20
          const next = [ping, ...prev];
          return next.slice(0, 20);
        });
        // Also update lastCheckin if this is the most recent CHECKIN
        if (ping.activity === 'CHECKIN') {
          setLastCheckin(ping);
        }
      },
      onStatus: (status) => setWsStatus(status),
    });

    return () => {
      if (wsCleanup.current) wsCleanup.current();
    };
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const doCheckin = async () => {
    setCheckingIn(true);
    setError('');

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast('⚠️ Location permission was denied.');
        setCheckingIn(false);
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 15000,
      });

      const { latitude, longitude, accuracy } = pos.coords;
      const lat = Number(latitude.toFixed(6));
      const lng = Number(longitude.toFixed(6));

      // Show location IMMEDIATELY — before API call completes
      setCurrentCoords({ lat: latitude, lng: longitude, accuracy, checkedInAt: new Date() });
      setCurrentAddress(null);
      cardAnim.setValue(0);
      Animated.timing(cardAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();

      // Save to backend
      const result = await client.post('/gps/pings/', {
        latitude: lat,
        longitude: lng,
        accuracy: Math.round(accuracy),
        activity: 'CHECKIN',
      });

      setLastCheckin(result.data);
      // Save the address from the API response
      if (result.data?.location_name) {
        setCurrentAddress(result.data.location_name);
      }
      const addr = result.data?.location_name;
      showToast(
        addr
          ? `📍 ${addr}`
          : `✅ Checked in at ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
      );
      await load();
    } catch (e) {
      const msg =
        e?.response?.status === 400
          ? 'Invalid location data. Try again.'
          : e.message?.includes('permission')
            ? 'Location permission denied. Allow in settings.'
            : 'Could not check in. Try again.';
      setError(msg);
    } finally {
      setCheckingIn(false);
    }
  };

  const openInMaps = (lat, lng) => {
    const url = `https://www.google.com/maps?q=${lat},${lng}`;      Linking.openURL(url).catch(() => showToast('⚠️ Could not open Google Maps.'));
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
          {lastCheckin && (
            <Text style={styles.lastTime}>
              {new Date(lastCheckin.recorded_at || Date.now()).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Success/Error Toast */}
      {successMsg ? (
        <Animated.View
          style={[
            styles.toast,
            {
              opacity: toastOpacity,
              backgroundColor: successMsg.startsWith('✅') || successMsg.startsWith('📍') ? '#16a34a' : theme.danger,
            },
          ]}
        >
          <Text style={styles.toastText}>{successMsg}</Text>
        </Animated.View>
      ) : null}

      {/* Google Maps — zooms to current check-in location immediately */}
      <Card style={styles.mapCard}>
        <View style={styles.mapContainer}>
          <WebView
            source={{ html: `<iframe src="${INDIA_EMBED}" width="100%" height="100%" style="border:0;border-radius:12px" allowfullscreen loading="lazy"></iframe>` }}
            style={styles.map}
            scrollEnabled={false}
            bounces={false}
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

      {/* Check In Button */}
      <TouchableOpacity
        style={[styles.checkinBtn, checkingIn ? styles.checkinBtnDisabled : null]}
        onPress={doCheckin}
        disabled={checkingIn}
        activeOpacity={0.85}
      >
        {checkingIn ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Text style={styles.checkinBtnIcon}>📍</Text>
            <Text style={styles.checkinBtnText}>Check In</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Current Location Card — fades in immediately after check-in */}
      {currentCoords && (
        <Animated.View
          style={{
            opacity: cardAnim,
            transform: [
              {
                translateY: cardAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              },
            ],
          }}
        >
        <Card style={styles.currentLocationCard}>
          <View style={styles.currentLocHeader}>
            <Text style={styles.currentLocIcon}>📍</Text>
            <View style={styles.currentLocBody}>
              <Text style={styles.currentLocTitle}>Current Location</Text>
              {currentAddress ? (
                <Text style={styles.currentLocAddress} numberOfLines={2}>
                  {currentAddress}
                </Text>
              ) : null}
              <Text style={styles.currentLocCoords}>
                {currentCoords.lat.toFixed(6)}, {currentCoords.lng.toFixed(6)}
              </Text>
            </View>
            <Text style={styles.currentLocTime}>
              {currentCoords.checkedInAt.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
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
                {currentCoords.accuracy < 1
                  ? '<1'
                  : Math.round(currentCoords.accuracy)}
                m
              </Text>
              <Text style={styles.currentLocStatLabel}>Accuracy</Text>
            </View>
          </View>
        </Card>
        </Animated.View>
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

      {/* Quick Stats */}
      <Card>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{pings.length}</Text>
            <Text style={styles.statLabel}>Total Pings</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {pings.filter((p) => p.activity === 'CHECKIN').length}
            </Text>
            <Text style={styles.statLabel}>Check-ins</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {pings.filter((p) => p.activity === 'TASK').length}
            </Text>
            <Text style={styles.statLabel}>Task Pings</Text>
          </View>
        </View>
      </Card>

      {/* Location History */}
      <Text style={styles.h2}>
        Recent Pings
        {lastCheckin ? ` · Latest ${new Date(lastCheckin.recorded_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
      </Text>

      {pings.length === 0 ? (
        <Card>
          <Text style={styles.muted}>
            No location data yet. Tap "Check In" above to record your first location.
          </Text>
        </Card>
      ) : (
        pings.map((ping) => (
          <Card key={ping.id}>
            <View style={styles.pingRow}>
              <View style={styles.pingLeft}>
                {ping.location_name ? (
                  <Text style={styles.pingAddress} numberOfLines={1}>
                    {ping.location_name}
                  </Text>
                ) : null}
                <Text style={styles.pingCoords}>
                  {Number(ping.latitude).toFixed(4)}, {Number(ping.longitude).toFixed(4)}
                </Text>
                <View style={styles.pingMeta}>
                  <Badge
                    label={ping.activity || '—'}
                    color={ping.activity === 'CHECKIN' ? 'green' : ping.activity === 'TASK' ? 'blue' : 'gray'}
                  />
                  <Text style={styles.pingTime}>
                    {ping.recorded_at
                      ? new Date(ping.recorded_at).toLocaleString()
                      : '—'}
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
          </Card>
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 26, fontWeight: '800', color: theme.text, marginBottom: 12 },
  h2: { fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 8, marginBottom: 8 },
  muted: { color: theme.muted },
  error: { color: theme.danger, marginBottom: 8 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16a34a',
    marginRight: 5,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
    letterSpacing: 0.5,
  },
  connectingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#d97706',
  },
  lastTime: { fontSize: 13, color: theme.muted },
  mapCard: { padding: 0, overflow: 'hidden' },
  mapContainer: { height: 280, width: '100%' },
  map: { borderRadius: 16 },
  lastPinBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  lastPinText: { fontSize: 12, fontWeight: '600', color: '#1f2937' },
  checkinBtn: {
    flexDirection: 'row',
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: theme.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  checkinBtnDisabled: { opacity: 0.7 },
  checkinBtnIcon: { fontSize: 20, marginRight: 8 },
  checkinBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  mapLinkBtn: {
    flexDirection: 'row',
    backgroundColor: theme.card,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: theme.primary,
  },
  mapLinkIcon: { fontSize: 18, marginRight: 8 },
  mapLinkText: { color: theme.primary, fontSize: 15, fontWeight: '700' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: theme.text },
  statLabel: { fontSize: 12, color: theme.muted, marginTop: 2 },
  pingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pingLeft: { flex: 1, paddingRight: 8 },
  pingAddress: {
    fontSize: 12,
    color: theme.primary,
    fontWeight: '600',
    marginBottom: 2,
  },
  pingCoords: { fontSize: 14, fontWeight: '700', color: theme.text },
  pingMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  pingTime: { fontSize: 12, color: theme.muted },
  viewMapBtn: {
    backgroundColor: theme.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  viewMapBtnText: { color: theme.primaryDark, fontWeight: '700', fontSize: 13 },
  currentLocationCard: {
    borderLeftWidth: 4,
    borderLeftColor: theme.primary,
    backgroundColor: '#f0fdf4',
  },
  currentLocHeader: { flexDirection: 'row', alignItems: 'center' },
  currentLocIcon: { fontSize: 24, marginRight: 12 },
  currentLocBody: { flex: 1 },
  currentLocTitle: { fontSize: 16, fontWeight: '800', color: theme.primaryDark },
  currentLocAddress: {
    fontSize: 13,
    color: theme.primaryDark,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 1,
    lineHeight: 18,
  },
  currentLocCoords: { fontSize: 13, color: theme.muted, marginTop: 2, fontFamily: 'monospace' },
  currentLocTime: { fontSize: 12, color: theme.primary, fontWeight: '600', marginTop: 2 },
  currentLocDetails: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#dcfce7',
  },
  currentLocStat: { flex: 1, alignItems: 'center' },
  currentLocStatValue: { fontSize: 18, fontWeight: '700', color: theme.text },
  currentLocStatLabel: { fontSize: 11, color: theme.muted, marginTop: 2 },
  currentLocDivider: {
    width: 1,
    backgroundColor: '#dcfce7',
  },
  toast: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
