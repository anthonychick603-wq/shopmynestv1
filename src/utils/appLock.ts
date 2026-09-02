// v1.0.216 (P0 #10) — biometric app-lock: settings + helpers.
//
// The lock is a client-side privacy shield: when enabled, the app tree is
// hidden behind a full-screen "Unlock" overlay after a cold launch or
// after being backgrounded past the configured grace period. It does NOT
// replace the auth token — the user is still signed in server-side.
//
// Settings live in AsyncStorage (not secure store). They are not secrets:
// they only describe UX preferences ("locked?", "how long to wait?"). The
// biometric check itself is performed by the OS through
// `expo-local-authentication`; nothing user-provided is stored here.
//
// A defensive dynamic `require` keeps this module importable in builds
// that don't ship expo-local-authentication (e.g. the sandbox type-check
// pass where node_modules is root-owned and the package isn't installed
// yet). All paths degrade gracefully to "biometrics unavailable".

import { storage } from "@/src/utils/storage";

export type AppLockGrace = "immediate" | "1m" | "5m" | "15m";

export type AppLockSettings = {
  enabled: boolean;
  grace: AppLockGrace;
};

export const DEFAULT_APP_LOCK_SETTINGS: AppLockSettings = {
  enabled: false,
  grace: "immediate",
};

export const APP_LOCK_SETTINGS_KEY = "app_lock.settings.v1";

/** Grace-period options presented in the settings picker. */
export const APP_LOCK_GRACE_OPTIONS: Array<{ value: AppLockGrace; label: string; ms: number }> = [
  { value: "immediate", label: "Immediately",     ms: 0 },
  { value: "1m",        label: "After 1 minute",  ms: 60_000 },
  { value: "5m",        label: "After 5 minutes", ms: 5 * 60_000 },
  { value: "15m",       label: "After 15 minutes", ms: 15 * 60_000 },
];

export function graceMs(g: AppLockGrace): number {
  const hit = APP_LOCK_GRACE_OPTIONS.find((o) => o.value === g);
  return hit ? hit.ms : 0;
}

export async function loadAppLockSettings(): Promise<AppLockSettings> {
  const raw = await storage.getItem<AppLockSettings>(APP_LOCK_SETTINGS_KEY, DEFAULT_APP_LOCK_SETTINGS);
  if (!raw || typeof raw !== "object") return DEFAULT_APP_LOCK_SETTINGS;
  const enabled = !!raw.enabled;
  const grace: AppLockGrace = APP_LOCK_GRACE_OPTIONS.some((o) => o.value === raw.grace) ? raw.grace : "immediate";
  return { enabled, grace };
}

export async function saveAppLockSettings(next: AppLockSettings): Promise<void> {
  await storage.setItem(APP_LOCK_SETTINGS_KEY, next);
}

// v1.0.216 — capability probe. Wrapped in try/catch so the module can be
// missing entirely (unshipped native code) without crashing the app.
export type BiometricCapability = {
  supported: boolean;   // hardware is present AND user has enrolled at least one biometric
  hasHardware: boolean;
  enrolled: boolean;
  primaryType: "face" | "fingerprint" | "iris" | "none";
};

// v1.0.216 — minimal shape we actually use from expo-local-authentication.
// A structural type keeps this file compilable even when the package's
// own types aren't yet installed in the sandbox node_modules (root-owned).
type LocalAuthTypes = {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  supportedAuthenticationTypesAsync: () => Promise<number[]>;
  authenticateAsync: (opts: {
    promptMessage?: string;
    cancelLabel?: string;
    disableDeviceFallback?: boolean;
    fallbackLabel?: string;
  }) => Promise<{ success: boolean; error?: string; warning?: string }>;
  AuthenticationType: { FINGERPRINT: number; FACIAL_RECOGNITION: number; IRIS: number };
};

let _la: LocalAuthTypes | null | undefined;
function laModule(): LocalAuthTypes | null {
  if (_la !== undefined) return _la;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _la = require("expo-local-authentication") as LocalAuthTypes;
  } catch {
    _la = null;
  }
  return _la;
}

export async function probeBiometrics(): Promise<BiometricCapability> {
  const la = laModule();
  if (!la) return { supported: false, hasHardware: false, enrolled: false, primaryType: "none" };
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      la.hasHardwareAsync(),
      la.isEnrolledAsync(),
      la.supportedAuthenticationTypesAsync(),
    ]);
    let primaryType: BiometricCapability["primaryType"] = "none";
    // AuthenticationType: 1 = FINGERPRINT, 2 = FACIAL_RECOGNITION, 3 = IRIS.
    if (Array.isArray(types) && types.length > 0) {
      if (types.includes(la.AuthenticationType.FACIAL_RECOGNITION)) primaryType = "face";
      else if (types.includes(la.AuthenticationType.FINGERPRINT)) primaryType = "fingerprint";
      else if (types.includes(la.AuthenticationType.IRIS)) primaryType = "iris";
    }
    return {
      hasHardware: !!hasHardware,
      enrolled: !!enrolled,
      supported: !!hasHardware && !!enrolled,
      primaryType,
    };
  } catch {
    return { supported: false, hasHardware: false, enrolled: false, primaryType: "none" };
  }
}

export type AuthenticateResult =
  | { kind: "success" }
  | { kind: "cancelled" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

export async function authenticateWithBiometrics(reason: string): Promise<AuthenticateResult> {
  const la = laModule();
  if (!la) return { kind: "unavailable" };
  try {
    // v1.0.216 — `disableDeviceFallback: false` lets the OS present a
    // device-passcode/PIN option if biometrics fail three times or the
    // buyer taps "Use passcode". This is the standard iOS/Android UX.
    const res = await la.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
      fallbackLabel: "Use passcode",
    });
    if (res.success) return { kind: "success" };
    // `res.error` is a stable string: "user_cancel", "system_cancel",
    // "lockout", "not_available", ...
    if (res.error === "user_cancel" || res.error === "app_cancel" || res.error === "system_cancel") {
      return { kind: "cancelled" };
    }
    if (res.error === "not_available" || res.error === "not_enrolled") {
      return { kind: "unavailable" };
    }
    return { kind: "error", message: typeof res.error === "string" ? res.error : "Authentication failed" };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "Authentication failed" };
  }
}

/**
 * Decide whether the app should present the lock screen right now.
 * `lastBackgroundedAt` is null if the app hasn't been backgrounded yet
 * this session (cold launch path — always locks if enabled). Otherwise
 * we compare the elapsed time against the configured grace period.
 */
export function shouldLockNow(settings: AppLockSettings, lastBackgroundedAt: number | null, nowMs: number = Date.now()): boolean {
  if (!settings.enabled) return false;
  if (lastBackgroundedAt == null) return true; // cold launch or first-time evaluation
  const elapsed = Math.max(0, nowMs - lastBackgroundedAt);
  return elapsed >= graceMs(settings.grace);
}
