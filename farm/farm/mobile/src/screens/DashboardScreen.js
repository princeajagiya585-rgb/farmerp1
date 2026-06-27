import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { ScreenContainer, Card, StatCard, theme } from '../components/ui';
import client from '../api/client';

function pick(obj, keys, fallback = 0) {
  if (!obj) return fallback;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return fallback;
}

export default function DashboardScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await client.get('/reporting/dashboard/');
      setData(res.data);
    } catch (e) {
      setError('Could not load dashboard. Pull to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
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

  const farm = data?.farm_kpis || {};
  const workforce = data?.workforce_kpis || {};
  const crop = data?.crop_kpis || {};
  const financial = data?.financial_kpis || {};
  const task = data?.task_kpis || {};
  const alerts = Array.isArray(data?.alerts) ? data.alerts : [];

  const farms = pick(farm, ['total_farms', 'farms', 'count']);
  const employees = pick(workforce, ['total_employees', 'employees', 'headcount']);
  const present = pick(workforce, ['present_today', 'present', 'attendance_today']);
  const openTasks = pick(task, ['open_tasks', 'open', 'pending']);
  const netBalance = pick(financial, ['net_balance', 'balance', 'net'], 0);

  return (
    <ScreenContainer
      scroll
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />
      }
    >
      <Text style={styles.h1}>Dashboard</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.grid}>
        <StatCard label="Farms" value={String(farms)} />
        <StatCard label="Employees" value={String(employees)} />
        <StatCard label="Present Today" value={String(present)} accent={theme.primary} />
        <StatCard label="Open Tasks" value={String(openTasks)} />
        <StatCard
          label="Net Balance"
          value={typeof netBalance === 'number' ? netBalance.toLocaleString() : String(netBalance)}
          accent={theme.primaryDark}
        />
        <StatCard label="Active Crops" value={String(pick(crop, ['active_crops', 'crops', 'total']))} />
      </View>

      <Text style={styles.h2}>Alerts</Text>
      {alerts.length === 0 ? (
        <Card>
          <Text style={styles.muted}>No active alerts. All clear.</Text>
        </Card>
      ) : (
        alerts.map((a, i) => (
          <Card key={i} style={styles.alertCard}>
            <Text style={styles.alertText}>⚠️  {a}</Text>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  muted: { color: theme.muted },
  error: { color: theme.danger, marginBottom: 8 },
  alertCard: { borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  alertText: { color: theme.text },
});
