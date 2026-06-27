import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PrimaryButton, theme, LogoBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const METHODS = ['Phone', 'Username', 'Email'];

export default function LoginScreen() {
  const { login } = useAuth();
  const [method, setMethod] = useState('Phone');
  const [username, setUsername] = useState('admin');
  const [email, setEmail] = useState('manager@farmerp.local');
  const [phone, setPhone] = useState('9999999999');
  const [password, setPassword] = useState('Passw0rd!');
  const [password2, setPassword2] = useState('Passw0rd!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetStep, setResetStep] = useState('email'); // email | otp | success
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  const getIdentifier = () => {
    if (method === 'Email') return email.trim();
    if (method === 'Phone') return phone.trim();
    return username.trim();
  };

  const onSubmit = async () => {
    setError('');
    const identifier = getIdentifier();
    if (!identifier || !password) {
      setError('Please enter your credentials.');
      return;
    }
    if (password !== password2) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      // Backend /auth/login/ accepts username, email, or phone
      await login(identifier, password);
    } catch (e) {
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.non_field_errors?.[0] ||
        'Login failed. Check your credentials and API base URL.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setResetLoading(true);
    setResetError('');
    try {
      await client.post('/auth/forgot-password/', { email: resetEmail });
      setResetStep('otp');
    } catch (err) {
      setResetError(err?.response?.data?.detail || 'Failed to send OTP.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      await client.post('/auth/reset-password/', {
        email: resetEmail,
        otp: resetOtp,
        new_password: resetNewPassword,
      });
      setResetStep('success');
    } catch (err) {
      setResetError(err?.response?.data?.detail || 'Password reset failed.');
    } finally {
      setResetLoading(false);
    }
  };

  const resetState = () => {
    setShowForgotPassword(false);
    setResetStep('email');
    setResetOtp('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setResetError('');
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#15803d', '#052e16']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <LogoBadge size={72} />
        <Text style={styles.title}>FarmERP Pro</Text>
        <Text style={styles.subtitle}>Smart Farm Management</Text>
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {showForgotPassword ? (
            /* ─── Forgot Password Flow ─── */
            <View style={styles.card}>
              {resetStep !== 'email' && (
                <TouchableOpacity
                  onPress={() => {
                    setResetStep('email');
                    setResetError('');
                  }}
                  style={{ marginBottom: 8 }}
                >
                  <Text style={{ color: theme.primary, fontSize: 14, fontWeight: '600' }}>← Back</Text>
                </TouchableOpacity>
              )}

              {resetStep === 'email' && (
                <>
                  <Text style={styles.welcome}>Reset Password</Text>
                  <Text style={styles.welcomeSub}>
                    Enter your Super Admin email to receive a reset OTP.
                  </Text>

                  {resetError ? <Text style={styles.error}>{resetError}</Text> : null}

                  <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    placeholder="admin@example.com"
                    placeholderTextColor={theme.muted}
                  />

                  <PrimaryButton
                    title={resetLoading ? 'Sending…' : 'Send OTP'}
                    onPress={handleSendOtp}
                    loading={resetLoading}
                    disabled={!resetEmail}
                    style={{ marginTop: 18 }}
                  />

                  <PrimaryButton
                    title="Back to Login"
                    variant="outline"
                    onPress={resetState}
                  />
                </>
              )}

              {resetStep === 'otp' && (
                <>
                  <Text style={styles.welcome}>Enter OTP</Text>
                  <Text style={styles.welcomeSub}>
                    Enter the OTP sent to{' '}
                    <Text style={{ fontWeight: '700' }}>{resetEmail}</Text> and set a new
                    password.
                  </Text>

                  {resetError ? <Text style={styles.error}>{resetError}</Text> : null}

                  <Text style={styles.label}>OTP Code</Text>
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    value={resetOtp}
                    onChangeText={(t) => setResetOtp(t.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    placeholder="000000"
                    placeholderTextColor={theme.muted}
                    maxLength={6}
                  />

                  <Text style={styles.label}>New Password</Text>
                  <TextInput
                    style={styles.input}
                    value={resetNewPassword}
                    onChangeText={setResetNewPassword}
                    secureTextEntry
                    placeholder="min 6 characters"
                    placeholderTextColor={theme.muted}
                  />

                  <Text style={styles.label}>Confirm New Password</Text>
                  <TextInput
                    style={styles.input}
                    value={resetConfirmPassword}
                    onChangeText={setResetConfirmPassword}
                    secureTextEntry
                    placeholder="confirm new password"
                    placeholderTextColor={theme.muted}
                  />

                  <PrimaryButton
                    title={resetLoading ? 'Resetting…' : 'Reset Password'}
                    onPress={handleResetPassword}
                    loading={resetLoading}
                    disabled={resetOtp.length < 6 || !resetNewPassword}
                    style={{ marginTop: 18 }}
                  />

                  <PrimaryButton
                    title="Back"
                    variant="outline"
                    onPress={() => {
                      setResetStep('email');
                      setResetOtp('');
                      setResetError('');
                    }}
                  />
                </>
              )}

              {resetStep === 'success' && (
                <View style={styles.successContainer}>
                  <View style={styles.checkCircle}>
                    <Text style={styles.checkMark}>✓</Text>
                  </View>
                  <Text style={styles.welcome}>Password Reset!</Text>
                  <Text style={[styles.welcomeSub, styles.successText]}>
                    Your password has been updated. You can now log in with your new password.
                  </Text>
                  <PrimaryButton title="Back to Login" onPress={resetState} />
                </View>
              )}
            </View>
          ) : (
            /* ─── Login Form ─── */
            <View style={styles.card}>
              <Text style={styles.welcome}>Welcome back</Text>
              <Text style={styles.welcomeSub}>Sign in to continue</Text>

              {/* Login Method Selector */}
              <View style={styles.methodRow}>
                {METHODS.map((m) => (
                  <Text
                    key={m}
                    style={[
                      styles.methodChip,
                      method === m && styles.methodChipActive,
                    ]}
                    onPress={() => setMethod(m)}
                  >
                    {m}
                  </Text>
                ))}
              </View>

              {method === 'Username' && (
                <>
                  <Text style={styles.label}>Username</Text>
                  <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="username"
                    placeholderTextColor={theme.muted}
                  />
                </>
              )}

              {method === 'Email' && (
                <>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    placeholder="email@example.com"
                    placeholderTextColor={theme.muted}
                  />
                </>
              )}

              {method === 'Phone' && (
                <>
                  <Text style={styles.label}>Phone Number</Text>
                  <TextInput
                    style={styles.input}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    placeholder="phone number"
                    placeholderTextColor={theme.muted}
                  />
                </>
              )}

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="password"
                placeholderTextColor={theme.muted}
              />

              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={password2}
                onChangeText={setPassword2}
                secureTextEntry
                placeholder="confirm password"
                placeholderTextColor={theme.muted}
              />

              <TouchableOpacity
                onPress={() => {
                  setShowForgotPassword(true);
                  setResetEmail('');
                  setResetError('');
                }}
              >
                <Text style={styles.forgotLink}>Forgot Password?</Text>
              </TouchableOpacity>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PrimaryButton
                title="Sign In"
                onPress={onSubmit}
                loading={loading}
                style={{ marginTop: 18 }}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  flex: { flex: 1 },
  hero: {
    paddingTop: 80,
    paddingBottom: 48,
    alignItems: 'center',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 14 },
  subtitle: { fontSize: 14, color: '#dcfce7', marginTop: 4 },
  scroll: { padding: 20, paddingTop: 28 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  welcome: { fontSize: 20, fontWeight: '800', color: theme.text },
  welcomeSub: { fontSize: 14, color: theme.muted, marginTop: 2, marginBottom: 8 },
  label: {
    fontSize: 14,
    color: theme.text,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.text,
  },
  error: { color: theme.danger, marginTop: 12 },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  methodChip: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: '600',
    color: theme.muted,
    backgroundColor: '#f1f5f9',
    overflow: 'hidden',
  },
  methodChipActive: {
    backgroundColor: theme.primary,
    color: '#fff',
  },
  forgotLink: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 10,
  },
  otpInput: {
    textAlign: 'center',
    fontSize: 20,
    letterSpacing: 8,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  checkMark: {
    fontSize: 32,
    color: '#16a34a',
    fontWeight: '700',
  },
  successText: {
    textAlign: 'center',
    marginBottom: 16,
  },
});
