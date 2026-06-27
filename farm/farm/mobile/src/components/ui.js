import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Green brand theme
export const theme = {
  primary: '#16a34a',
  primaryDark: '#15803d',
  primaryLight: '#dcfce7',
  bg: '#f1f5f4',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e9eef0',
  danger: '#dc2626',
};

const shadow = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

export function LogoBadge({ size = 44, radius }) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      style={{ width: size, height: size, borderRadius: radius ?? size * 0.28 }}
    />
  );
}

export function ScreenContainer({ children, scroll = false, refreshControl, style }) {
  if (scroll) {
    return (
      <SafeAreaView style={[styles.screen, style]} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={refreshControl}>
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.screen, style]} edges={['top']}>
      <View style={styles.plainContent}>{children}</View>
    </SafeAreaView>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatCard({ label, value, accent }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const badgeColors = {
  green: { bg: '#dcfce7', fg: '#15803d' },
  blue: { bg: '#dbeafe', fg: '#1d4ed8' },
  yellow: { bg: '#fef3c7', fg: '#b45309' },
  red: { bg: '#fee2e2', fg: '#b91c1c' },
  purple: { bg: '#f3e8ff', fg: '#7e22ce' },
  gray: { bg: '#f1f5f9', fg: '#475569' },
};

export function Badge({ label, color = 'gray' }) {
  const c = badgeColors[color] || badgeColors.gray;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({ title, onPress, loading, disabled, variant = 'primary', style }) {
  const isDisabled = disabled || loading;
  const bg =
    variant === 'danger' ? theme.danger : variant === 'outline' ? 'transparent' : theme.primary;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.button,
        { backgroundColor: bg },
        variant === 'outline' ? styles.buttonOutline : null,
        isDisabled ? styles.buttonDisabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? theme.primary : '#fff'} />
      ) : (
        <Text style={[styles.buttonText, variant === 'outline' ? { color: theme.primary } : null]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  scrollContent: { padding: 16, paddingBottom: 32 },
  plainContent: { flex: 1, padding: 16 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
    ...shadow,
  },
  statCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    margin: 6,
    flexGrow: 1,
    minWidth: '42%',
    borderWidth: 1,
    borderColor: theme.border,
    ...shadow,
  },
  statValue: { fontSize: 26, fontWeight: '800', color: theme.text },
  statLabel: { fontSize: 13, color: theme.muted, marginTop: 4 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  button: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonOutline: { borderWidth: 1.5, borderColor: theme.primary },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
