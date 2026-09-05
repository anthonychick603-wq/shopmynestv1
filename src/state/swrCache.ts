/**
 * swrCache \u2014 v1.0.254
 *
 * Stale-while-revalidate disk cache for Home widgets. Reduces perceived
 * launch time from a cold start by hydrating page-1 data instantly from
 * disk, then refetching in the background and updating.
 *
 * Design notes:
 *   \u2022 Cache lives in AsyncStorage under keys prefixed `swr:<userId>:`.
 *     Scoping by user id ensures we never paint one user's Recently
 *     Viewed / For-You / abandoned-cart to another after account switch.
 *   \u2022 We store a small envelope { at: number, v: number, body: unknown }.
 *     `at` is used to (a) age out truly ancient entries and (b) surface
 *     the cache age to the caller if it wants to gate rendering.
 *     `v` is a schema version \u2014 bump it here to invalidate on release.
 *   \u2022 The cache is JSON-serializable. It's fine for lists of blog posts
 *     or product cards; do NOT put images, functions, or class instances
 *     in here.
 *   \u2022 Errors are swallowed by design \u2014 SWR is a UX optimization; the
 *     source of truth is the network fetch.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

// Bump if you make a breaking change to any cached shape (e.g. rename
// fields the Home tab reads). Old entries will be treated as misses.
const SCHEMA_VERSION = 1;

// Cache entries older than this are treated as misses. A fetch will
// happen anyway on mount, so this just prevents surprising \"came back
// from Google Play 3 weeks later, saw yesterday's list flash\" behavior.
const HARD_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

type Envelope<T> = { at: number; v: number; body: T };

function keyFor(userId: string | number | null | undefined, name: string): string {
  return `swr:${userId ?? "anon"}:${name}`;
}

export async function readSwr<T>(
  userId: string | number | null | undefined,
  name: string,
): Promise<{ body: T; ageMs: number } | null> {
  try {
    // Talk to AsyncStorage directly so we can store an arbitrary JSON
    // envelope with a generic body without fighting the wrapper's
    // recursive StorageItemValue constraint (`storage.getItem<T>()`
    // rejects generic T's that aren't fully JSON-primitive at compile
    // time). SWR is a pure best-effort side cache.
    const raw = await AsyncStorage.getItem(keyFor(userId, name));
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || typeof env !== "object") return null;
    if (env.v !== SCHEMA_VERSION) return null;
    const ageMs = Date.now() - (env.at ?? 0);
    if (ageMs > HARD_STALE_MS) return null;
    return { body: env.body, ageMs };
  } catch {
    return null;
  }
}

export async function writeSwr<T>(
  userId: string | number | null | undefined,
  name: string,
  body: T,
): Promise<void> {
  try {
    const env: Envelope<T> = { at: Date.now(), v: SCHEMA_VERSION, body };
    await AsyncStorage.setItem(keyFor(userId, name), JSON.stringify(env));
  } catch {
    /* SWR is best-effort */
  }
}

export async function clearSwrForUser(userId: string | number | null | undefined): Promise<void> {
  // v1.0.266 — Actually purge on logout. Prior version was a no-op which
  // meant a logout + login-as-different-user on the same device would read
  // the previous user's cached lists (Recently Viewed, For-You, abandoned
  // cart) until every screen re-fetched. Enumerate AsyncStorage, find every
  // key that matches this user's prefix, and delete them in one multiRemove.
  try {
    const prefix = `swr:${userId ?? "anon"}:`;
    const allKeys = await AsyncStorage.getAllKeys();
    const toRemove = allKeys.filter((k) => k.startsWith(prefix));
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch {
    /* best-effort */
  }
}

/**
 * v1.0.266 — Nuke every SWR entry across every user. Useful on a hard
 * account switch or when the schema version bumps mid-session.
 */
export async function clearAllSwr(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const toRemove = allKeys.filter((k) => k.startsWith("swr:"));
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch {
    /* best-effort */
  }
}
