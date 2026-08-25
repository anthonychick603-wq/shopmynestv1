/**
 * useLoadOnce \u2014 v1.0.167
 *
 * Vinted-style state preservation for list screens. Replaces the
 * common "useFocusEffect(() => load())" pattern that fires load() every
 * time the screen regains focus \u2014 which resets pagination, scroll
 * position, and any in-memory state the user built up.
 *
 * Behavior:
 *   \u2022 Fires `load()` once on first mount.
 *   \u2022 On subsequent focus events, only refires `load()` if the last
 *     successful load is older than `staleMs` (default 60 seconds).
 *   \u2022 Pull-to-refresh is handled by the caller; when the caller
 *     manually reloads it should call markLoaded() to reset the timer.
 *
 * Usage:
 *   const load = useCallback(async () => { ... }, [deps]);
 *   const { markLoaded } = useLoadOnce(load, { staleMs: 60_000 });
 *   const onRefresh = async () => { await load(); markLoaded(); };
 */
import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";

type Options = {
  /** Milliseconds after which a focus event triggers a refetch. Default 60s. */
  staleMs?: number;
  /** If false, no focus refetch ever fires. Default true. */
  refetchOnFocus?: boolean;
};

export function useLoadOnce(
  load: () => void | Promise<void>,
  opts: Options = {},
) {
  const { staleMs = 60_000, refetchOnFocus = true } = opts;
  const mountedRef = useRef(false);
  const lastLoadRef = useRef(0);

  const markLoaded = useCallback(() => {
    lastLoadRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    Promise.resolve(load()).finally(markLoaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot mount
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!mountedRef.current || !refetchOnFocus) return;
      if (Date.now() - lastLoadRef.current < staleMs) return;
      Promise.resolve(load()).finally(markLoaded);
    }, [load, staleMs, refetchOnFocus, markLoaded]),
  );

  return { markLoaded };
}
