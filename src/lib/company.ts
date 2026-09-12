'use client';

/**
 * The signed-in user's company, from the company master, fetched once.
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
 * bank block is present only when the company has entered its own details.
 */

import { useEffect, useState } from 'react';

import { apiClient } from './api';

export interface CompanyBank {
  bank_name: string | null;
  bank_branch: string | null;
  account_no: string;
  ifsc: string;
}

export interface Company {
  id: string;
  name: string;
  legal_name: string;
  trade_name: string | null;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
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
  bank: CompanyBank | null;
}

let cached: Company | null = null;
let inflight: Promise<Company | null> | null = null;

export async function fetchCompany(force = false): Promise<Company | null> {
  if (cached && !force) return cached;
  if (inflight && !force) return inflight;
  inflight = apiClient
    .get('/auth/me')
    .then((res) => {
      cached = (res.data?.company as Company) ?? null;
      return cached;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Drop the cached company, e.g. after sign-out or a company-master edit. */
export function clearCompanyCache(): void {
  cached = null;
}

export function useCompany(): { company: Company | null; loading: boolean } {
  const [company, setCompany] = useState<Company | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let live = true;
    fetchCompany().then((c) => {
      if (!live) return;
      setCompany(c);
      setLoading(false);
    });
    return () => {
      live = false;
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
