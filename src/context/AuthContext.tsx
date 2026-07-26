import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

import { nest, setAuthToken, ApiError } from "@/src/api/nest";
import { toUser } from "@/src/api/adapters";
import type { NestUser } from "@/src/types";
import { colors } from "@/src/theme";

type AuthContextValue = {
  user: NestUser | null;
  loading: boolean;
  login: (loginValue: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateUser: (u: NestUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function registerPushToken(): Promise<void> {
  if (!Device.isDevice) return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "My Nest updates",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.brand,
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return;

    const projectId =
      (Constants.expoConfig as any)?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    if (!projectId) return;

    const push = await Notifications.getExpoPushTokenAsync({ projectId });
    await nest.registerDeviceToken({ token: push.data, platform: Platform.OS });
  } catch {
    // Push setup must never block sign-in or normal use
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<NestUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await nest.me();
        setUser(toUser(raw));
        void registerPushToken();
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let last = 0;
    const sub = AppState.addEventListener("change", (state) => {
      const now = Date.now();
      if (state === "active" && now - last > 15000) {
        last = now;
        nest
          .me()
          .then((raw) => setUser(toUser(raw)))
          .catch(async (e) => {
            // A session that lapsed while backgrounded must clear, or every
            // screen keeps rendering as signed-in while all requests 401.
            if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
              await setAuthToken(null);
              setUser(null);
            }
          });
      }
    });
    return () => sub.remove();
  }, [user]);

  const value: AuthContextValue = useMemo(
    () => ({
      user,
      loading,
      async login(loginValue, password) {
        const res = await nest.login(loginValue.trim(), password);
        await setAuthToken(res.token);
        setUser(toUser(res.user));
        void registerPushToken();
      },
      async register(email, password, name, username) {
        const res = await nest.register({ email, username, password, display_name: name, name });
        await setAuthToken(res.token);
        setUser(toUser(res.user));
        void registerPushToken();
      },
      async logout() {
        try {
          await nest.logout();
        } catch {
          // Local logout is enough
        }
        await setAuthToken(null);
        setUser(null);
      },
      async refresh() {
        try {
          const raw = await nest.me();
          setUser(toUser(raw));
        } catch (e) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            await setAuthToken(null);
            setUser(null);
          }
        }
      },
      updateUser(u) {
        setUser(u);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
