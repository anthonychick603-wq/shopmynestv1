// Decode common WordPress / HTML entities. Fixes "&amp;" → "&".
const NAMED: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ldquo: "\u201C",
  rdquo: "\u201D",
  copy: "©",
  reg: "®",
  trade: "™",
  cent: "¢",
  pound: "£",
  euro: "€",
};

export function decodeEntities(input?: string | null): string {
  if (!input) return "";
  return input
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED[name] ?? m);
}

// Very light HTML → text (strip tags, keep line breaks after </p>).
export function stripHtml(input?: string | null): string {
  if (!input) return "";
  return decodeEntities(
    input
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}
