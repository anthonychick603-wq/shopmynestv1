// v1.0.119 \u2014 shared UTC-aware date parser.
//
// The WordPress plugin stores every notification / order / message
// timestamp with current_time( 'mysql', true ) \u2014 the `true` means GMT,
// so the value on disk (e.g. "2026-08-21 10:38:00") is UTC. The REST
// layer returns that string as-is with no timezone suffix.
//
// JavaScript's Date parser treats "2026-08-21 10:38:00" (space
// separator, no Z, no offset) as LOCAL time on iOS/Android, which
// makes every timestamp look 4-8 hours older/newer than it actually is
// once formatDistanceToNow runs. Users see "New message... about 6
// hours ago" for a message they received seconds ago.
//
// parseServerDate normalises those strings back to real Date objects:
//
//   * ISO 8601 with `T` and `Z` / offset  \u2192 passed through unchanged
//   * "YYYY-MM-DD HH:MM:SS"                \u2192 treated as UTC (`T` + `Z`
//                                             appended)
//   * "YYYY-MM-DDTHH:MM:SS" (no suffix)    \u2192 treated as UTC (`Z`
//                                             appended)
//   * "YYYY-MM-DD"                         \u2192 treated as UTC midnight
//   * empty / null / bad input             \u2192 returns null so callers
//                                             can render "" instead of
//                                             "Invalid Date"
//
// Use everywhere we would previously have written `new Date(str)` for
// a server-supplied timestamp.

export function parseServerDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Already carries a timezone marker \u2014 trust it.
  const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  if (hasTZ) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // Normalise SQL "YYYY-MM-DD HH:MM:SS" to ISO "YYYY-MM-DDTHH:MM:SS".
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
    s = s.replace(" ", "T");
  }

  // Date-only \u2014 anchor to UTC midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    s = s + "T00:00:00Z";
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) {
    // ISO-shaped but missing a suffix \u2014 append UTC marker.
    s = s + "Z";
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
