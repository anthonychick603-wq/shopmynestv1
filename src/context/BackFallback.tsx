/**
 * BackFallback — v1.0.232
 *
 * A tiny registry that lets each screen declare the same fallback path
 * for BOTH its own chevron and the global Android hardware/gesture-back
 * handler. Prior to this, every screen passed its fallback to
 * safeBack(router, "…") for the chevron, but the hardware-back hook
 * could only guess a fallback from URL segments (admin/seller/other).
 * On a cold-start deep link the two paths diverged: chevron went to the
 * screen's declared parent, hardware back went to the section root.
 *
 * How it works:
 *   • BackFallbackProvider wraps the app once in _layout.tsx.
 *   • Any screen with a chevron fallback calls useBackFallback("<path>")
 *     once (at render time). The provider stores it in a ref stack so
 *     nested screens override outer ones as they mount.
 *   • useHardwareBack reads the CURRENT top-of-stack fallback via
 *     getBackFallback() and passes it to safeBack.
 *
 * The registry is a stack because Expo Router keeps the previous screen
 * mounted while a new one is on top; the newest push wins. When the top
 * screen unmounts (back), its entry is popped and the previous fallback
 * becomes current again.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";

type Entry = { id: string; path: string };

type Ctx = {
  push: (id: string, path: string) => void;
  remove: (id: string) => void;
  get: () => string | null;
};

const BackFallbackContext = createContext<Ctx | null>(null);

export function BackFallbackProvider({ children }: { children: React.ReactNode }) {
  const stackRef = useRef<Entry[]>([]);

  const push = useCallback((id: string, path: string) => {
    const stack = stackRef.current;
    const existing = stack.findIndex((e) => e.id === id);
    if (existing >= 0) {
      stack[existing] = { id, path };
    } else {
      stack.push({ id, path });
    }
  }, []);

  const remove = useCallback((id: string) => {
    const stack = stackRef.current;
    const idx = stack.findIndex((e) => e.id === id);
    if (idx >= 0) stack.splice(idx, 1);
  }, []);

  const get = useCallback((): string | null => {
    const stack = stackRef.current;
    return stack.length > 0 ? stack[stack.length - 1].path : null;
  }, []);

  const value = useMemo(() => ({ push, remove, get }), [push, remove, get]);
  return <BackFallbackContext.Provider value={value}>{children}</BackFallbackContext.Provider>;
}

/**
 * Declare this screen's fallback path. Call once per screen at render
 * time. The same string that you'd pass as the second arg of
 * safeBack(router, "…").
 *
 * Nested screens automatically win because their effect runs after the
 * outer screen's effect on mount; on unmount the entry is removed and
 * the outer screen's fallback becomes current again.
 */
export function useBackFallback(path: string) {
  const ctx = useContext(BackFallbackContext);
  const idRef = useRef<string>(`fb-${Math.random().toString(36).slice(2)}-${Date.now()}`);
  useEffect(() => {
    if (!ctx) return;
    const id = idRef.current;
    ctx.push(id, path);
    return () => ctx.remove(id);
  }, [ctx, path]);
}

/**
 * Read the current top-of-stack fallback. Returns null when nothing has
 * registered — callers should fall back to a sensible segment guess.
 * Non-hook so useHardwareBack's effect body can read it fresh on every
 * back press without re-subscribing.
 */
export function useBackFallbackReader(): () => string | null {
  const ctx = useContext(BackFallbackContext);
  return useCallback(() => (ctx ? ctx.get() : null), [ctx]);
}
