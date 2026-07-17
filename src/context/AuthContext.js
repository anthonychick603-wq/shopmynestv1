import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from '../lib/api';
import { clearSession, loadSession, saveSession } from '../lib/storage';
import { colors } from '../theme';

const AuthContext = createContext(null);

async function registerPushToken(token) {
  if (!token || !Device.isDevice) return;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'The Nest updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.primary,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      ?? Constants.easConfig?.projectId;
    if (!projectId) return;

    const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerDeviceToken({ token: pushToken.data, platform: Platform.OS }, token);
  } catch {
    // Push setup must never block sign-in or normal app use.
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);

  const persistSession = useCallback(async (nextSession) => {
    setSession(nextSession);
    if (nextSession) await saveSession(nextSession);
    else await clearSession();
  }, []);

  const refreshUser = useCallback(async (sessionOverride) => {
    const active = sessionOverride || session;
    if (!active?.token) return null;
    const user = await api.me(active.token);
    const next = { ...active, user };
    await persistSession(next);
    return user;
  }, [persistSession, session]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const saved = await loadSession();
        if (!saved?.token) return;

        try {
          const user = await api.me(saved.token);
          if (!mounted) return;
          const next = { ...saved, user };
          setSession(next);
          await saveSession(next);
          void registerPushToken(saved.token);
        } catch {
          await clearSession();
        }
      } finally {
        if (mounted) setBooting(false);
      }
    }

    boot();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!session?.token) return undefined;
    let lastRefresh = 0;

    const subscription = AppState.addEventListener('change', (state) => {
      const now = Date.now();
      if (state === 'active' && now - lastRefresh > 15000) {
        lastRefresh = now;
        refreshUser().catch(() => {});
      }
    });

    return () => subscription.remove();
  }, [refreshUser, session?.token]);

  const login = useCallback(async (loginValue, password) => {
    const result = await api.login(String(loginValue || '').trim(), password);
    const next = { token: result.token, user: result.user };
    await persistSession(next);
    void registerPushToken(result.token);
    return result.user;
  }, [persistSession]);

  const register = useCallback(async (payload) => {
    const result = await api.register(payload);
    const next = { token: result.token, user: result.user };
    await persistSession(next);
    void registerPushToken(result.token);
    return result.user;
  }, [persistSession]);

  const logout = useCallback(async () => {
    const token = session?.token;
    await persistSession(null);
    if (token) {
      try {
        await api.logout(token);
      } catch {
        // Local logout is sufficient when the network is unavailable.
      }
    }
  }, [persistSession, session]);

  const updateUser = useCallback(async (payload) => {
    if (!session?.token) throw new Error('Sign in first.');
    const user = await api.updateMe(payload, session.token);
    await persistSession({ ...session, user });
    return user;
  }, [persistSession, session]);

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    token: session?.token || '',
    isSeller: Boolean(session?.user?.is_seller),
    booting,
    login,
    register,
    logout,
    refreshUser,
    updateUser,
  }), [booting, login, logout, refreshUser, register, session, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
