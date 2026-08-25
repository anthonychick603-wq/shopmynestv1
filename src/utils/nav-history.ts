// v1.0.168 — The parallel navigation history tracker is retired.
//
// The old file kept a module-level array of visited routes so safeBack
// could return the user to the "actual previous screen" whenever
// router.back() disagreed with it — typically because tab switches and
// dismissAll() calls could desync the real stack from what the user
// expected. That workaround is exactly the "second custom navigation
// history system" the Vinted-style spec forbids: it fights the real
// stack, doesn't track scroll/state (it just router.replace()'d,
// destroying the previous instance), and made "back" mean "whatever
// this tracker last saw" instead of "pop one screen off the stack."
//
// Under the current architecture:
//   • Every visited screen lives under a single (more) Stack.
//   • Alerts and Cart moved out of Tabs.Screen into (more)/ so the
//     header bell + cart button do a real stack push, not a peer tab
//     switch. Back naturally pops them.
//   • Tab-root re-entry no longer dismisses the (more) stack, so the
//     history the user expects to walk back through actually exists on
//     the underlying React Navigation stack.
//
// The exports below stay as no-ops / null returns so any lingering call
// sites keep compiling. New code MUST NOT rely on them.

export function recordRoute(_path: string): void {}

export function peekPreviousRoute(): string | null {
  return null;
}

export function consumePreviousRoute(): string | null {
  return null;
}

export function getHistorySnapshot(): string[] {
  return [];
}

export function clearHistory(): void {}
