// v1.0.73 — Lightweight offline detector.
// We can't add @react-native-community/netinfo mid-thread (npm install times
// out in this sandbox), so this pub/sub tracks connectivity by watching the
// codes that src/api/nest.ts throws. On a "network_error" or "request_timeout"
// we flip offline=true, then poll a tiny GET every 15s until it succeeds.
//
// This intentionally lives OUTSIDE the API client so callers can subscribe
// without importing the whole nest module tree.
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { ApiError, nest, onNetworkError } from "@/src/api/nest";

type NetworkContextValue = {
  isOffline: boolean;
  /** Manually flag a request as offline-y from a catch handler. */
  reportNetworkError: (err: unknown) => void;
};

const Ctx = createContext<NetworkContextValue>({
  isOffline: false,
  reportNetworkError: () => {},
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        // getSiteHealth is a cheap public GET on our WP proxy; falls back to
        // getFeaturedCategories if health isn't present in this build.
        // We just care that *something* comes back OK.
        await nest.getCategories();
        setIsOffline(false);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        /* still offline; keep polling */
      }
    }, 15000);
  };

  const reportNetworkError = (err: unknown) => {
    if (err instanceof ApiError && (err.code === "network_error" || err.code === "request_timeout")) {
      setIsOffline(true);
      startPolling();
    }
  };

  useEffect(() => {
    // Subscribe to every network_error / request_timeout raised anywhere in
    // the app. First failure flips us to offline; polling picks recovery up.
    const off = onNetworkError(() => {
      setIsOffline(true);
      startPolling();
    });
    return () => {
      off();
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Ctx.Provider value={{ isOffline, reportNetworkError }}>{children}</Ctx.Provider>
  );
}

export function useNetwork() {
  return useContext(Ctx);
}
