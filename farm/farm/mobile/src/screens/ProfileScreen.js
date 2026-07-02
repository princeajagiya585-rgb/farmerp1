import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { ScreenContainer, Card, PrimaryButton, theme } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { API_BASE } from '../config';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { pendingCount, flush } = useOffline();
  const [syncing, setSyncing] = useState(false);

  const onSync = async () => {
    setSyncing(true);
    try {
      const { success, failed } = await flush();
      if (success === 0 && failed === 0) {
        Alert.alert('Sync', 'Nothing to sync — the offline queue is empty.');
      } else {
        Alert.alert('Sync complete', `Synced ${success} action(s). ${failed} still pending.`);
      }
    } catch (e) {
      Alert.alert('Sync failed', 'Could not sync offline data. Try again later.');
    } finally {
      setSyncing(false);
    }
  };

  const onLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const initial = (user?.full_name || user?.username || '?').charAt(0).toUpperCase();

  return (
    <ScreenContainer scroll>
      <Text style={styles.h1}>Profile</Text>

      <Card style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.name}>{user?.full_name || user?.username || 'Unknown User'}</Text>
        <Text style={styles.role}>{(user?.role || 'field worker').toString().toUpperCase()}</Text>
      </Card>

      <Card>
        <Text style={styles.rowLabel}>Username</Text>
        <Text style={styles.rowValue}>{user?.username || '—'}</Text>
        <View style={styles.divider} />
        <Text style={styles.rowLabel}>Email</Text>
        <Text style={styles.rowValue}>{user?.email || '—'}</Text>
        <View style={styles.divider} />
        <Text style={styles.rowLabel}>Phone</Text>
        <Text style={styles.rowValue}>{user?.phone || '—'}</Text>
        <View style={styles.divider} />
        <Text style={styles.rowLabel}>API Base URL</Text>
        <Text style={styles.rowValue}>{API_BASE}</Text>
        <View style={styles.divider} />
        <Text style={styles.rowLabel}>Pending Offline Actions</Text>
        <Text style={styles.rowValue}>{pendingCount}</Text>
      </Card>

      <PrimaryButton
        title={`🔄  Sync Offline Data${pendingCount ? ` (${pendingCount})` : ''}`}
        variant="outline"
        onPress={onSync}
        loading={syncing}
      />
      <PrimaryButton title="Logout" variant="danger" onPress={onLogout} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: '800', color: theme.text, marginBottom: 12 },
  profileCard: { alignItems: 'center', paddingVertical: 24 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '700', color: theme.text, marginTop: 12 },
  role: { fontSize: 13, color: theme.muted, marginTop: 4, letterSpacing: 1 },
  rowLabel: { fontSize: 13, color: theme.muted },
  rowValue: { fontSize: 15, color: theme.text, fontWeight: '600', marginTop: 2 },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 12 },
});
