"use client";

import { useEffect, useState } from 'react';
import { Calendar, Loader2, Plus, Undo2 } from 'lucide-react';

import Badge from '@/components/ui/Badge';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import PartySelect from '@/components/ui/PartySelect';
import VoucherModal from '@/components/ui/VoucherModal';
import { apiClient, bankingApi, expensesApi, Expense } from '@/lib/api';
import { financialYearStart, today } from '@/lib/fiscal';
import { useQuickCreate } from '@/lib/quickCreate';
import { formatCurrency } from '@/lib/utils';

// A running cost paid from cash or bank, in one step: rent, electricity,
// courier, bank charges. Posts Dr expense ledger, Cr cash/bank. A cost with
// GST credit to claim is a purchase bill instead (it feeds the ITC register).

const fieldCls = 'w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-white focus:border-primary outline-none';

export default function ExpensesPage() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(financialYearStart());
  const [toDate, setToDate] = useState(today());
  const [voucherId, setVoucherId] = useState<number | null>(null);

  // Form
  const [open, setOpen] = useState(false);
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
  const [paidThroughAccounts, setPaidThroughAccounts] = useState<any[]>([]);
  const [expenseDate, setExpenseDate] = useState(today());
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [paidThroughId, setPaidThroughId] = useState('');
  const [amount, setAmount] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await expensesApi.list({ from_date: fromDate, to_date: toDate });
      setRows(res.data?.expenses || []);
      setTotal(Number(res.data?.total || 0));
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fromDate, toDate]);

  useEffect(() => {
    apiClient.get('/accounting/accounts', { params: { nature: 'Expenses', limit: 1000 } })
      .then((res) => setExpenseAccounts(res.data?.accounts || []))
      .catch(() => setExpenseAccounts([]));
    bankingApi.getAccounts()
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setPaidThroughAccounts(list.filter((a: any) => a.account_type === 'Bank' || a.account_type === 'Cash'));
      })
      .catch(() => setPaidThroughAccounts([]));
  }, []);

  const resetForm = (keepAccounts = false) => {
    setExpenseDate(today());
    if (!keepAccounts) { setExpenseAccountId(''); setPaidThroughId(''); }
    setAmount(''); setVendorId(''); setReferenceNo(''); setNotes(''); setError('');
  };
  const openNew = () => { resetForm(); setOpen(true); };
  useQuickCreate(openNew);   // header "+" → Expense

  const save = async (andNew: boolean) => {
    setError('');
    if (!expenseAccountId) { setError('Choose the expense account.'); return; }
    if (!paidThroughId) { setError('Choose the cash or bank account the money was paid from.'); return; }
    if (!(Number(amount) > 0)) { setError('Enter the amount paid.'); return; }
    setSaving(true);
    try {
      await expensesApi.create({
        expense_date: expenseDate,
        expense_account_id: expenseAccountId,
        paid_through_account_id: paidThroughId,
        amount: Number(amount),
        vendor_id: vendorId || undefined,
        reference_no: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      await load();
      if (andNew) resetForm(true);   // same accounts, next entry
      else setOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not record the expense.');
    } finally {
      setSaving(false);
    }
  };

  const reverse = async (e: Expense) => {
    const reason = window.prompt(`Reverse ${e.expense_no} (${formatCurrency(e.amount)})? A mirror-image voucher is posted and the expense stays on file as Reversed.\n\nReason:`);
    if (!reason || reason.trim().length < 3) return;
    try {
      await expensesApi.reverse(e.id, reason.trim());
      load();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Could not reverse the expense.');
    }
  };

  const columns = [
    { header: 'Date / No', accessorKey: 'expense_date', cell: (e: Expense) => (
      <span>
        <span className="block text-white text-sm">{new Date(e.expense_date).toLocaleDateString('en-IN')}</span>
        <button className="font-mono text-primary hover:underline text-[11px]" title={`Open voucher ${e.voucher_no}`} onClick={() => setVoucherId(e.journal_entry_id)}>{e.expense_no}</button>
      </span>
    ) },
    { header: 'Expense Account', accessorKey: 'expense_account_name', cell: (e: Expense) => (
      <span>
        <span className="block font-medium text-white">{e.expense_account_name}</span>
        <span className="block text-xs text-textSecondary">paid from {e.paid_through_name}</span>
      </span>
    ) },
    { header: 'Paid To / Notes', accessorKey: 'vendor_name', cell: (e: Expense) => (
      <span>
        <span className="block text-white text-sm">{e.vendor_name || '—'}</span>
        {(e.notes || e.reference_no) && <span className="block text-xs text-textSecondary truncate max-w-[260px]">{[e.reference_no, e.notes].filter(Boolean).join(' · ')}</span>}
      </span>
    ) },
    { header: 'Amount (₹)', accessorKey: 'amount', cell: (e: Expense) => <span className={`font-mono font-semibold ${e.status === 'Reversed' ? 'text-textSecondary line-through' : 'text-white'}`}>{formatCurrency(e.amount)}</span> },
    { header: 'Status', accessorKey: 'status', cell: (e: Expense) => (
      <span className="flex items-center gap-2">
        <Badge variant={e.status === 'Posted' ? 'success' : 'warning'}>{e.status}</Badge>
        {e.status === 'Posted' && (
          <button onClick={() => reverse(e)} title="Reverse this expense" aria-label={`Reverse ${e.expense_no}`} className="p-1.5 bg-surface border border-border hover:border-primary text-textSecondary hover:text-white rounded">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
        )}
      </span>
    ) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Expenses</h1>
          <p className="text-textSecondary mt-1">Rent, electricity, courier, bank charges: paid from cash or bank and recorded in one step.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-gold-gradient text-background font-semibold text-sm rounded-lg hover:opacity-90">
          <Plus className="w-4 h-4" /> Record Expense
        </button>
      </div>

      <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-white">
          <Calendar className="w-3.5 h-3.5 text-textSecondary" />
          <span className="text-textSecondary">From:</span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-transparent border-none text-white focus:outline-none text-xs" />
          <span className="text-textSecondary">To:</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-transparent border-none text-white focus:outline-none text-xs" />
        </div>
        <div className="text-sm text-textSecondary">
          {rows.filter((r) => r.status === 'Posted').length} expense(s) · Total <span className="text-primary font-mono font-semibold">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="glass-card p-6">
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-textSecondary text-sm">No expense recorded in this period. Use “Record Expense” for rent, electricity, courier and the like.</div>
        ) : (
          <DataTable columns={columns} data={rows} />
        )}
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Record Expense">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Date *</label>
              <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className={fieldCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Amount (₹) *</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={`${fieldCls} font-mono`} autoFocus />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Expense Account *</label>
            <select value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)} className={fieldCls}>
              <option value="">Select an expense ledger...</option>
              {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.group_name})</option>)}
            </select>
            <p className="text-[11px] text-textSecondary">Missing a ledger? Add it under Accounting → New Ledger Account, in an Expenses group.</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Paid Through *</label>
            <select value={paidThroughId} onChange={(e) => setPaidThroughId(e.target.value)} className={fieldCls}>
              <option value="">Select cash or bank...</option>
              {paidThroughAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Paid To (optional)</label>
              <PartySelect value={vendorId} onChange={(id) => setVendorId(id)} partyType="Supplier" placeholder="Search vendor..." />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Bill / Reference No (optional)</label>
              <input type="text" maxLength={50} value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className={fieldCls} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Notes (optional)</label>
            <input type="text" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. November rent" className={fieldCls} />
          </div>
          <p className="text-[11px] text-textSecondary">No GST credit is taken on an expense. To claim input credit (for example on rent with GST), record a purchase bill with a service item instead.</p>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border border-border text-white text-sm rounded-lg hover:bg-surface">Cancel</button>
            <button type="button" disabled={saving} onClick={() => save(true)} className="px-4 py-2 border border-border text-white text-sm rounded-lg hover:border-primary disabled:opacity-50">Save and New</button>
            <button type="button" disabled={saving} onClick={() => save(false)} className="px-6 py-2 bg-gold-gradient text-background font-semibold text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      <VoucherModal voucherId={voucherId} onClose={() => setVoucherId(null)} />
    </div>
  );
}
