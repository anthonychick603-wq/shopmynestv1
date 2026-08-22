// v1.0.132 — device-side back-in-stock watches.
//
// The current WordPress API does not expose a restock-subscription endpoint, so
// the mobile client keeps explicit buyer opt-ins in AsyncStorage. While a signed-
// in buyer is using MyNest (or returns to it), we re-check watched products and
// fire a local notification when the watched product/variation is purchasable.
// This is intentionally honest device-side behavior rather than pretending a
// server-side push subscription exists.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";

import { nest } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { useAuth } from "@/src/context/AuthContext";
import { storage } from "@/src/utils/storage";

type RestockWatch = {
  key: string;
  product_id: string;
  variation_id?: number;
  title: string;
  variation_label?: string;
  created_at: string;
};

type AddWatchInput = {
  productId: string | number;
  variationId?: number;
  title: string;
  variationLabel?: string;
};

type RestockAlertsContextValue = {
  watches: RestockWatch[];
  enabled: boolean;
  hydrated: boolean;
  isWatching: (productId: string | number, variationId?: number) => boolean;
  addWatch: (input: AddWatchInput) => Promise<void>;
  removeWatch: (productId: string | number, variationId?: number) => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  checkNow: () => Promise<void>;
};

const RestockAlertsContext = createContext<RestockAlertsContextValue | null>(null);
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

function watchKey(productId: string | number, variationId?: number): string {
  return `${String(productId)}:${variationId != null ? String(variationId) : "product"}`;
}

function watchesStorageKey(userId: string): string {
  return `nest.restock.watches.${userId}`;
}

function enabledStorageKey(userId: string): string {
  return `nest.restock.enabled.${userId}`;
}

export function RestockAlertsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [watches, setWatches] = useState<RestockWatch[]>([]);
  const [enabled, setEnabledState] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const checkingRef = useRef(false);
  const lastCheckRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    if (!user) {
      setWatches([]);
      setEnabledState(true);
      setHydrated(true);
      return () => { cancelled = true; };
    }

    (async () => {
      const [savedWatches, savedEnabled] = await Promise.all([
        storage.getItem(watchesStorageKey(user.id), [] as any),
        storage.getItem(enabledStorageKey(user.id), true as boolean),
      ]);
      if (cancelled) return;
      setWatches(Array.isArray(savedWatches) ? (savedWatches as unknown as RestockWatch[]) : []);
      setEnabledState(savedEnabled !== false);
      setHydrated(true);
    })();

    return () => { cancelled = true; };
  }, [user]);

  const persistWatches = useCallback(async (next: RestockWatch[]) => {
    setWatches(next);
    if (user) await storage.setItem(watchesStorageKey(user.id), next as any);
  }, [user]);

  const isWatching = useCallback((productId: string | number, variationId?: number) => {
    const key = watchKey(productId, variationId);
    return watches.some((w) => w.key === key);
  }, [watches]);

  const addWatch = useCallback(async ({ productId, variationId, title, variationLabel }: AddWatchInput) => {
    if (!user) return;
    const key = watchKey(productId, variationId);
    if (watches.some((w) => w.key === key)) return;
    const next: RestockWatch[] = [
      ...watches,
      {
        key,
        product_id: String(productId),
        variation_id: variationId,
        title,
        variation_label: variationLabel,
        created_at: new Date().toISOString(),
      },
    ];
    await persistWatches(next);
  }, [persistWatches, user, watches]);

  const removeWatch = useCallback(async (productId: string | number, variationId?: number) => {
    const key = watchKey(productId, variationId);
    await persistWatches(watches.filter((w) => w.key !== key));
  }, [persistWatches, watches]);

  const setEnabled = useCallback(async (next: boolean) => {
    setEnabledState(next);
    if (user) await storage.setItem(enabledStorageKey(user.id), next);
  }, [user]);

  const checkNow = useCallback(async () => {
    if (!user || !enabled || !hydrated || checkingRef.current || watches.length === 0) return;
    checkingRef.current = true;
    lastCheckRef.current = Date.now();
    try {
      const permissions = Platform.OS === "web" ? null : await Notifications.getPermissionsAsync().catch(() => null);
      const canNotify = Platform.OS !== "web" && permissions?.status === "granted";
      const availableKeys = new Set<string>();

      await Promise.all(watches.slice(0, 50).map(async (watch) => {
        try {
          const product = toProduct(await nest.getProduct(watch.product_id));
          let available = product.in_stock;
          if (watch.variation_id != null) {
            const variation = product.variation_details?.find((v) => v.id === watch.variation_id);
            available = !!variation && variation.stock_status !== "outofstock" && variation.is_purchasable;
          }
          if (!available || !canNotify) return;

          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Back in stock",
              body: `${watch.title}${watch.variation_label ? ` (${watch.variation_label})` : ""} is available again.`,
              data: {
                source: "local_restock",
                type: "back_in_stock",
                object_id: watch.product_id,
              },
            },
            trigger: null,
          });
          availableKeys.add(watch.key);
        } catch {
          // A missing product, temporary network failure, or malformed variation
          // should not erase the buyer's watch. We'll try again next foreground.
        }
      }));

      if (availableKeys.size > 0) {
        const next = watches.filter((w) => !availableKeys.has(w.key));
        await persistWatches(next);
      }
    } finally {
      checkingRef.current = false;
    }
  }, [enabled, hydrated, persistWatches, user, watches]);

  useEffect(() => {
    if (!user || !enabled || !hydrated || watches.length === 0) return undefined;

    // Check once after hydration so a returning buyer can get the alert without
    // having to navigate back to the product first.
    const timer = setTimeout(() => { void checkNow(); }, 500);
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (Date.now() - lastCheckRef.current < CHECK_INTERVAL_MS) return;
      void checkNow();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [checkNow, enabled, hydrated, user, watches.length]);

  const value = useMemo<RestockAlertsContextValue>(() => ({
    watches,
    enabled,
    hydrated,
    isWatching,
    addWatch,
    removeWatch,
    setEnabled,
    checkNow,
  }), [addWatch, checkNow, enabled, hydrated, isWatching, removeWatch, setEnabled, watches]);

  return <RestockAlertsContext.Provider value={value}>{children}</RestockAlertsContext.Provider>;
}

export function useRestockAlerts(): RestockAlertsContextValue {
  const ctx = useContext(RestockAlertsContext);
  if (!ctx) throw new Error("useRestockAlerts must be used inside RestockAlertsProvider");
  return ctx;
}
