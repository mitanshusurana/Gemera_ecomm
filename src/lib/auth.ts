/**
 * Session helpers for the ERP UI.
 *
 * The token key must match the one used by the axios client in lib/api.ts.
 * These previously read a different key ('token') and were imported nowhere,
 * so nothing in the app was ever gated on a session.
 */

export const TOKEN_KEY = 'caratloop_token';
export const USER_KEY = 'caratloop_user';

export interface SessionUser {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  company_id?: string;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Decode the JWT payload without verifying it.
 *
 * This is only ever used to avoid rendering a session the server will reject.
 * It is NOT an authorisation check: the API is the sole authority, and every
 * endpoint must enforce its own access control.
 */
function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodePayload(token);
  const exp = payload?.exp;
  if (typeof exp !== 'number') return false; // no exp claim: let the API decide
  return Date.now() >= exp * 1000;
}

export function isAuthenticated(): boolean {
  const token = getToken();
  return !!token && !isTokenExpired(token);
}

export function getUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable; nothing to clear */
  }
}

export function logout(redirectTo = '/'): void {
  clearSession();
  if (typeof window !== 'undefined') {
    window.location.href = redirectTo;
  }
}
