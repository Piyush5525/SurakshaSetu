const DEVANAGARI = /[ऀ-ॿ]/;

export function normalise(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `term` occurs in `text`. Latin terms need non-letter boundaries; Devanagari uses substring. */
export function containsTerm(text: string, term: string): boolean {
  const t = normalise(term);
  if (DEVANAGARI.test(t)) return text.includes(t);
  return new RegExp(`(?<![a-z])${escapeRegExp(t)}(?![a-z])`).test(text);
}

/** Returns the terms found. Empty/blank text yields no hits (no transcript => no keyword effect). */
export function findTerms(
  transcript: string | null | undefined,
  terms: readonly string[],
): string[] {
  const text = normalise(transcript ?? '');
  if (!text) return [];
  return terms.filter((term) => containsTerm(text, term));
}
