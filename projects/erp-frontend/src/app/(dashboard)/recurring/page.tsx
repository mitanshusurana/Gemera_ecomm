"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Pause, Play, Plus, RefreshCw, SkipForward } from 'lucide-react';

import Badge from '@/components/ui/Badge';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import PartySelect from '@/components/ui/PartySelect';
import { apiClient, bankingApi, expensesApi, ordersApi, recurringApi, RecurringProfile } from '@/lib/api';
import { today } from '@/lib/fiscal';
import { useQuickCreate } from '@/lib/quickCreate';
import { formatCurrency } from '@/lib/utils';

// What repeats: rent every month, a standing supplier bill, a retainer
// invoice. An expense may post itself on the due date; a bill or an invoice
// is raised by a person from a prefilled form and then moves to its next date.

const KIND_LABEL: Record<string, string> = { Expense: 'Expense', PurchaseBill: 'Purchase bill', SalesInvoice: 'Sales invoice' };
const UNIT: Record<string, string> = { Weekly: 'week', Monthly: 'month', Quarterly: 'quarter', Yearly: 'year' };
const fieldCls = 'w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-textPrimary focus:border-primary outline-none';

export default function RecurringPage() {
  const router = useRouter();
  const [rows, setRows] = useState<RecurringProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  // Form
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'Expense' | 'PurchaseBill' | 'SalesInvoice'>('Expense');
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('Monthly');
  const [everyN, setEveryN] = useState(1);
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState('');
  const [autoPost, setAutoPost] = useState(true);
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
  const [paidThrough, setPaidThrough] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [paidThroughId, setPaidThroughId] = useState('');
  const [amount, setAmount] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceBillId, setSourceBillId] = useState('');
  const [orderDocId, setOrderDocId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try { setRows((await recurringApi.list()).data?.profiles || []); } catch { setRows([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setKind('Expense'); setName(''); setFrequency('Monthly'); setEveryN(1); setStartDate(today()); setEndDate(''); setAutoPost(true);
    setExpenseAccountId(''); setPaidThroughId(''); setAmount(''); setVendorId(''); setNotes(''); setSourceBillId(''); setOrderDocId(''); setError('');
    setOpen(true);
    apiClient.get('/accounting/accounts', { params: { nature: 'Expenses', limit: 1000 } }).then((r) => setExpenseAccounts(r.data?.accounts || [])).catch(() => {});
    bankingApi.getAccounts().then((r) => setPaidThrough((Array.isArray(r.data) ? r.data : []).filter((a: any) => a.account_type === 'Bank' || a.account_type === 'Cash'))).catch(() => {});
    apiClient.get('/purchases/invoices', { params: { limit: 100 } }).then((r) => setBills((Array.isArray(r.data) ? r.data : []).filter((b: any) => b.status === 'Posted'))).catch(() => {});
    Promise.all([ordersApi.list({ doc_type: 'SalesOrder' }), ordersApi.list({ doc_type: 'Quote' })])
      .then(([a, b]) => setOrders([...(a.data?.documents || []), ...(b.data?.documents || [])].filter((d) => d.status !== 'Cancelled')))
      .catch(() => {});
  };
  useQuickCreate(openNew);

  const save = async () => {
    setError('');
    if (name.trim().length < 2) { setError('Give the profile a name, e.g. "Shop rent".'); return; }
    let template: any;
    if (kind === 'Expense') {
      if (!expenseAccountId || !paidThroughId || !(Number(amount) > 0)) { setError('Choose the expense account, the paid-through account and the amount.'); return; }
      template = { expense_account_id: expenseAccountId, paid_through_account_id: paidThroughId, amount: Number(amount), vendor_id: vendorId || undefined, notes: notes.trim() || name.trim() };
    } else if (kind === 'PurchaseBill') {
      if (!sourceBillId) { setError('Choose the bill to repeat.'); return; }
      template = { source_invoice_id: sourceBillId };
    } else {
      if (!orderDocId) { setError('Choose the quote or sales order to invoice each time.'); return; }
      template = { order_document_id: orderDocId };
    }
    setSaving(true);
    try {
      await recurringApi.create({ kind, name: name.trim(), frequency, every_n: everyN, start_date: startDate, end_date: endDate || undefined, auto_post: kind === 'Expense' && autoPost, template });
      setOpen(false);
      load();
    } catch (err: any) {
      const d = err.response?.data?.detail;
      setError(typeof d === 'string' ? d : 'Could not save the profile.');
    } finally {
      setSaving(false);
    }
  };

  const raise = async (p: RecurringProfile) => {
    if (p.kind === 'PurchaseBill') { router.push(`/purchases?repeat=${p.template.source_invoice_id}&recurring=${p.id}`); return; }
    if (p.kind === 'SalesInvoice') { router.push(`/sales?from_order=${p.template.order_document_id}&recurring=${p.id}`); return; }
    if (!confirm(`Record ${p.name} of ${formatCurrency(p.amount)} dated ${new Date(p.next_run_date).toLocaleDateString('en-IN')}?`)) return;
    setBusy(p.id);
    try {
      const res = await expensesApi.create({ ...(p.template as any), expense_date: p.next_run_date });
      await recurringApi.advance(p.id, res.data?.expense_no);
      load();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Could not record the expense.');
    } finally {
      setBusy(null);
    }
  };

  const act = async (p: RecurringProfile, what: 'Paused' | 'Active' | 'Ended' | 'skip') => {
    if (what === 'Ended' && !confirm(`End "${p.name}"? It will not repeat again.`)) return;
    if (what === 'skip' && !confirm(`Skip the ${new Date(p.next_run_date).toLocaleDateString('en-IN')} occurrence of "${p.name}"?`)) return;
    setBusy(p.id);
    try {
      if (what === 'skip') await recurringApi.advance(p.id); else await recurringApi.setStatus(p.id, what);
      load();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const runDue = async () => {
    setNotice('');
    try {
      const res = await recurringApi.runDue();
      setNotice(`${res.data?.posted?.length || 0} expense(s) posted${res.data?.paused?.length ? `, ${res.data.paused.length} profile(s) paused: ${res.data.paused.map((x: any) => x.reason).join('; ')}` : ''}.`);
      load();
    } catch (err: any) {
      setNotice(err.response?.data?.detail || 'Could not run the due profiles.');
    }
  };

  const btn = 'px-2 py-1 bg-surface border border-border hover:border-primary text-textSecondary hover:text-textPrimary rounded text-xs flex items-center gap-1 disabled:opacity-50';
  const columns = [
    { header: 'Profile', accessorKey: 'name', cell: (p: RecurringProfile) => (
      <span>
        <span className="block font-medium text-textPrimary">{p.name}</span>
        <span className="block text-xs text-textSecondary">{KIND_LABEL[p.kind]} · every {p.every_n > 1 ? `${p.every_n} ` : ''}{UNIT[p.frequency] || p.frequency}{p.every_n > 1 ? 's' : ''}{p.auto_post ? ' · posts itself' : ''}</span>
      </span>
    ) },
    { header: 'Amount (₹)', accessorKey: 'amount', cell: (p: RecurringProfile) => <span className="font-mono text-textPrimary">{formatCurrency(p.amount)}</span> },
    { header: 'Next Due', accessorKey: 'next_run_date', cell: (p: RecurringProfile) => (
      <span>
        <span className={`block text-sm ${p.is_due ? 'text-warning font-semibold' : 'text-textPrimary'}`}>{p.status === 'Ended' ? '—' : new Date(p.next_run_date).toLocaleDateString('en-IN')}</span>
        <span className="block text-xs text-textSecondary">{p.last_document_no ? `last: ${p.last_document_no}` : `${p.periods_done} raised`}</span>
      </span>
    ) },
    { header: 'Status', accessorKey: 'status', cell: (p: RecurringProfile) => (
      <span>
        <Badge variant={p.is_due ? 'warning' : p.status === 'Active' ? 'success' : 'default'}>{p.is_due ? 'Due' : p.status}</Badge>
        {p.last_error && <span className="block text-[11px] text-danger mt-1 max-w-[220px]">{p.last_error}</span>}
      </span>
    ) },
    { header: 'Actions', accessorKey: 'id', cell: (p: RecurringProfile) => (
      <span className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
        {p.is_due && !p.auto_post && <button className={btn} disabled={busy === p.id} onClick={() => raise(p)}><ArrowRight className="w-3.5 h-3.5" /> {p.kind === 'Expense' ? 'Record' : 'Raise'}</button>}
        {p.status === 'Active' && <button className={btn} disabled={busy === p.id} onClick={() => act(p, 'skip')} title="Skip this occurrence"><SkipForward className="w-3.5 h-3.5" /></button>}
        {p.status === 'Active' && <button className={btn} disabled={busy === p.id} onClick={() => act(p, 'Paused')} title="Pause"><Pause className="w-3.5 h-3.5" /></button>}
        {p.status === 'Paused' && <button className={btn} disabled={busy === p.id} onClick={() => act(p, 'Active')} title="Resume"><Play className="w-3.5 h-3.5" /> Resume</button>}
        {p.status !== 'Ended' && <button className={btn} disabled={busy === p.id} onClick={() => act(p, 'Ended')}>End</button>}
      </span>
    ) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-textPrimary">Recurring</h1>
          <p className="text-textSecondary mt-1">Rent, standing bills and retainer invoices on a schedule. Expenses can post themselves; bills and invoices open ready to save.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runDue} className="flex items-center gap-2 px-3 py-2.5 bg-surface border border-border text-textPrimary text-sm rounded-lg hover:border-primary whitespace-nowrap" title="Post the expenses that are due now instead of waiting for the next automatic run">
            <RefreshCw className="w-4 h-4" /> Run due now
          </button>
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-gold-gradient text-background font-semibold text-sm rounded-lg hover:opacity-90 whitespace-nowrap">
            <Plus className="w-4 h-4" /> New Profile
          </button>
        </div>
      </div>
      {notice && <div className="glass-card p-3 text-sm text-textSecondary">{notice}</div>}

      <div className="glass-card p-6">
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-textSecondary text-sm">Nothing repeats yet. Start with the shop rent.</div>
        ) : (
          <DataTable columns={columns} data={rows} />
        )}
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="New recurring profile">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(['Expense', 'PurchaseBill', 'SalesInvoice'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`px-3 py-2 rounded-lg border text-sm ${kind === k ? 'border-primary bg-primary/10 text-primary' : 'border-border text-textSecondary hover:text-textPrimary'}`}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Name *</label>
            <input type="text" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shop rent" className={fieldCls} />
          </div>

          {kind === 'Expense' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-textSecondary">Expense Account *</label>
                  <select value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)} className={fieldCls}>
                    <option value="">Select...</option>
                    {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-textSecondary">Paid Through *</label>
                  <select value={paidThroughId} onChange={(e) => setPaidThroughId(e.target.value)} className={fieldCls}>
                    <option value="">Select...</option>
                    {paidThrough.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-textSecondary">Amount (₹) *</label>
                  <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${fieldCls} font-mono`} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-textSecondary">Paid To (optional)</label>
                  <PartySelect value={vendorId} onChange={(id) => setVendorId(id)} partyType="Supplier" placeholder="Search vendor..." />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-textSecondary">Notes on each expense</label>
                <input type="text" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldCls} />
              </div>
              <label className="flex items-center gap-2 text-sm text-textPrimary cursor-pointer">
                <input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} className="w-4 h-4" />
                Post it automatically on the due date
              </label>
            </>
          )}
          {kind === 'PurchaseBill' && (
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Repeat this bill *</label>
              <select value={sourceBillId} onChange={(e) => setSourceBillId(e.target.value)} className={fieldCls}>
                <option value="">Select a posted bill...</option>
                {bills.map((b) => <option key={b.id} value={b.id}>{b.bill_no} · {b.vendor_name} · {formatCurrency(b.grand_total || 0)}</option>)}
              </select>
              <p className="text-[11px] text-textSecondary">When due, the bill form opens with the same vendor and lines; enter the new supplier invoice number and save.</p>
            </div>
          )}
          {kind === 'SalesInvoice' && (
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Invoice from this quote or sales order *</label>
              <select value={orderDocId} onChange={(e) => setOrderDocId(e.target.value)} className={fieldCls}>
                <option value="">Select a quote or sales order...</option>
                {orders.map((d) => <option key={d.id} value={d.id}>{d.doc_no} · {d.party_name} · {formatCurrency(d.grand_total)}</option>)}
              </select>
              <p className="text-[11px] text-textSecondary">When due, the invoice form opens with that customer and those lines. Save a quote under Quotes &amp; Orders first to use it here.</p>
            </div>
          )}

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1 col-span-2">
              <label className="text-xs text-textSecondary">Repeats</label>
              <div className="flex gap-2">
                <input type="number" min={1} max={24} value={everyN} onChange={(e) => setEveryN(Math.max(1, Math.min(24, Number(e.target.value) || 1)))} className={`${fieldCls} w-20`} title="Every N periods" />
                <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={fieldCls}>
                  <option value="Weekly">week(s)</option>
                  <option value="Monthly">month(s)</option>
                  <option value="Quarterly">quarter(s)</option>
                  <option value="Yearly">year(s)</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">First due *</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fieldCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Ends (optional)</label>
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={fieldCls} />
            </div>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border border-border text-textPrimary text-sm rounded-lg hover:bg-surface">Cancel</button>
            <button type="button" disabled={saving} onClick={save} className="px-6 py-2 bg-gold-gradient text-background font-semibold text-sm rounded-lg hover:opacity-90 disabled:opacity-50">{saving ? 'Saving...' : 'Save Profile'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
