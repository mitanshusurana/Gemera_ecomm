/**
 * Password helpers shared by the Users page and the change-password dialog.
 *
 * The policy itself is enforced by the API (app/core/user_policy.py); the
 * constant here only lets the UI say so before the round trip.
 */

export const MIN_PASSWORD_LENGTH = 12;

// No 0/O, 1/l/I: a generated password is read out or typed from a note, and
// look-alike glyphs are how those get mistyped.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_+=?';

/** A random password of `length` characters from a browser CSPRNG. */
export function generatePassword(length = 16): string {
  const out: string[] = [];
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) out.push(ALPHABET[bytes[i] % ALPHABET.length]);
  } else {
    // Only reached in a browser without WebCrypto; the API still applies the
    // policy, so this is a convenience, not a security boundary.
    for (let i = 0; i < length; i++) out.push(ALPHABET[Math.floor(Math.random() * ALPHABET.length)]);
  }
  return out.join('');
}

/** Copy text to the clipboard; false if the browser refused. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

/**
 * The message the API sent, whether FastAPI's plain `detail` string or
 * pydantic's list of field errors, or `fallback` when there is neither.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => {
        const item = d as { loc?: unknown[]; msg?: string };
        const field = Array.isArray(item.loc) ? String(item.loc[item.loc.length - 1]) : '';
        return field && item.msg ? `${field}: ${item.msg}` : item.msg || '';
      })
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  return fallback;
}
