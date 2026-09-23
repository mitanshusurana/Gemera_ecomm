'use client';

/**
 * The signed-in user as the API sees them, from GET /auth/me.
 *
 * The role that gates the Users page and the Users nav entry comes from the
 * server, not from the copy of the login response in localStorage: that copy
 * is whatever the browser was handed at sign-in, and a role changed since then
 * (or edited by hand) must not decide what the UI offers. The stored copy is
 * used only as the first render's placeholder, so the header does not flash
 * empty; the API's answer replaces it.
 *
 * This is a usability control only. Every endpoint enforces its own role
 * check independently.
 */

import { useEffect, useState } from 'react';

import { apiClient } from './api';
import { getUser, type SessionUser } from './auth';

export interface MeUser {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
}

let cached: MeUser | null = null;
let inflight: Promise<MeUser | null> | null = null;

export async function fetchMe(force = false): Promise<MeUser | null> {
  if (cached && !force) return cached;
  if (inflight && !force) return inflight;
  inflight = apiClient
    .get('/auth/me')
    .then((res) => {
      cached = (res.data?.user as MeUser) ?? null;
      return cached;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function clearMeCache(): void {
  cached = null;
}

export function normaliseRole(role?: string | null): string {
  return (role || '').trim().toLowerCase();
}

/** The two roles the API lets manage users (app.core.roles.CAN_AMEND). */
export const USER_MANAGER_ROLES = ['owner', 'admin'];

export function canManageUsers(role?: string | null): boolean {
  return USER_MANAGER_ROLES.includes(normaliseRole(role));
}

export function useMe(): { me: MeUser | null; loading: boolean; verified: boolean } {
  const [me, setMe] = useState<MeUser | null>(cached);
  // `verified` is true once the value came from the API rather than storage.
  const [verified, setVerified] = useState(!!cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let live = true;
    if (!cached) {
      const stored: SessionUser | null = getUser();
      if (stored) setMe({ id: stored.id, name: stored.name, email: stored.email, role: stored.role });
    }
    fetchMe().then((u) => {
      if (!live) return;
      if (u) setMe(u);
      setVerified(!!u);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  return { me, loading, verified };
}
