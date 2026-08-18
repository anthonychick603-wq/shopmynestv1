// v1.0.63 — client-side recent searches for Browse.
//
// Keeps the last 8 non-empty search terms the user submitted on Browse. Stored
// locally with AsyncStorage — the backend already tracks saved searches (which
// are opt-in with alerts); this is the lighter-weight "I typed this once, show
// it back to me" recency list.

import { storage } from "@/src/utils/storage";

export const RECENT_SEARCHES_KEY = "browse.recent_searches.v1";
export const RECENT_SEARCHES_MAX = 8;

/**
 * Load the current recent-searches list. Returns [] on any error/miss.
 */
export async function loadRecentSearches(): Promise<string[]> {
  const raw = await storage.getItem<string[]>(RECENT_SEARCHES_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string" && s.length > 0);
}

/**
 * Push a new search term to the front. Dedupes (case-insensitive) and caps at
 * RECENT_SEARCHES_MAX. Returns the resulting list so callers can setState
 * without a second read.
 */
export async function addRecentSearch(term: string): Promise<string[]> {
  const trimmed = term.trim();
  if (!trimmed) return loadRecentSearches();
  const current = await loadRecentSearches();
  const lower = trimmed.toLowerCase();
  const filtered = current.filter((s) => s.toLowerCase() !== lower);
  const next = [trimmed, ...filtered].slice(0, RECENT_SEARCHES_MAX);
  await storage.setItem(RECENT_SEARCHES_KEY, next);
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  await storage.removeItem(RECENT_SEARCHES_KEY);
}
