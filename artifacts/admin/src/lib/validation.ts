/**
 * Shared admin-side input validators. Centralised so individual pages
 * stop hand-rolling regexes and mismatched checks.
 */

export const PHONE_REGEX = /^\+?[1-9]\d{6,14}$/;
export const PK_PHONE_REGEX = /^(?:\+?92|0)3\d{9}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

/** Accepts E.164 (+countrycode + 7-15 digits) OR Pakistani local 03xxxxxxxxx. */
export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return PHONE_REGEX.test(trimmed) || PK_PHONE_REGEX.test(trimmed);
}

/** Splits a comma separated string into a deduped, trimmed list. */
export function splitCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  const out = new Set<string>();
  for (const piece of value.split(",")) {
    const t = piece.trim();
    if (t) out.add(t);
  }
  return Array.from(out);
}
