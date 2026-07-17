import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Pill, Screen } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { colors, radii, spacing } from '../theme';

export default function AuthScreen({ navigation, route }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState(route.mode === 'register' ? 'register' : 'login');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      if (mode === 'login') {
        if (!loginValue.trim() || !password) throw new Error('Enter your email/username and password.');
        await login(loginValue, password);
      } else {
        if (!displayName.trim() || !username.trim() || !email.trim() || password.length < 8) {
          throw new Error('Complete every field and use a password with at least 8 characters.');
        }
        await register({
          display_name: displayName.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
        });
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert(mode === 'login' ? 'Sign in failed' : 'Account not created', err.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll contentContainerStyle={styles.content}>
        <View style={styles.brandMark}><Text style={styles.brandLetter}>N</Text></View>
        <Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Join The Nest'}</Text>
        <Text style={styles.subtitle}>{mode === 'login' ? 'Sign in to shop, follow makers, and manage your account.' : 'Create a buyer account. You can apply to become a seller afterward.'}</Text>
        <View style={styles.modeRow}>
          <Pill label="Sign in" active={mode === 'login'} onPress={() => setMode('login')} />
          <Pill label="Create account" active={mode === 'register'} onPress={() => setMode('register')} />
        </View>
        {mode === 'register' ? (
          <>
            <Field label="Your name" value={displayName} onChangeText={setDisplayName} autoComplete="name" />
            <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
          </>
        ) : (
          <Field label="Email or username" value={loginValue} onChangeText={setLoginValue} autoCapitalize="none" autoCorrect={false} />
        )}
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        <Button title={mode === 'login' ? 'Sign in' : 'Create account'} onPress={submit} loading={loading} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: 60 },
  brandMark: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: spacing.lg },
  brandLetter: { color: colors.onPrimary, fontWeight: '900', fontSize: 38 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', textAlign: 'center', marginTop: spacing.xl },
  subtitle: { color: colors.muted, lineHeight: 22, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
  modeRow: { flexDirection: 'row', justifyContent: 'center', gap: 9, marginBottom: spacing.xl },
});
