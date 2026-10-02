"use client";

/**
 * Settings: the company master, bank & cash accounts, and the runtime view.
 *
 * Until now the company's GSTIN, address and bank details could only be
 * changed by SQL, and the two bank ledgers every company received were
 * placeholders named after banks the business may not use. This screen is
 * where the owner changes the legal person on every printed document, adds
 * or renames bank accounts, picks the one the invoice prints, and sees what
 * the API was started with (read-only; those values live in .env.erp).
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Landmark, SlidersHorizontal, Star, Edit, Plus, Loader2, Save, Users, Calendar,
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, Image as ImageIcon,
} from 'lucide-react';

import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  bankAccountsApi, companyApi, settingsApi,
  type BankAccount, type CompanyPatch, type CreateBankAccountPayload, type UpdateBankAccountPayload,
} from '@/lib/api';
import { refreshCompany, setCompanyCache, type Company } from '@/lib/company';
import { normaliseRole, useMe } from '@/lib/session';
import { formatCurrency } from '@/lib/utils';

// ─── helpers ────────────────────────────────────────────────────────────────

const errText = (err: any, fallback: string) => {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: any) => x.msg || JSON.stringify(x)).join('\n');
  return fallback;
};

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '0');
  return Number.isFinite(n) ? n : 0;
};

const fieldCls = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none disabled:opacity-50';
const labelCls = 'text-xs text-textSecondary';

// GST state codes, the same table the API derives the state from.
const STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  '97': 'Other Territory', '99': 'Centre Jurisdiction',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

type Tab = 'company' | 'bank' | 'config';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('company');
  const { me } = useMe();
  const role = normaliseRole(me?.role);
  const canEdit = role === 'owner' || role === 'admin';

  const tabs: { id: Tab; name: string; icon: typeof Building2 }[] = [
    { id: 'company', name: 'Company', icon: Building2 },
    { id: 'bank', name: 'Bank & Cash accounts', icon: Landmark },
    { id: 'config', name: 'Configuration', icon: SlidersHorizontal },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Settings</h1>
          <p className="text-textSecondary mt-1">The legal person on every document, the accounts it banks with, and how the API is configured.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/users" className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-textSecondary hover:text-white hover:border-primary/40"><Users className="w-4 h-4" /> Users</Link>
          <Link href="/fiscal-years" className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-textSecondary hover:text-white hover:border-primary/40"><Calendar className="w-4 h-4" /> Fiscal years</Link>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            data-tab={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-textSecondary hover:text-white'}`}
          >
            <t.icon className="w-4 h-4" /> {t.name}
          </button>
        ))}
      </div>

      {!canEdit && (
        <div className="glass-card p-3 text-xs text-textSecondary flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" /> Your role can view these settings; only an owner or admin can change them.
        </div>
      )}

      {tab === 'company' && <CompanyTab canEdit={canEdit} />}
      {tab === 'bank' && <BankAccountsTab canEdit={canEdit} />}
      {tab === 'config' && <ConfigurationTab />}
    </div>
  );
}

// ─── Company ────────────────────────────────────────────────────────────────

type CompanyForm = Record<string, string>;

const COMPANY_FIELDS = [
  'name', 'legal_name', 'trade_name', 'gstin', 'pan', 'cin', 'tan', 'msme_reg_no',
  'address_line1', 'address_line2', 'city', 'state_code', 'pincode', 'phone', 'email', 'website', 'logo_url',
  'fiscal_year_start', 'base_currency', 'bank_name', 'bank_branch', 'bank_account_no', 'bank_ifsc',
] as const;

function toForm(c: Company): CompanyForm {
  const f: CompanyForm = {};
  for (const k of COMPANY_FIELDS) {
    const v = (c as any)[k];
    f[k] = v === null || v === undefined ? '' : String(v);
  }
  return f;
}

function CompanyTab({ canEdit }: { canEdit: boolean }) {
  const { showToast } = useToast();
  const [company, setCompany] = useState<Company | null>(null);
  const [form, setForm] = useState<CompanyForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await companyApi.get();
      setCompany(res.data);
      setForm(toForm(res.data));
    } catch (err) {
      setError(errText(err, 'Could not load the company'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: string) => {
    if (!form) return;
    const next = { ...form, [k]: v };
    if (k === 'gstin') {
      const g = v.toUpperCase().trim();
      next.gstin = g;
      if (GSTIN_RE.test(g)) {
        // The GSTIN carries the state and the PAN: fill the state, and the PAN
        // when none is on record. A PAN that disagrees is flagged below.
        next.state_code = g.slice(0, 2);
        if (!next.pan) next.pan = g.slice(2, 12);
      }
    }
    if (k === 'pan' || k === 'tan' || k === 'cin' || k === 'bank_ifsc' || k === 'base_currency') next[k] = v.toUpperCase();
    setForm(next);
  };

  const gstinShaped = !!form?.gstin && GSTIN_RE.test(form.gstin);
  const gstinPan = gstinShaped ? form!.gstin.slice(2, 12) : null;
  const panMismatch = !!(gstinPan && form?.pan && form.pan !== gstinPan);
  const stateLocked = gstinShaped;

  const changes = useMemo((): CompanyPatch => {
    if (!form || !company) return {};
    const base = toForm(company);
    const out: Record<string, any> = {};
    for (const k of COMPANY_FIELDS) {
      if (form[k] !== base[k]) {
        if (k === 'fiscal_year_start') out[k] = form[k] === '' ? null : parseInt(form[k], 10);
        else out[k] = form[k] === '' ? null : form[k];
      }
    }
    return out as CompanyPatch;
  }, [form, company]);
  const dirty = Object.keys(changes).length > 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || panMismatch) return;
    setSaving(true);
    setError(null);
    try {
      const res = await companyApi.update({ ...changes, reason: 'Company settings updated' });
      setCompany(res.data);
      setForm(toForm(res.data));
      // Every mounted useCompany() -- the sidebar footer, the invoice print,
      // the purchase voucher -- gets the new row without a reload.
      setCompanyCache(res.data);
      showToast('success', 'Company saved', 'The printed documents now use these details.');
    } catch (err) {
      setError(errText(err, 'Could not save the company'));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return <div className="glass-card p-10 text-center text-textSecondary"><Loader2 className="w-5 h-5 animate-spin inline text-primary" /></div>;
  }

  const Field = ({ k, label, placeholder, mono, maxLength, type = 'text', hint }: { k: string; label: string; placeholder?: string; mono?: boolean; maxLength?: number; type?: string; hint?: string }) => (
    <div className="space-y-1">
      <label className={labelCls}>{label}</label>
      <input
        type={type}
        value={form[k]}
        disabled={!canEdit}
        onChange={(e) => set(k, e.target.value)}
        className={`${fieldCls} ${mono ? 'font-mono' : ''}`}
        placeholder={placeholder}
        maxLength={maxLength}
      />
      {hint && <p className="text-[11px] text-textSecondary">{hint}</p>}
    </div>
  );

  return (
    <form onSubmit={save} className="space-y-6">
      {error && <div className="glass-card p-3 text-sm text-red-400 whitespace-pre-line">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="glass-card p-5 space-y-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-white">Identity</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field k="legal_name" label="Legal name *" maxLength={200} hint="As registered; printed as the seller on every tax invoice." />
            <Field k="name" label="Short name *" maxLength={200} />
            <Field k="trade_name" label="Trade name" maxLength={200} />
            <Field k="logo_url" label="Logo URL" placeholder="https://…/logo.png" hint="Shown on printed documents when set." />
          </div>
        </section>

        <section className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2"><ImageIcon className="w-4 h-4 text-primary" /> Logo preview</h2>
          <div className="h-32 rounded-lg border border-dashed border-border flex items-center justify-center bg-white/5 overflow-hidden">
            {form.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logo_url} alt="Company logo" className="max-h-28 max-w-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.2'; }} />
            ) : (
              <span className="text-xs text-textSecondary">No logo URL</span>
            )}
          </div>
        </section>
      </div>

      <section className="glass-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Registrations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>GSTIN</label>
            <input value={form.gstin} disabled={!canEdit} onChange={(e) => set('gstin', e.target.value)} className={`${fieldCls} font-mono`} maxLength={15} placeholder="08AAACJ1234E1ZP" />
            <p className="text-[11px] text-textSecondary">
              {form.gstin && !gstinShaped ? <span className="text-warning">Not a 15-character GSTIN yet.</span> : gstinShaped ? `State ${form.state_code} - ${STATES[form.state_code] || '?'} from the GSTIN. The check digit is verified on save.` : 'Leave blank if unregistered.'}
            </p>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>PAN</label>
            <input value={form.pan} disabled={!canEdit} onChange={(e) => set('pan', e.target.value)} className={`${fieldCls} font-mono`} maxLength={10} />
            {panMismatch ? (
              <p className="text-[11px] text-red-400 flex items-center gap-2 flex-wrap">
                Differs from the PAN inside the GSTIN ({gstinPan}).
                {canEdit && <button type="button" onClick={() => set('pan', gstinPan!)} className="underline text-primary">Use {gstinPan}</button>}
              </p>
            ) : (
              <p className="text-[11px] text-textSecondary">{gstinPan ? 'Matches the GSTIN.' : '10 characters.'}</p>
            )}
          </div>
          <Field k="tan" label="TAN" mono maxLength={10} hint="For TDS returns (Form 26Q)." />
          <Field k="cin" label="CIN / LLPIN" mono maxLength={21} />
          <Field k="msme_reg_no" label="MSME / Udyam registration" maxLength={50} />
        </div>
      </section>

      <section className="glass-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Registered address</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field k="address_line1" label="Address line 1" maxLength={255} />
            <Field k="address_line2" label="Address line 2" maxLength={255} />
          </div>
          <Field k="city" label="City" maxLength={100} />
          <div className="space-y-1">
            <label className={labelCls}>State {stateLocked && <span className="text-textSecondary">(from GSTIN)</span>}</label>
            <select value={form.state_code} disabled={!canEdit || stateLocked} onChange={(e) => set('state_code', e.target.value)} className={fieldCls}>
              {!STATES[form.state_code] && <option value={form.state_code}>{form.state_code || '—'}</option>}
              {Object.entries(STATES).map(([code, name]) => <option key={code} value={code}>{code} - {name}</option>)}
            </select>
            <p className="text-[11px] text-textSecondary">Decides CGST+SGST against IGST on every document.</p>
          </div>
          <Field k="pincode" label="Pincode" mono maxLength={6} />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="glass-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Contact</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field k="phone" label="Phone" maxLength={15} />
            <Field k="email" label="Email" type="email" maxLength={255} />
            <div className="sm:col-span-2"><Field k="website" label="Website" maxLength={255} /></div>
          </div>
        </section>

        <section className="glass-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Books</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelCls}>Financial year starts in</label>
              <select value={form.fiscal_year_start} disabled={!canEdit} onChange={(e) => set('fiscal_year_start', e.target.value)} className={fieldCls}>
                {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
              </select>
              <p className="text-[11px] text-textSecondary">April for an Indian financial year. Applies to fiscal years created from now on.</p>
            </div>
            <Field k="base_currency" label="Base currency" mono maxLength={3} />
          </div>
        </section>
      </div>

      <section className="glass-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Remittance details (fallback)</h2>
          <p className="text-[11px] text-textSecondary mt-1">
            Printed on the tax invoice only while no account under <button type="button" className="underline text-primary" onClick={() => (document.querySelector('[data-tab=bank]') as HTMLButtonElement | null)?.click()}>Bank &amp; Cash accounts</button> is flagged default with its number and IFSC filled in.
            {company?.bank?.source === 'account' && <span className="text-success"> Currently printing from the default bank account {company.bank.account_name ? `“${company.bank.account_name}”` : ''}.</span>}
            {company?.bank?.source === 'company' && <span className="text-warning"> Currently printing these fallback details.</span>}
            {!company?.bank && <span className="text-warning"> Nothing on record: invoices print without remittance details.</span>}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field k="bank_name" label="Bank" maxLength={100} />
          <Field k="bank_branch" label="Branch" maxLength={100} />
          <Field k="bank_account_no" label="Account number" mono maxLength={34} />
          <Field k="bank_ifsc" label="IFSC" mono maxLength={11} />
        </div>
      </section>

      {canEdit && (
        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-textSecondary">{Object.keys(changes).length} field(s) changed</span>}
          <button type="button" disabled={!dirty || saving} onClick={() => company && setForm(toForm(company))} className="px-4 py-2 border border-border rounded-lg text-textSecondary hover:text-white disabled:opacity-40">Discard</button>
          <button type="submit" disabled={!dirty || saving || panMismatch} className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save company
          </button>
        </div>
      )}
    </form>
  );
}

// ─── Bank & Cash accounts ───────────────────────────────────────────────────

function BankAccountsTab({ canEdit }: { canEdit: boolean }) {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null | 'new'>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bankAccountsApi.list(showInactive);
      setAccounts(res.data?.accounts || []);
    } catch (err) {
      showToast('error', 'Could not load bank accounts', errText(err, ''));
    } finally {
      setLoading(false);
    }
  }, [showInactive, showToast]);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string, fn: () => Promise<any>, done: string) => {
    setBusyId(id);
    try {
      await fn();
      showToast('success', done);
      await load();
      // The invoice's remittance block follows the default bank account.
      refreshCompany();
    } catch (err) {
      showToast('error', 'Not done', errText(err, 'The change was refused'));
    } finally {
      setBusyId(null);
    }
  };

  const banks = accounts.filter((a) => a.account_type === 'Bank');
  const cash = accounts.filter((a) => a.account_type === 'Cash');

  const Row = ({ a }: { a: BankAccount }) => (
    <tr className={`hover:bg-white/5 ${!a.is_active ? 'opacity-50' : ''}`}>
      <td className="py-2.5 font-mono text-primary text-xs">{a.code}</td>
      <td className="py-2.5">
        <div className="text-white text-sm flex items-center gap-1.5">
          {a.name}
          {a.is_default_bank && <span title="Default: printed on invoices, used for online settlements"><Star className="w-3.5 h-3.5 fill-primary text-primary" /></span>}
        </div>
        {a.description && <div className="text-[11px] text-textSecondary">{a.description}</div>}
      </td>
      <td className="py-2.5 text-xs text-textSecondary">
        {a.account_type === 'Bank' ? (
          a.has_details ? (
            <>
              <div className="text-white">{a.bank_name || '—'}{a.bank_branch ? ` · ${a.bank_branch}` : ''}</div>
              <div className="font-mono">{a.bank_account_no} · {a.bank_ifsc}</div>
              {a.upi_id && <div className="font-mono">{a.upi_id}</div>}
            </>
          ) : (
            <span className="italic">No details yet</span>
          )
        ) : '—'}
      </td>
      <td className={`py-2.5 text-right font-mono text-sm ${num(a.balance_signed) < 0 ? 'text-red-400' : 'text-white'}`}>
        {formatCurrency(num(a.balance_abs))} <span className="text-[10px] text-textSecondary">{a.balance_side}</span>
        <div className="text-[10px] text-textSecondary">{a.posting_count} posting(s)</div>
      </td>
      <td className="py-2.5 text-center"><Badge variant={a.is_active ? 'success' : 'default'}>{a.is_active ? 'Active' : 'Inactive'}</Badge></td>
      {canEdit && (
        <td className="py-2.5 text-right whitespace-nowrap">
          <div className="inline-flex items-center gap-1">
            <button type="button" onClick={() => setEditing(a)} className="p-1.5 text-textSecondary hover:text-white" title="Edit"><Edit className="w-4 h-4" /></button>
            {a.account_type === 'Bank' && a.is_active && !a.is_default_bank && (
              <button type="button" disabled={busyId === a.id} onClick={() => act(a.id, () => bankAccountsApi.makeDefault(a.id), `${a.name} is now the default bank`)} className="p-1.5 text-textSecondary hover:text-primary disabled:opacity-40" title="Make default"><Star className="w-4 h-4" /></button>
            )}
            {a.is_active ? (
              <button
                type="button"
                disabled={busyId === a.id || a.is_default_bank || Math.abs(num(a.balance_signed)) > 0.005}
                title={a.is_default_bank ? 'Make another account the default first' : Math.abs(num(a.balance_signed)) > 0.005 ? 'Transfer the balance out first' : 'Deactivate'}
                onClick={() => act(a.id, () => bankAccountsApi.update(a.id, { is_active: false, reason: 'Bank account deactivated' }), `${a.name} deactivated`)}
                className="p-1.5 text-textSecondary hover:text-red-400 disabled:opacity-30"
              ><XCircle className="w-4 h-4" /></button>
            ) : (
              <button type="button" disabled={busyId === a.id} onClick={() => act(a.id, () => bankAccountsApi.update(a.id, { is_active: true, reason: 'Bank account reactivated' }), `${a.name} reactivated`)} className="p-1.5 text-textSecondary hover:text-success" title="Reactivate"><CheckCircle2 className="w-4 h-4" /></button>
            )}
          </div>
        </td>
      )}
    </tr>
  );

  const Table = ({ rows, title }: { rows: BankAccount[]; title: string }) => (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-textSecondary uppercase tracking-wider">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-textSecondary text-xs uppercase">
            <th className="pb-2 text-left font-medium">Code</th>
            <th className="pb-2 text-left font-medium">Account</th>
            <th className="pb-2 text-left font-medium">Bank details</th>
            <th className="pb-2 text-right font-medium">Balance</th>
            <th className="pb-2 text-center font-medium">Status</th>
            {canEdit && <th className="pb-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((a) => <Row key={a.id} a={a} />)}
          {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-xs text-textSecondary">None.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="glass-card p-5 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-textSecondary max-w-2xl">
            The account marked <Star className="w-3 h-3 inline fill-primary text-primary" /> is printed on the tax invoice for NEFT/RTGS and credited with online settlements from the storefront.
            Balances are the account's opening balance plus every posted voucher. An account with money in it, or the default, cannot be deactivated.
          </p>
          <div className="flex items-center gap-3">
            <label className="text-[11px] text-textSecondary flex items-center gap-1">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-primary" /> show inactive
            </label>
            <button type="button" onClick={load} className="p-1.5 text-textSecondary hover:text-white" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
            {canEdit && (
              <button type="button" onClick={() => setEditing('new')} className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90">
                <Plus className="w-4 h-4" /> Add account
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-textSecondary"><Loader2 className="w-5 h-5 animate-spin inline text-primary" /></div>
        ) : (
          <>
            <Table rows={banks} title="Bank accounts" />
            <Table rows={cash} title="Cash" />
          </>
        )}
      </div>

      {editing && (
        <BankAccountModal
          account={editing === 'new' ? null : editing}
          hasDefault={accounts.some((a) => a.is_default_bank)}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null);
            await load();
            refreshCompany();
          }}
        />
      )}
    </div>
  );
}

function BankAccountModal({ account, hasDefault, onClose, onDone }: { account: BankAccount | null; hasDefault: boolean; onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: account?.name || '',
    account_type: (account?.account_type || 'Bank') as 'Bank' | 'Cash',
    bank_name: account?.bank_name || '',
    bank_branch: account?.bank_branch || '',
    bank_account_no: account?.bank_account_no || '',
    bank_ifsc: account?.bank_ifsc || '',
    upi_id: account?.upi_id || '',
    description: account?.description || '',
    opening_balance: '',
    opening_date: '',
    is_default_bank: account?.is_default_bank || false,
  });
  const set = (k: keyof typeof form, v: any) => setForm({ ...form, [k]: v });
  const isBank = form.account_type === 'Bank';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const nul = (v: string) => (v.trim() === '' ? null : v.trim());
    try {
      if (account) {
        const data: UpdateBankAccountPayload = {
          name: form.name,
          description: nul(form.description),
          reason: 'Bank account updated',
        };
        if (isBank) {
          data.bank_name = nul(form.bank_name);
          data.bank_branch = nul(form.bank_branch);
          data.bank_account_no = nul(form.bank_account_no);
          data.bank_ifsc = nul(form.bank_ifsc.toUpperCase());
          data.upi_id = nul(form.upi_id);
          if (form.is_default_bank && !account.is_default_bank) data.is_default_bank = true;
        }
        await bankAccountsApi.update(account.id, data);
        showToast('success', `${form.name} saved`);
      } else {
        const data: CreateBankAccountPayload = {
          name: form.name,
          account_type: form.account_type,
          description: nul(form.description),
          opening_balance: form.opening_balance === '' ? null : form.opening_balance,
          opening_date: nul(form.opening_date),
          is_default_bank: isBank && form.is_default_bank,
          reason: 'Bank account created',
        };
        if (isBank) {
          data.bank_name = nul(form.bank_name);
          data.bank_branch = nul(form.bank_branch);
          data.bank_account_no = nul(form.bank_account_no);
          data.bank_ifsc = nul(form.bank_ifsc.toUpperCase());
          data.upi_id = nul(form.upi_id);
        }
        const res = await bankAccountsApi.create(data);
        showToast('success', `${res.data?.code} created`, res.data?.is_default_bank ? 'It is the default bank account.' : undefined);
      }
      onDone();
    } catch (err) {
      setError(errText(err, 'Could not save the account'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={account ? `Edit ${account.code}` : 'New bank or cash account'}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="p-3 rounded-lg bg-red-500/10 text-sm text-red-400 whitespace-pre-line">{error}</div>}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <label className={labelCls}>Account name *</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={fieldCls} required maxLength={200} placeholder={isBank ? 'HDFC Bank — Current A/c' : 'Petty cash'} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Type</label>
            <select value={form.account_type} disabled={!!account} onChange={(e) => set('account_type', e.target.value)} className={fieldCls}>
              <option value="Bank">Bank</option>
              <option value="Cash">Cash</option>
            </select>
          </div>
        </div>
        {isBank && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelCls}>Bank</label>
              <input value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} className={fieldCls} maxLength={100} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Branch</label>
              <input value={form.bank_branch} onChange={(e) => set('bank_branch', e.target.value)} className={fieldCls} maxLength={100} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Account number</label>
              <input value={form.bank_account_no} onChange={(e) => set('bank_account_no', e.target.value)} className={`${fieldCls} font-mono`} maxLength={34} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>IFSC</label>
              <input value={form.bank_ifsc} onChange={(e) => set('bank_ifsc', e.target.value.toUpperCase())} className={`${fieldCls} font-mono`} maxLength={11} placeholder="HDFC0001234" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className={labelCls}>UPI id</label>
              <input value={form.upi_id} onChange={(e) => set('upi_id', e.target.value)} className={`${fieldCls} font-mono`} maxLength={100} placeholder="shop@okhdfcbank" />
            </div>
          </div>
        )}
        <div className="space-y-1">
          <label className={labelCls}>Description</label>
          <input value={form.description} onChange={(e) => set('description', e.target.value)} className={fieldCls} />
        </div>
        {!account && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelCls}>Opening balance</label>
              <input type="number" step="0.01" value={form.opening_balance} onChange={(e) => set('opening_balance', e.target.value)} className={`${fieldCls} font-mono`} placeholder="0.00" />
              <p className="text-[11px] text-textSecondary">Negative for an overdraft. Written as the account's opening balance in the chart.</p>
            </div>
            <div className="space-y-1">
              <label className={labelCls}>As at</label>
              <input type="date" value={form.opening_date} onChange={(e) => set('opening_date', e.target.value)} className={fieldCls} />
            </div>
          </div>
        )}
        {isBank && (
          <label className="flex items-center gap-2 text-xs text-textSecondary">
            <input type="checkbox" checked={form.is_default_bank} disabled={!!account?.is_default_bank} onChange={(e) => set('is_default_bank', e.target.checked)} className="accent-primary" />
            Default bank account (printed on invoices, used for online settlements)
            {!account && !hasDefault && <span className="text-primary">— the first bank account becomes the default automatically</span>}
          </label>
        )}
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-textSecondary hover:text-white">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg disabled:opacity-50">{saving ? 'Saving…' : account ? 'Save' : 'Create account'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Configuration (read-only) ──────────────────────────────────────────────

function Flag({ on, yes = 'Yes', no = 'No' }: { on: boolean; yes?: string; no?: string }) {
  return on
    ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="w-3.5 h-3.5" /> {yes}</span>
    : <span className="inline-flex items-center gap-1 text-textSecondary"><XCircle className="w-3.5 h-3.5" /> {no}</span>;
}

function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="py-2 flex items-start justify-between gap-4">
          <dt className="text-textSecondary text-xs">{k}</dt>
          <dd className="text-white text-right font-mono text-xs">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ConfigurationTab() {
  const [view, setView] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    settingsApi.runtime().then((res) => setView(res.data)).catch((err) => setError(errText(err, 'Could not load the configuration')));
  }, []);

  if (error) return <div className="glass-card p-4 text-sm text-red-400">{error}</div>;
  if (!view) return <div className="glass-card p-10 text-center text-textSecondary"><Loader2 className="w-5 h-5 animate-spin inline text-primary" /></div>;

  const inr = (v: any) => formatCurrency(num(v));
  const pct = (v: any) => `${num(v)}%`;

  return (
    <div className="space-y-4">
      <div className="glass-card p-3 text-xs text-textSecondary flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <span>
          These values come from <code className="font-mono text-white">.env.erp</code> on the server and are read once when the API starts.
          They cannot be changed here: edit the file and restart the API container. Credentials are shown only as present or absent.
          Environment: <span className="font-mono text-white">{view.environment}</span>.
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="glass-card p-5 space-y-2">
          <h2 className="text-sm font-semibold text-white">Seller state (GST)</h2>
          <KV rows={[
            ['In use', `${view.seller_state.in_use} - ${view.seller_state.in_use_name || ''}`],
            ['Taken from', view.seller_state.from === 'company' ? 'Company master (Settings > Company)' : 'COMPANY_STATE_CODE setting'],
            ['Setting default', `${view.seller_state.setting_default} - ${view.seller_state.setting_default_name}`],
            ['Material GST', pct(view.gst_rates.material_pct)],
            ['Making GST', pct(view.gst_rates.making_pct)],
            ['RCM on old gold', pct(view.gst_rates.rcm_pct)],
          ]} />
        </section>

        <section className="glass-card p-5 space-y-2">
          <h2 className="text-sm font-semibold text-white">e-Invoice (IRN) and e-Way Bill</h2>
          <KV rows={[
            ['Provider', view.einvoice.provider],
            ['Enabled', <Flag key="e" on={view.einvoice.enabled} />],
            ['GSP base URL', <Flag key="u" on={view.einvoice.base_url_present} yes="Set" no="Not set" />],
            ['Client credentials', <Flag key="c" on={view.einvoice.client_credentials_present} yes="Present" no="Absent" />],
            ['User credentials', <Flag key="p" on={view.einvoice.user_credentials_present} yes="Present" no="Absent" />],
            ['e-Invoice GSTIN', <Flag key="g" on={view.einvoice.gstin_present} yes="Set" no="Not set" />],
            ['Threshold', num(view.einvoice.threshold_inr) ? inr(view.einvoice.threshold_inr) : 'Every B2B invoice'],
          ]} />
        </section>

        <section className="glass-card p-5 space-y-2">
          <h2 className="text-sm font-semibold text-white">TDS s.194Q and TCS s.206C(1H)</h2>
          <KV rows={[
            ['TDS 194Q on purchases', <Flag key="t" on={view.tds_194q.enabled} yes="Enabled" no="Off" />],
            ['TDS threshold / FY', inr(view.tds_194q.threshold_inr)],
            ['TDS rate', pct(view.tds_194q.rate_pct)],
            ['TDS rate without PAN', pct(view.tds_194q.no_pan_rate_pct)],
            ['TCS 206C(1H) on sales', <Flag key="c" on={view.tcs_206c1h.enabled} yes="Enabled" no="Off" />],
            ['TCS threshold / FY', inr(view.tcs_206c1h.threshold_inr)],
            ['TCS rate', pct(view.tcs_206c1h.rate_pct)],
          ]} />
        </section>

        <section className="glass-card p-5 space-y-2">
          <h2 className="text-sm font-semibold text-white">Storefront bridge</h2>
          <KV rows={[
            ['Enabled (API key present)', <Flag key="b" on={view.ecommerce_bridge.enabled} />],
            ['Settlement account setting', view.ecommerce_bridge.settlement_account_code || '— (uses the default bank)'],
            ['Settles into', view.ecommerce_bridge.settlement_account
              ? `${view.ecommerce_bridge.settlement_account.code} ${view.ecommerce_bridge.settlement_account.name} (${view.ecommerce_bridge.settlement_account.from === 'default_bank' ? 'default bank' : 'from setting'})`
              : 'No account found'],
            ['Company pinned', <Flag key="p" on={view.ecommerce_bridge.company_id_pinned} yes="Yes" no="Single active company" />],
            ['Old gold material code', view.ecommerce_bridge.old_gold_material_code],
            ['Old silver material code', view.ecommerce_bridge.old_silver_material_code],
          ]} />
        </section>

        <section className="glass-card p-5 space-y-2">
          <h2 className="text-sm font-semibold text-white">Documents and sessions</h2>
          <KV rows={[
            ['Invoice PDF storage (R2)', <Flag key="r" on={view.document_storage.r2_configured} yes="Configured" no="Not configured" />],
            ['Session length', `${view.sessions.jwt_expire_minutes} min`],
            ['CORS origins', (view.cors_origins || []).join(', ') || '—'],
          ]} />
        </section>
      </div>
    </div>
  );
}
