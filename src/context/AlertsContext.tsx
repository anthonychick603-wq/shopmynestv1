// v1.0.116 — Shared alerts/notifications state so the header bell can
// show an unread badge on every screen without each screen re-fetching
// on its own. Mirrors the CartContext pattern: one poll + focus refresh
// at the provider level, everyone else just reads `unreadCount`.
//
// The server always returns `unread` on `/notifications` responses, so
// polling with `per_page: 1` is a cheap way to keep the badge honest
// without pulling the full list on every check.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { nest, ApiError } from "@/src/api/nest";
import { useAuth } from "./AuthContext";

type AlertsContextValue = {
  unreadCount: number;
  // Force a refresh (e.g. after markAllRead or after a push notification
  // arrives that we know bumped the count).
  refresh: () => Promise<void>;
  // Local optimistic helpers so tapping "mark all read" on the Alerts
  // screen updates the badge instantly instead of waiting a full poll
  // cycle.
  setUnreadCount: (n: number) => void;
  decrementUnread: (by?: number) => void;
};

const AlertsContext = createContext<AlertsContextValue | null>(null);

// Poll interval — matches the cadence of the messaging poll elsewhere in
// the app. 60s is often enough that the bell feels live but rarely
// enough to be gentle on WordPress hosts.
const POLL_MS = 60_000;

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnread] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setUnread(0);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      // per_page: 1 keeps the payload small — we only need the `unread`
      // field, not the list. Server returns `unread` regardless of page
      // size so this is a cheap "give me the count" call.
      const data = await nest.getNotifications({ per_page: 1 });
      const n = Number((data as { unread?: number }).unread ?? 0);
      setUnread(Number.isFinite(n) && n >= 0 ? n : 0);
    } catch (e) {
      // Silent — the bell just keeps its last known count on transient
      // failures. We don't want a network blip to zero the badge and
      // give the user the false impression that everything is read.
      if (!(e instanceof ApiError)) {
        // swallow
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [user]);

  // Poll while logged in. Reset the timer whenever auth changes so a
  // fresh login gets an immediate count, and a logout stops the polling
  // entirely.
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!user) {
      setUnread(0);
      return;
    }
    // Fire once immediately so the badge shows up on first render.
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [user, refresh]);

  // Refresh whenever the app comes back to foreground. Users often leave
  // the app for minutes, receive a push, and come back — polling won't
  // have fired yet, so we force a check on resume.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active" && user) {
        refresh();
      }
    });
    return () => sub.remove();
  }, [user, refresh]);

  const decrementUnread = useCallback((by: number = 1) => {
    setUnread((n) => Math.max(0, n - by));
  }, []);

  const setUnreadCount = useCallback((n: number) => {
    setUnread(Math.max(0, Math.floor(n)));
  }, []);

  const value = useMemo<AlertsContextValue>(
    () => ({ unreadCount, refresh, setUnreadCount, decrementUnread }),
    [unreadCount, refresh, setUnreadCount, decrementUnread],
  );

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useAlerts(): AlertsContextValue {
  const ctx = useContext(AlertsContext);
  if (!ctx) {
    // Safe fallback if a screen renders outside the provider (shouldn't
    // happen in production; useful during hot reload). Everything is
    // read-only zero.
    return {
      unreadCount: 0,
      refresh: async () => {},
      setUnreadCount: () => {},
      decrementUnread: () => {},
    };
  }
  return ctx;
}
