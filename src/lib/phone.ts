import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Sanitizes a raw phone value from an Amazon export into E.164.
 * Defaults to India (+91) when no country code is present.
 * Returns null when the number is not a valid mobile-capable number.
 */
export function sanitizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const parsed = parsePhoneNumberFromString(text, "IN");
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // E.164 with leading +
}
