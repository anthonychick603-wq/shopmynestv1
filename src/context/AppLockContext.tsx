// v1.0.216 (P0 #10) — AppLockContext: tracks whether the biometric
// privacy shield is currently blocking the app tree, listens to AppState
// transitions to decide when to re-lock, and exposes an unlock action
// that fires the OS biometric prompt.
//
// Design:
//   - `locked` is true whenever the overlay should cover the app.
//   - Cold launch: if the setting is enabled, we start locked. The
//     overlay itself calls `unlock()` to fire the prompt on mount.
//   - Background → foreground: if enabled AND the elapsed time is >=
//     the configured grace period, we lock.
//   - Turning the setting OFF instantly unlocks (no biometric needed:
//     the buyer is already inside the app when they flip the switch).
//   - Turning the setting ON re-arms cold-launch behavior but does NOT
//     lock the current session (buyer just walked through the UI).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  authenticateWithBiometrics,
  DEFAULT_APP_LOCK_SETTINGS,
  loadAppLockSettings,
  probeBiometrics,
  saveAppLockSettings,
  shouldLockNow,
  type AppLockSettings,
  type AppLockGrace,
  type BiometricCapability,
} from "@/src/utils/appLock";

type AppLockContextValue = {
  /** Loaded from storage. `null` while the first load is in flight. */
  settings: AppLockSettings | null;
  /** True while the tree should be hidden by the lock overlay. */
  locked: boolean;
  /** Device biometric capability probe result. Refreshed on each unlock attempt. */
  capability: BiometricCapability | null;
  /** Enable/disable and grace-period picker. */
  setEnabled: (next: boolean) => Promise<void>;
  setGrace: (next: AppLockGrace) => Promise<void>;
  /** Fires the biometric prompt. Called by the overlay's Unlock button + auto on mount. */
  unlock: () => Promise<"success" | "cancelled" | "unavailable" | "error">;
  /** Escape hatch: buyer chooses to sign out from the locked state. */
  requestSignOut: () => void;
  /** Registers a sign-out handler so the AuthProvider can wire it in without a circular import. */
  registerSignOutHandler: (fn: () => void) => void;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppLockSettings | null>(null);
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  // v1.0.216 — cold launch: default `locked` to false; we set it to true
  // only after the settings load resolves and confirms the shield is on.
  // Rendering the overlay before settings load would flash on every boot.
  const [locked, setLocked] = useState<boolean>(false);
  const settingsRef = useRef<AppLockSettings | null>(null);
  const lastBackgroundedAtRef = useRef<number | null>(null);
  const signOutHandlerRef = useRef<(() => void) | null>(null);

  // Load persisted settings + capability once on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, cap] = await Promise.all([loadAppLockSettings(), probeBiometrics()]);
      if (!alive) return;
      settingsRef.current = s;
      setSettings(s);
      setCapability(cap);
      // Cold-launch gate: only lock if enabled AND capability is present.
      // If the buyer disabled biometrics at the OS level after enabling
      // app-lock, we DON'T lock them out — the settings screen offers a
      // path to disable app-lock or re-enroll a biometric.
      if (s.enabled && cap.supported) {
        setLocked(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Foreground/background tracker.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        // Stamp the moment we lost foreground. `inactive` fires on iOS
        // for control-center pulls too — we still stamp because we only
        // *evaluate* the lock on the return-to-active transition.
        lastBackgroundedAtRef.current = Date.now();
      } else if (state === "active") {
        const s = settingsRef.current;
        if (!s) return; // still loading
        if (shouldLockNow(s, lastBackgroundedAtRef.current)) {
          // Refresh capability every time we lock — biometric enrollment
          // can change while we're backgrounded (settings-app trip).
          probeBiometrics().then((cap) => setCapability(cap));
          setLocked(true);
        }
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => { sub.remove(); };
  }, []);

  const setEnabled = useCallback(async (next: boolean) => {
    const merged: AppLockSettings = { ...(settingsRef.current ?? DEFAULT_APP_LOCK_SETTINGS), enabled: next };
    settingsRef.current = merged;
    setSettings(merged);
    await saveAppLockSettings(merged);
    if (!next) {
      // Turning the shield off releases any current lock.
      setLocked(false);
    }
  }, []);

  const setGrace = useCallback(async (next: AppLockGrace) => {
    const merged: AppLockSettings = { ...(settingsRef.current ?? DEFAULT_APP_LOCK_SETTINGS), grace: next };
    settingsRef.current = merged;
    setSettings(merged);
    await saveAppLockSettings(merged);
  }, []);

  const unlock = useCallback(async (): Promise<"success" | "cancelled" | "unavailable" | "error"> => {
    // Refresh capability just before prompting, in case enrollment changed.
    const cap = await probeBiometrics();
    setCapability(cap);
    if (!cap.supported) {
      // Nothing to authenticate against. We keep the overlay up and let
      // the buyer choose to sign out; disabling app-lock without a
      // biometric would defeat the point of the shield.
      return "unavailable";
    }
    const res = await authenticateWithBiometrics("Unlock ShopMyNest");
    if (res.kind === "success") {
      setLocked(false);
      // Reset the background stamp so we don't immediately re-lock.
      lastBackgroundedAtRef.current = Date.now();
      return "success";
    }
    return res.kind;
  }, []);

  const requestSignOut = useCallback(() => {
    const handler = signOutHandlerRef.current;
    if (handler) handler();
    // Regardless of whether AuthProvider is listening, drop the lock so
    // the (auth) modal has a chance to appear.
    setLocked(false);
  }, []);

  const registerSignOutHandler = useCallback((fn: () => void) => {
    signOutHandlerRef.current = fn;
  }, []);

  const value = useMemo<AppLockContextValue>(() => ({
    settings, locked, capability,
    setEnabled, setGrace,
    unlock, requestSignOut, registerSignOutHandler,
  }), [settings, locked, capability, setEnabled, setGrace, unlock, requestSignOut, registerSignOutHandler]);

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used inside <AppLockProvider>");
  return ctx;
}
