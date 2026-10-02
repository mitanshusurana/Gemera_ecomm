'use client';

/**
 * The signed-in user's company, from the company master, fetched once and
 * shared by every screen that prints or shows it.
 *
 * Every printed document names the legal person charging or claiming the tax
 * on it, and none of them had anywhere to get that from. The tax invoice read
 * `invoice.company`, which nothing populated, so every invoice went out headed
 * "COMPANY NOT CONFIGURED". The purchase voucher read a NEXT_PUBLIC_ variable
 * that Next.js inlines at build time and the container only received at run
 * time, so it fell back to a literal -- "CARATLOOP MANUFACTURING LLP", an
 * address in Sitapura and a bank account that belong to nobody.
 *
 * GET /auth/me returns the company as recorded in caratloop.companies. The
 * bank block is the account flagged as default under Settings > Bank & Cash,
 * falling back to the company's own bank columns, and is present only when
 * one of them is filled in.
 *
 * The cache is module-level so the sidebar, the print components and the
 * settings form all see one copy; refreshCompany() re-reads it after a save
 * and notifies every mounted useCompany() so nothing shows the old address.
 */

import { useEffect, useState } from 'react';

import { apiClient } from './api';

export interface CompanyBank {
  account_id: string | null;
  account_name: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  account_no: string;
  ifsc: string;
  upi_id: string | null;
  source: 'account' | 'company';
}

export interface Company {
  id: string;
  name: string;
  legal_name: string;
  trade_name: string | null;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  tan: string | null;
  msme_reg_no: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_code: string;
  state_name: string;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  fiscal_year_start: number;
  base_currency: string;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  is_active: boolean;
  created_at: string | null;
  bank: CompanyBank | null;
  default_bank_account_id: string | null;
}

let cached: Company | null = null;
let inflight: Promise<Company | null> | null = null;
const listeners = new Set<(c: Company | null) => void>();

function publish(c: Company | null) {
  listeners.forEach((fn) => fn(c));
}

export async function fetchCompany(force = false): Promise<Company | null> {
  if (cached && !force) return cached;
  if (inflight && !force) return inflight;
  inflight = apiClient
    .get('/auth/me')
    .then((res) => {
      cached = (res.data?.company as Company) ?? null;
      publish(cached);
      return cached;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Re-read the company after a save and update every mounted useCompany(). */
export function refreshCompany(): Promise<Company | null> {
  return fetchCompany(true);
}

/** Replace the cached copy with what a save returned, without a round trip. */
export function setCompanyCache(c: Company | null): void {
  cached = c;
  publish(c);
}

/** Drop the cached company, e.g. after sign-out. */
export function clearCompanyCache(): void {
  cached = null;
}

export function useCompany(): { company: Company | null; loading: boolean } {
  const [company, setCompany] = useState<Company | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let live = true;
    const onChange = (c: Company | null) => {
      if (live) setCompany(c);
    };
    listeners.add(onChange);
    fetchCompany().then((c) => {
      if (!live) return;
      setCompany(c);
      setLoading(false);
    });
    return () => {
      live = false;
      listeners.delete(onChange);
    };
  }, []);

  return { company, loading };
}

/** "08 - Rajasthan", or '' when the state is not on record. */
export function stateLabel(company: Company | null): string {
  if (!company?.state_code) return '';
  return company.state_name ? `${company.state_code} - ${company.state_name}` : company.state_code;
}

/** The address as one line, with nothing invented for missing parts. */
export function addressLine(company: Company | null): string {
  if (!company) return '';
  return [company.address_line1, company.address_line2, company.city, company.state_name, company.pincode]
    .filter(Boolean)
    .join(', ');
}
