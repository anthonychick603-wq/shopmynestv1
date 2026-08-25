// v1.0.168 — Retired. Referring-tab tracking existed only to feed the
// old safeBack fallback path; that fallback no longer looks at it. The
// hook is now a no-op so the single mount site in app/_layout.tsx keeps
// compiling until it's removed in a follow-up.
export function useTrackReferringTab(): void {}
