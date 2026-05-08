/**
 * Normalizes a Pakistani phone number to canonical 10-digit format: `3xxxxxxxxx`
 * (no leading zero, no country code).
 *
 * Accepted inputs:
 *   03001234567  →  3001234567  (local format with leading zero)
 *   3001234567   →  3001234567  (already canonical)
 *   +923001234567 → 3001234567  (E.164 with plus)
 *   923001234567  → 3001234567  (E.164 without plus)
 *
 * Returns the cleaned string as-is if it does not match any known pattern.
 */
export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  if (/^\+?92(3\d{9})$/.test(cleaned)) {
    const match = cleaned.match(/^\+?92(3\d{9})$/);
    return match![1]!;
  }
  if (/^0(3\d{9})$/.test(cleaned)) {
    const match = cleaned.match(/^0(3\d{9})$/);
    return match![1]!;
  }
  return cleaned;
}

/**
 * Returns true if the raw input represents a valid Pakistani mobile number
 * that normalizes to a 10-digit `3xxxxxxxxx` string.
 * This is the hardcoded fallback validator.
 */
export function isValidPakistaniPhone(raw: string): boolean {
  return /^3\d{9}$/.test(normalizePhone(raw));
}

/**
 * Build a phone validator using the regex pattern from platform config.
 * Falls back to `isValidPakistaniPhone` only when no pattern is provided
 * or the provided pattern is an invalid regex. When a valid pattern is
 * supplied it is used exclusively — the Pakistani fallback is not OR'ed in.
 */
export function buildPhoneValidator(
  phoneFormat?: string,
): (raw: string) => boolean {
  if (!phoneFormat) return isValidPakistaniPhone;
  try {
    const re = new RegExp(phoneFormat);
    return (raw: string) => re.test(raw);
  } catch {
    return isValidPakistaniPhone;
  }
}
