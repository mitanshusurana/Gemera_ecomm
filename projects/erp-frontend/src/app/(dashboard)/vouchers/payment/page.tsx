'use client';

import { useState, useEffect } from 'react';
import PartySelect from '@/components/ui/PartySelect';
import { Save, Loader2, DollarSign, Building2, Zap, Home, Percent, Users, ShieldCheck, Briefcase } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { bankingApi, vouchersApi, apiClient } from '@/lib/api';

export default function PaymentVoucherPage() {
  const [paymentCategory, setPaymentCategory] = useState<'Supplier' | 'Expense'>('Supplier');
  const [party, setParty] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('NEFT');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidFrom, setPaidFrom] = useState('');
  const [reference, setReference] = useState('');
  const [narration, setNarration] = useState('');

  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [isLoadingBanks, setIsLoadingBanks] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [openInvoices, setOpenInvoices] = useState<any[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  useEffect(() => {
    const loadAccounts = async () => {
      setIsLoadingBanks(true);
      try {
        const res = await bankingApi.getAccounts();
        const accounts = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setBankAccounts(accounts);
        if (accounts.length > 0) setPaidFrom(accounts[0].id);

        // Load all ledger accounts to extract Expenses
        const accRes = await apiClient.get('/accounting/accounts');
        const allAccs = accRes.data?.accounts || [];
        const expenses = allAccs.filter((a: any) => a.nature === 'Expenses' || a.account_type === 'Expense' || a.name?.toLowerCase().includes('expense') || a.name?.toLowerCase().includes('rent') || a.name?.toLowerCase().includes('salary'));
        setExpenseAccounts(expenses.length > 0 ? expenses : allAccs);
        if (expenses.length > 0) setExpenseAccountId(expenses[0].id);
        else if (allAccs.length > 0) setExpenseAccountId(allAccs[0].id);
      } catch (err) {
        console.error('Failed to load bank/expense accounts:', err);
      } finally {
        setIsLoadingBanks(false);
      }
    };

    loadAccounts();
  }, []);

  useEffect(() => {
    if (party && paymentCategory === 'Supplier') {
      apiClient.get(`/vouchers/open-invoices/${party}`)
        .then(res => {
          setOpenInvoices(res.data?.purchase_invoices || []);
        })
        .catch(console.error);
    } else {
      setOpenInvoices([]);
      setSelectedInvoiceId('');
    }
  }, [party, paymentCategory]);

  const handleInvoiceSelect = (invId: string) => {
    setSelectedInvoiceId(invId);
    if (!invId) return;
    const inv = openInvoices.find(i => i.id === invId);
    if (inv) {
      setAmount(String(inv.grand_total || ''));
      setReference(`Against ${inv.supplier_invoice_no || inv.invoice_no}`);
      setNarration(`Payment against Purchase Bill ${inv.supplier_invoice_no || inv.invoice_no}`);
    }
  };

  const handleReset = () => {
    setAmount('');
    setNarration('');
    setReference('');
    setSelectedInvoiceId('');
    setError('');
  };

  const handleSubmit = async () => {
    if (paymentCategory === 'Supplier' && !party) {
      setError('Please select a supplier party.');
      return;
    }
    if (paymentCategory === 'Expense' && !expenseAccountId) {
      setError('Please select an operating expense ledger account.');
      return;
    }
    if (!paidFrom || !amount) {
      setError('Please fill in bank account and payment amount.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      if (paymentCategory === 'Supplier') {
        const res = await vouchersApi.createPayment({
          date,
          bank_account_id: paidFrom,
          party_id: party,
          amount: Number(amount),
          payment_mode: paymentMode,
          reference_no: reference,
          invoice_id: selectedInvoiceId || undefined,
          narration: narration || 'Supplier payment',
          reason: 'Supplier Payment'
        });
        if (res.data) setSuccess(`Payment posted! Voucher No: ${res.data.voucher_no || 'Created'}`);
      } else {
        const expName = expenseAccounts.find(a => a.id === expenseAccountId)?.name || 'Expense';
        const res = await apiClient.post('/vouchers/journal', {
          date,
          narration: narration || `Paid ${expName} via ${paymentMode}`,
          lines: [
            { account_id: expenseAccountId, debit: Number(amount), credit: 0, remarks: expName },
            { account_id: paidFrom, debit: 0, credit: Number(amount), remarks: `Paid from ${paymentMode}` }
          ],
          reason: `Expense Payment: ${expName}`
        });
        if (res.data) setSuccess(`Expense Payment posted! Voucher No: ${res.data.voucher_no || 'Created'}`);
      }

      handleReset();
    } catch (e: any) {
      console.error(e);
      setError(e.response?.data?.detail || 'Failed to post payment voucher');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentExpenseName = expenseAccounts.find(a => a.id === expenseAccountId)?.name || 'Operating Expense';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Payment Voucher</h1>
          <p className="text-textSecondary mt-1">Record supplier payouts and business operating expenses (Electricity, Rent, Interest, Salaries).</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm font-semibold">
          {success}
        </div>
      )}

      <div className="glass-card p-6 space-y-6">
        {/* Payment Type Selector */}
        <div className="flex gap-4 border-b border-border pb-4">
          <button
            type="button"
            onClick={() => setPaymentCategory('Supplier')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              paymentCategory === 'Supplier'
                ? 'bg-primary text-black shadow-lg shadow-primary/20'
                : 'border border-border text-textSecondary hover:text-white'
            }`}
          >
            Supplier / Vendor Payout
          </button>
          <button
            type="button"
            onClick={() => setPaymentCategory('Expense')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              paymentCategory === 'Expense'
                ? 'bg-primary text-black shadow-lg shadow-primary/20'
                : 'border border-border text-textSecondary hover:text-white'
            }`}
          >
            Business Operating Expense (Electricity, Rent, Interest)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs text-textSecondary font-medium mb-1">Voucher Date</label>
            <input type="date" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs text-textSecondary font-medium mb-1">Paid From (Bank / Cash Account) *</label>
            <select 
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]"
              value={paidFrom}
              onChange={(e) => setPaidFrom(e.target.value)}
              disabled={isLoadingBanks}
            >
              {isLoadingBanks ? (
                <option>Loading accounts...</option>
              ) : bankAccounts.length === 0 ? (
                <option>No bank accounts found</option>
              ) : (
                bankAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} {acc.accountNumber ? `(${acc.accountNumber})` : ''}</option>
                ))
              )}
            </select>
          </div>

          {paymentCategory === 'Supplier' ? (
            <>
              <div>
                <label className="block text-xs text-textSecondary font-medium mb-1">Paid To Supplier (Sundry Creditor) *</label>
                <PartySelect value={party} onChange={setParty} partyType="Supplier" />
              </div>
              <div>
                <label className="block text-xs text-textSecondary font-medium mb-1">Settle Against Purchase Bill (Optional)</label>
                <select
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]"
                  value={selectedInvoiceId}
                  onChange={(e) => handleInvoiceSelect(e.target.value)}
                  disabled={!party || openInvoices.length === 0}
                >
                  <option value="">{party ? (openInvoices.length > 0 ? 'Select Pending Bill...' : 'No open bills found') : 'Select supplier first'}</option>
                  {openInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.supplier_invoice_no || inv.invoice_no} ({new Date(inv.invoice_date).toLocaleDateString('en-IN')}) — ₹{Number(inv.grand_total).toLocaleString('en-IN')} [{inv.status}]
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs text-textSecondary font-medium mb-1">Select Operating Expense Account *</label>
              <select 
                value={expenseAccountId}
                onChange={(e) => setExpenseAccountId(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px] font-medium"
              >
                {expenseAccounts.map(exp => (
                  <option key={exp.id} value={exp.id}>{exp.code} — {exp.name} ({exp.group_name || exp.nature})</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs text-textSecondary font-medium mb-1">Amount Payable (₹) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary">₹</span>
              <input type="number" className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-md text-white h-[38px] font-mono text-sm" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-textSecondary font-medium mb-1">Payment Mode</label>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]">
              <option>NEFT</option>
              <option>RTGS</option>
              <option>UPI</option>
              <option>Cheque</option>
              <option>Cash</option>
            </select>
          </div>

          {paymentMode !== 'Cash' && (
            <div>
              <label className="block text-xs text-textSecondary font-medium mb-1">UTR / Ref Number</label>
              <input type="text" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" placeholder="Enter reference number" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          )}

          <div className="md:col-span-2">
            <label className="block text-xs text-textSecondary font-medium mb-1">Narration / Bill Details</label>
            <textarea className="w-full bg-background border border-border rounded-md px-3 py-2 text-white text-sm" rows={2} placeholder="Being amount paid for..." value={narration} onChange={(e) => setNarration(e.target.value)}></textarea>
          </div>
        </div>

        {/* Double-Entry Journal Preview */}
        <div className="p-4 bg-background border border-border rounded-lg space-y-2">
          <h3 className="text-xs font-semibold text-textSecondary uppercase tracking-wider">Double-Entry Journal Preview [Section 44AA]</h3>
          <div className="space-y-1 text-sm font-mono">
            <div className="flex justify-between text-emerald-400">
              <span>Dr: {paymentCategory === 'Supplier' ? 'Supplier Party Ledger' : currentExpenseName}</span>
              <span className="font-bold">{amount ? formatCurrency(Number(amount)) : '₹0.00'}</span>
            </div>
            <div className="flex justify-between pl-4 text-rose-400">
              <span>Cr: Bank / Cash Ledger</span>
              <span className="font-bold">{amount ? formatCurrency(Number(amount)) : '₹0.00'}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button 
            type="button"
            onClick={handleReset}
            className="px-4 py-2 border border-border rounded-md text-white hover:bg-white/5 text-sm"
          >
            Reset
          </button>
          <button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-gold-gradient text-black rounded-lg font-bold hover:opacity-90 transition-opacity disabled:opacity-50 text-sm shadow-lg shadow-primary/20"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSubmitting ? 'Posting Voucher...' : 'Post Payment Voucher'}
          </button>
        </div>
      </div>
    </div>
  );
}
