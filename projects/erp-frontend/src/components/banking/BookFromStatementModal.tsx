'use client';

import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import PartySelect from '@/components/ui/PartySelect';
import { apiClient, bankingApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

/**
 * Book a voucher for an unreconciled statement line and match it, without
 * leaving the reconciliation screen. Direction and amount come from the line:
 * a statement credit becomes a Receipt (Dr bank, Cr contra), a debit a
 * Payment (Dr contra, Cr bank). The contra side is either a party (customer or
 * supplier, optionally settling one of its open invoices) or any other ledger
 * account (bank charges, interest, capital, a direct expense).
 */
export interface StatementLineForBooking {
  id: string;
  txn_date: string;
  description?: string;
  ref_no?: string;
  debit?: number | string;
  credit?: number | string;
}

interface Account {
  id: string;
  code: string;
  name: string;
  nature?: string;
  group_name?: string;
}

interface Props {
  line: StatementLineForBooking | null;
  bankAccountId: string;
  onClose: () => void;
  onBooked: (result: any) => void;
}

export default function BookFromStatementModal({ line, bankAccountId, onClose, onBooked }: Props) {
  const isCredit = Number(line?.credit || 0) > 0;
  const amount = Number(isCredit ? line?.credit : line?.debit) || 0;
  const entryType = isCredit ? 'Receipt' : 'Payment';

  const [mode, setMode] = useState<'party' | 'ledger'>('party');
  const [partyId, setPartyId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [openInvoices, setOpenInvoices] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [accountQuery, setAccountQuery] = useState('');
  const [narration, setNarration] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [paymentMode, setPaymentMode] = useState('NEFT');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline ledger-account creation: the chart ships with no admin/overhead
  // accounts (rent, bank charges, salaries, suspense...), and leaving the
  // reconciliation screen to add one was a dead end.
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [groups, setGroups] = useState<Array<{ code: string; name: string; nature?: string }>>([]);
  const [newAccName, setNewAccName] = useState('');
  const [newAccGroup, setNewAccGroup] = useState('ADMIN_EXP');
  const [newAccCode, setNewAccCode] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);

  const suggestCode = (name: string, group: string) => {
    const prefix = ({ ADMIN_EXP: 'EXP', FIN_CHG: 'FIN', SELLING: 'SEL', MFG_EXP: 'MFG', OTH_INC: 'OTH', CA: 'CA', LIAB: 'LIA', PROV: 'PRV', FA: 'FA', LOANS: 'LN', EQUITY: 'CAP', DUTIES_TAXES: 'TAX' } as Record<string, string>)[group] || 'ACC';
    const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12);
    return slug ? `${prefix}-${slug}` : '';
  };

  const startCreateAccount = () => {
    setNewAccName(accountQuery.trim());
    setNewAccGroup('ADMIN_EXP');
    setNewAccCode(suggestCode(accountQuery.trim(), 'ADMIN_EXP'));
    setCreatingAccount(true);
    setError(null);
    if (groups.length === 0) {
      apiClient.get('/accounting/account-groups').then((res) => setGroups(res.data?.groups || [])).catch(() => setGroups([]));
    }
  };

  const saveAccount = async () => {
    const name = newAccName.trim();
    if (!name) {
      setError('Enter the account name.');
      return;
    }
    setSavingAccount(true);
    setError(null);
    try {
      const group = groups.find((g) => g.code === newAccGroup);
      const nature = (group?.nature || 'Expenses').toLowerCase();
      // Expenses and assets normally carry a debit balance; income, liabilities and equity a credit one.
      const nb = nature.startsWith('exp') || nature.startsWith('asset') ? 'D' : 'C';
      const res = await apiClient.post('/accounting/accounts', {
        code: (newAccCode.trim() || suggestCode(name, newAccGroup)).toUpperCase(),
        name,
        group_code: newAccGroup,
        normal_balance: nb,
        opening_balance: 0,
        opening_balance_type: nb,
        reason: 'Created while booking a bank statement line',
      });
      const created: Account = { id: res.data?.id || res.data?.account?.id, code: (newAccCode || suggestCode(name, newAccGroup)).toUpperCase(), name, group_name: group?.name, nature: group?.nature };
      if (!created.id) throw new Error('no id returned');
      setAccounts((prev) => [created, ...prev]);
      setAccountId(created.id);
      setAccountQuery('');
      setCreatingAccount(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not create the account.');
    } finally {
      setSavingAccount(false);
    }
  };

  // Reset per line.
  useEffect(() => {
    if (!line) return;
    setMode('party');
    setPartyId('');
    setInvoiceId('');
    setOpenInvoices([]);
    setAccountId('');
    setAccountQuery('');
    setNarration(`${entryType} per bank statement: ${line.description || ''}`.trim());
    setReferenceNo(line.ref_no || '');
    setError(null);
  }, [line, entryType]);

  // Ledger accounts other than the bank account itself.
  useEffect(() => {
    if (!line) return;
    apiClient
      .get('/accounting/accounts', { params: { limit: 1000 } })
      .then((res) => setAccounts((res.data?.accounts || []).filter((a: Account) => a.id !== bankAccountId)))
      .catch(() => setAccounts([]));
  }, [line, bankAccountId]);

  // Open invoices of the chosen party. The endpoint answers
  // { sales_invoices: [...], purchase_invoices: [...] }: a receipt settles a
  // sales invoice, a payment a purchase bill. Reading the whole object as a
  // list crashed the page ("v.map is not a function") as soon as a party was
  // chosen.
  useEffect(() => {
    if (!partyId) {
      setOpenInvoices([]);
      return;
    }
    apiClient
      .get(`/vouchers/open-invoices/${partyId}`)
      .then((res) => {
        const list = isCredit ? res.data?.sales_invoices : res.data?.purchase_invoices;
        setOpenInvoices(Array.isArray(list) ? list : []);
      })
      .catch(() => setOpenInvoices([]));
  }, [partyId, isCredit]);

  const filteredAccounts = useMemo(() => {
    const q = accountQuery.trim().toLowerCase();
    const list = q ? accounts.filter((a) => `${a.code} ${a.name} ${a.group_name || ''}`.toLowerCase().includes(q)) : accounts;
    return list.slice(0, 200);
  }, [accounts, accountQuery]);

  const submit = async () => {
    if (!line) return;
    if (mode === 'party' && !partyId) {
      setError('Choose the customer or supplier.');
      return;
    }
    if (mode === 'ledger' && !accountId) {
      setError('Choose the ledger account.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await bankingApi.bookStatementLine(line.id, {
        party_id: mode === 'party' ? partyId : undefined,
        contra_account_id: mode === 'ledger' ? accountId : undefined,
        invoice_id: mode === 'party' && invoiceId ? invoiceId : undefined,
        reference_no: referenceNo || undefined,
        narration: narration || undefined,
        payment_mode: paymentMode,
        reason: 'Booked from bank statement',
      });
      onBooked(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not book the entry.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full bg-background border border-border rounded-md px-3 py-2 text-white text-sm outline-none focus:border-primary';

  return (
    <Modal isOpen={!!line} onClose={onClose} title={`Book ${entryType} from statement`}>
      {line && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface/60 p-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-textSecondary">{line.txn_date}</span>
              <span className={`font-mono font-semibold ${isCredit ? 'text-success' : 'text-danger'}`}>
                {formatCurrency(amount)} {isCredit ? 'Cr (money in)' : 'Dr (money out)'}
              </span>
            </div>
            <div className="text-white mt-1 break-words">{line.description}</div>
            <div className="text-textSecondary text-xs mt-1">
              {isCredit ? 'Dr Bank / Cr contra' : 'Dr contra / Cr Bank'} · dated {line.txn_date}
            </div>
          </div>

          <div className="flex gap-2">
            {(['party', 'ledger'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md text-sm border ${mode === m ? 'bg-primary text-black border-primary font-semibold' : 'border-border text-textSecondary hover:text-white'}`}
              >
                {m === 'party' ? (isCredit ? 'From a customer' : 'To a supplier') : 'Other ledger account'}
              </button>
            ))}
          </div>

          {mode === 'party' ? (
            <>
              <div>
                <label className="block text-xs text-textSecondary mb-1">{isCredit ? 'Customer' : 'Supplier'}</label>
                <PartySelect value={partyId} onChange={(id) => { setPartyId(id); setInvoiceId(''); }} partyType={isCredit ? 'Customer' : 'Supplier'} />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Settle against invoice (optional)</label>
                <select className={inputCls} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} disabled={!partyId || openInvoices.length === 0}>
                  <option value="">{!partyId ? 'Choose the party first' : openInvoices.length === 0 ? 'No open invoices' : 'On account (no invoice)'}</option>
                  {openInvoices.map((inv: any) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_no} · {inv.invoice_date} · {formatCurrency(Number(inv.grand_total ?? 0))}
                      {inv.payment_status ? ` (${inv.payment_status})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs text-textSecondary mb-1">Ledger account</label>
              {creatingAccount ? (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <div className="text-sm font-semibold text-white">New ledger account</div>
                  <input className={inputCls} placeholder="Account name, e.g. Rent, Bank Charges, Suspense" value={newAccName} onChange={(e) => { setNewAccName(e.target.value); setNewAccCode(suggestCode(e.target.value, newAccGroup)); }} />
                  <select className={inputCls} value={newAccGroup} onChange={(e) => { setNewAccGroup(e.target.value); setNewAccCode(suggestCode(newAccName, e.target.value)); }}>
                    {(groups.length ? groups : [{ code: 'ADMIN_EXP', name: 'Admin & Overhead', nature: 'Expenses' }]).map((g) => (
                      <option key={g.code} value={g.code}>{g.name}{g.nature ? ` · ${g.nature}` : ''}</option>
                    ))}
                  </select>
                  <input className={inputCls} placeholder="Code" value={newAccCode} onChange={(e) => setNewAccCode(e.target.value)} />
                  <p className="text-xs text-textSecondary">Rent, salaries, electricity → Admin &amp; Overhead. Bank charges, interest paid → Finance Charges. Unidentified receipts or payments → a Suspense account under Current Assets, to be moved once known.</p>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setCreatingAccount(false)} className="px-3 py-1.5 rounded-md border border-border text-xs text-textSecondary hover:text-white">Back</button>
                    <button type="button" onClick={saveAccount} disabled={savingAccount} className="px-3 py-1.5 rounded-md bg-primary text-black text-xs font-semibold disabled:opacity-60">{savingAccount ? 'Saving…' : 'Create and select'}</button>
                  </div>
                </div>
              ) : (
                <>
                  <input className={`${inputCls} mb-2`} placeholder="Search by code, name or group" value={accountQuery} onChange={(e) => setAccountQuery(e.target.value)} />
                  <select className={inputCls} size={6} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    {filteredAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}{a.group_name ? ` (${a.group_name})` : ''}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={startCreateAccount} className="mt-2 text-xs text-primary hover:underline">
                    + Create a new ledger account{accountQuery.trim() ? ` “${accountQuery.trim()}”` : ''}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-textSecondary mb-1">Reference</label>
              <input className={inputCls} value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="UTR / cheque no." />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">Mode</label>
              <select className={inputCls} value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                {['NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Cash', 'Bank charges', 'Other'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">Narration</label>
            <textarea className={inputCls} rows={2} value={narration} onChange={(e) => setNarration(e.target.value)} />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-border text-textSecondary hover:text-white text-sm">Cancel</button>
            <button type="button" onClick={submit} disabled={submitting} className="px-4 py-2 rounded-md bg-primary text-black font-semibold text-sm disabled:opacity-60 flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Post {entryType} and match
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
