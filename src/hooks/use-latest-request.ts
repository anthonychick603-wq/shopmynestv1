// v1.0.241 — Small primitive for guarding async work against the two
// classic React Native pitfalls:
//   1. Committing state after the component unmounted.
//   2. Stale responses winning over newer ones because they raced.
//
// Usage:
//
//   const { begin, isCurrent } = useLatestRequest();
//   const load = useCallback(async () => {
//     const id = begin();
//     const data = await api.getStuff();
//     if (!isCurrent(id)) return;  // superseded or unmounted
//     setStuff(data);
//   }, []);
//
// `begin()` bumps the internal request counter and returns the new id.
// `isCurrent(id)` returns true iff (a) the component is still mounted
// AND (b) no newer `begin()` has been called since. Callers should
// guard every post-await state setter with it.
import { useCallback, useEffect, useRef } from "react";

export function useLatestRequest() {
  const idRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const begin = useCallback(() => {
    idRef.current += 1;
    return idRef.current;
  }, []);

  const isCurrent = useCallback(
    (id: number) => mountedRef.current && idRef.current === id,
    [],
  );

  return { begin, isCurrent };
}
