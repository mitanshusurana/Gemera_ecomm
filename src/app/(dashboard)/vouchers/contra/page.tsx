'use client';

import { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { bankingApi, vouchersApi } from '@/lib/api';

export default function ContraVoucherPage() {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [narration, setNarration] = useState('');

  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [isLoadingBanks, setIsLoadingBanks] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const loadAccounts = async () => {
      setIsLoadingBanks(true);
      try {
        const res = await bankingApi.getAccounts();
        const accounts = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setBankAccounts(accounts);
        if (accounts.length > 0) {
          setTransferFrom(accounts[0].id);
          if (accounts.length > 1) {
            setTransferTo(accounts[1].id);
          } else {
            setTransferTo(accounts[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load bank accounts:', err);
      } finally {
        setIsLoadingBanks(false);
      }
    };

    loadAccounts();
  }, []);

  const handleSubmit = async () => {
    if (!transferFrom || !transferTo || !amount) {
      setError('Please select transfer accounts and enter amount.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const res = await vouchersApi.createContra({
        date,
        from_account_id: transferFrom,
        to_account_id: transferTo,
        amount: Number(amount),
        narration,
        reason: 'Bank/Cash Transfer'
      });
      if (res.data) {
        setSuccess(`Contra entry posted! Voucher No: ${res.data.voucher_no || 'Created'}`);
        setAmount('');
        setNarration('');
      }
    } catch (e: any) {
      console.error(e);
      setError(e.response?.data?.detail || 'Failed to post contra entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Contra Entry</h1>
          <p className="text-textSecondary mt-1">Auto-generated Voucher Number (Contra)</p>
        </div>
      </div>

      <div className="glass-card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-textSecondary mb-1">Date</label>
            <input type="date" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div></div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Transfer From (Cr)</label>
            <select 
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]"
              value={transferFrom}
              onChange={(e) => setTransferFrom(e.target.value)}
              disabled={isLoadingBanks}
            >
              {isLoadingBanks ? (
                <option>Loading accounts...</option>
              ) : bankAccounts.length === 0 ? (
                <option>No accounts found</option>
              ) : (
                bankAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} {acc.accountNumber ? `(${acc.accountNumber})` : ''}</option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Transfer To (Dr)</label>
            <select 
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]"
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              disabled={isLoadingBanks}
            >
              {isLoadingBanks ? (
                <option>Loading accounts...</option>
              ) : bankAccounts.length === 0 ? (
                <option>No accounts found</option>
              ) : (
                bankAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} {acc.accountNumber ? `(${acc.accountNumber})` : ''}</option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary">₹</span>
              <input type="number" className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-md text-white h-[38px]" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-textSecondary mb-1">Narration</label>
            <textarea className="w-full bg-background border border-border rounded-md px-3 py-2 text-white" rows={2} placeholder="Cash deposited to bank..." value={narration} onChange={(e) => setNarration(e.target.value)}></textarea>
          </div>
        </div>

        <div className="mt-8 p-4 bg-background border border-border rounded-lg">
          <h3 className="text-sm font-medium text-white mb-3">Journal Preview</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-success">Dr: Transfer To Account</span>
              <span className="text-white font-medium">{amount ? formatCurrency(Number(amount)) : '₹0.00'}</span>
            </div>
            <div className="flex justify-between pl-4">
              <span className="text-danger">Cr: Transfer From Account</span>
              <span className="text-white font-medium">{amount ? formatCurrency(Number(amount)) : '₹0.00'}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button 
            type="button"
            onClick={() => { setAmount(''); setNarration(''); setError(''); }}
            className="px-4 py-2 border border-border rounded-md text-white hover:bg-white/5"
          >
            Reset
          </button>
          <button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSubmitting ? 'Posting...' : 'Post Contra'}
          </button>
        </div>
      </div>
    </div>
  );
}
