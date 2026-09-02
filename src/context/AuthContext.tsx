import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

import { nest, setAuthToken, ApiError } from "@/src/api/nest";
import { toUser } from "@/src/api/adapters";
import type { NestUser } from "@/src/types";
import type { NestTwoFactorChallenge } from "@/src/api/nest";
import { colors } from "@/src/theme";

// v1.0.217 (P0 #11) — result of a seller/admin login attempt. `signedIn`
// means the token was minted and the user is authenticated; `twoFactor`
// means the caller must present the code screen and call twoFactorVerify.
export type LoginResult =
  | { kind: "signedIn" }
  | { kind: "twoFactor"; challenge: NestTwoFactorChallenge };

type AuthContextValue = {
  user: NestUser | null;
  loading: boolean;
  login: (loginValue: string, password: string) => Promise<LoginResult>;
  twoFactorVerify: (challengeId: string, code: string) => Promise<void>;
  twoFactorResend: (challengeId: string) => Promise<{ resendsLeft: number }>;
  // v1.0.120 — two-step signup. Step 1 emails a verification code +
  // magic link and returns a pending signup id. Step 2 completes the
  // signup by proving code ownership; only then does a real wp_users
  // row exist. adoptSessionToken lets the magic-link deep-link finish
  // signup on the client when the server already promoted the pending
  // row.
  signupStart: (payload: { name: string; email: string; username: string; password: string }) => Promise<{ pendingId: number; email: string; expiresIn: number }>;
  signupVerify: (payload: { pendingId: number; code: string }) => Promise<void>;
  signupResend: (pendingId: number) => Promise<void>;
  adoptSessionToken: (token: string) => Promise<void>;
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

    // expo-constants' typing has `extra?: Record<string, any>` on expoConfig and
    // `easConfig?: { projectId?: string }` on the module root, but the exported
    // types don't always agree between SDK versions. Narrow both without `any`.
    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    const easConfig = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig;
    const projectId = extra?.eas?.projectId ?? easConfig?.projectId;
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
        // v1.0.217 (P0 #11) — seller / admin path: server returns a
        // challenge instead of a token. Surface it to the caller so the
        // login screen can route to the 2FA code screen. No token is
        // written and no user is set until the code is verified.
        if ("two_factor_required" in res && res.two_factor_required) {
          return { kind: "twoFactor", challenge: res };
        }
        await setAuthToken(res.token);
        setUser(toUser(res.user));
        void registerPushToken();
        return { kind: "signedIn" };
      },
      async twoFactorVerify(challengeId, code) {
        const res = await nest.twoFactorVerify(challengeId, code);
        await setAuthToken(res.token);
        setUser(toUser(res.user));
        void registerPushToken();
      },
      async twoFactorResend(challengeId) {
        const res = await nest.twoFactorResend(challengeId);
        return { resendsLeft: res.resends_left };
      },
      async signupStart({ name, email, username, password }) {
        const res = await nest.signupStart({ name, email, username, password });
        return { pendingId: res.pending_id, email: res.email, expiresIn: res.expires_in };
      },
      async signupVerify({ pendingId, code }) {
        const res = await nest.signupVerify({ pending_id: pendingId, code });
        await setAuthToken(res.token);
        setUser(toUser(res.user));
        void registerPushToken();
      },
      async signupResend(pendingId) {
        await nest.signupResend({ pending_id: pendingId });
      },
      async adoptSessionToken(token) {
        await setAuthToken(token);
        try {
          const raw = await nest.me();
          setUser(toUser(raw));
          void registerPushToken();
        } catch {
          await setAuthToken(null);
          setUser(null);
          throw new Error("Could not finish signing in. Please try signing in with your password.");
        }
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
