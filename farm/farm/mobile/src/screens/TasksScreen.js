import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { ScreenContainer, Card, theme } from '../components/ui';
import client from '../api/client';

const PRIORITY_COLORS = {
  high: theme.danger,
  medium: '#f59e0b',
  low: theme.primary,
};

function StatusBadge({ status }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{String(status || 'unknown').toUpperCase()}</Text>
    </View>
  );
}

export default function TasksScreen() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = (msg) => {
    setSuccessMsg(msg);
    toastOpacity.setValue(0); // reset so rapid successive toasts start clean
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setSuccessMsg(''));
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await client.get('/tasks/');
      setTasks(res.data?.results || []);
    } catch (e) {
      setError('Could not load tasks. Pull to retry.');
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

  const startWork = async (task) => {
    setBusyId(task.id);
    try {
      await client.post(`/tasks/${task.id}/start_work/`);
      await load();
    } catch (e) {
      setError(`Could not start work on "${task.title}".`);
    } finally {
      setBusyId(null);
    }
  };

  const stopWork = async (task) => {
    setBusyId(task.id);
    try {
      await client.post(`/tasks/${task.id}/stop_work/`);
      await load();
    } catch (e) {
      setError(`Could not stop work on "${task.title}".`);
    } finally {
      setBusyId(null);
    }
  };

  const markComplete = async (task) => {
    setBusyId(task.id);
    try {
      await client.post(`/tasks/${task.id}/mark_complete/`);
      await load();
      showToast(`✅ "${task.title}" completed!`);
    } catch (e) {
      setError(`Could not complete "${task.title}".`);
    } finally {
      setBusyId(null);
    }
  };

  const submitTask = async (task) => {
    setBusyId(task.id);
    try {
      await client.post(`/tasks/${task.id}/submit/`);
      await load();
    } catch (e) {
      setError(`Could not submit "${task.title}".`);
    } finally {
      setBusyId(null);
    }
  };

  const updateProgress = async (task, delta) => {
    const next = Math.max(0, Math.min(100, (task.progress || 0) + delta));
    setBusyId(task.id);
    try {
      await client.post(`/tasks/${task.id}/update_progress/`, { progress: next });
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, progress: next } : t))
      );
    } catch (e) {
      setError(`Could not update progress for "${task.title}".`);
    } finally {
      setBusyId(null);
    }
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
      <Text style={styles.h1}>My Tasks</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Success Toast */}
      {successMsg ? (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{successMsg}</Text>
        </Animated.View>
      ) : null}

      {tasks.length === 0 ? (
        <Card>
          <Text style={styles.muted}>No tasks assigned.</Text>
        </Card>
      ) : (
        tasks.map((task) => {
          const pColor = PRIORITY_COLORS[String(task.priority).toLowerCase()] || theme.muted;
          const progress = task.progress || 0;
          const busy = busyId === task.id;
          const activeSession = task.active_session;
          return (
            <Card key={task.id}>
              <View style={styles.row}>
                <Text style={styles.title}>{task.title}</Text>
                <StatusBadge status={task.status} />
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.priority, { color: pColor }]}>
                  ● {String(task.priority || 'n/a').toUpperCase()}
                </Text>
                {task.farm_name ? <Text style={styles.muted}>  ·  {task.farm_name}</Text> : null}
                {task.due_date ? <Text style={styles.muted}>  ·  Due {task.due_date}</Text> : null}
              </View>

              {/* Timer Section */}
              <View style={styles.timerRow}>
                {activeSession ? (
                  <>
                    <View style={styles.timerDot} />
                    <Text style={styles.timerActive}>
                      Started {new Date(activeSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </>
                ) : task.total_tracked_minutes ? (
                  <Text style={styles.timerIdle}>
                    Total: {Math.floor(task.total_tracked_minutes / 60)}h {Math.round(task.total_tracked_minutes % 60)}m
                  </Text>
                ) : null}
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressLabel}>{progress}% complete</Text>

              <View style={styles.actions}>
                {activeSession ? (
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: theme.danger, borderWidth: 0 }]}
                    disabled={busy}
                    onPress={() => stopWork(task)}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Stop Work</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: theme.success || '#16a34a', borderWidth: 0 }]}
                    disabled={busy}
                    onPress={() => startWork(task)}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Start Work</Text>
                    )}
                  </TouchableOpacity>
                )}

                {/* Complete Task button — all users */}
                {!['COMPLETED', 'VERIFIED', 'CANCELLED'].includes(task.status) && (
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: '#16a34a', borderWidth: 0 }]}
                    disabled={busy}
                    onPress={() => markComplete(task)}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Done</Text>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.smallBtn, styles.outlineBtn]}
                  disabled={busy}
                  onPress={() => updateProgress(task, -10)}
                >
                  <Text style={styles.outlineBtnText}>-10%</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallBtn, styles.outlineBtn]}
                  disabled={busy}
                  onPress={() => updateProgress(task, 10)}
                >
                  <Text style={styles.outlineBtnText}>+10%</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallBtn, styles.primaryBtn]}
                  disabled={busy}
                  onPress={() => submitTask(task)}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Submit</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Card>
          );
        })
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 26, fontWeight: '800', color: theme.text, marginBottom: 12 },
  error: { color: theme.danger, marginBottom: 8 },
  muted: { color: theme.muted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: theme.text, flex: 1, paddingRight: 8 },
  badge: { backgroundColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', color: theme.muted },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' },
  priority: { fontSize: 12, fontWeight: '700' },
  progressTrack: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: 8, backgroundColor: theme.primary, borderRadius: 4 },
  progressLabel: { fontSize: 12, color: theme.muted, marginTop: 4 },
  actions: { flexDirection: 'row', marginTop: 12, gap: 8 },
  smallBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtn: { borderWidth: 1.5, borderColor: theme.primary },
  outlineBtnText: { color: theme.primary, fontWeight: '600' },
  primaryBtn: { backgroundColor: theme.primary, flex: 1.4 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  toast: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    shadowColor: '#16a34a',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  timerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 2 },
  timerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16a34a',
    marginRight: 6,
  },
  timerActive: { fontSize: 12, color: '#16a34a', fontWeight: '600' },
  timerIdle: { fontSize: 12, color: theme.muted },
});
