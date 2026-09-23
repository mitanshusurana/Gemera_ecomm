'use client';

import { useState, useEffect } from 'react';
import PartySelect from '@/components/ui/PartySelect';
import { Save, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

import { bankingApi, vouchersApi, apiClient } from '@/lib/api';

export default function ReceiptVoucherPage() {
  const [party, setParty] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('NEFT');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [receivedIn, setReceivedIn] = useState('');
  const [reference, setReference] = useState('');
  const [instrumentDate, setInstrumentDate] = useState('');
  const [narration, setNarration] = useState('');

  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [openInvoices, setOpenInvoices] = useState<any[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
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
        if (accounts.length > 0) setReceivedIn(accounts[0].id);
      } catch (err) {
        console.error('Failed to load bank accounts:', err);
      } finally {
        setIsLoadingBanks(false);
      }
    };

    loadAccounts();
  }, []);

  useEffect(() => {
    if (party) {
      apiClient.get(`/vouchers/open-invoices/${party}`)
        .then(res => {
          setOpenInvoices(res.data?.sales_invoices || []);
        })
        .catch(console.error);
    } else {
      setOpenInvoices([]);
      setSelectedInvoiceId('');
    }
  }, [party]);

  const handleInvoiceSelect = (invId: string) => {
    setSelectedInvoiceId(invId);
    if (!invId) return;
    const inv = openInvoices.find(i => i.id === invId);
    if (inv) {
      setAmount(String(inv.grand_total || ''));
      setReference(`Against ${inv.invoice_no}`);
      setNarration(`Settlement against Sales Invoice ${inv.invoice_no}`);
    }
  };

  const handleSubmit = async () => {
    if (!party || !receivedIn || !amount) {
      setError('Please fill in party, bank account, and amount.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const res = await vouchersApi.createReceipt({
        date,
        bank_account_id: receivedIn,
        party_id: party,
        amount: Number(amount),
        payment_mode: paymentMode,
        reference_no: reference,
        invoice_id: selectedInvoiceId || undefined,
        narration: narration || `Amount received from party`,
        reason: 'Customer Payment Receipt'
      });

      if (res.data) {
        setSuccess(`Receipt posted successfully! Voucher No: ${res.data.voucher_no || 'Created'}`);
        setAmount('');
        setNarration('');
        setReference('');
        setSelectedInvoiceId('');
      }
    } catch (e: any) {
      console.error(e);
      setError(e.response?.data?.detail || 'Failed to post receipt voucher');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Receipt Voucher</h1>
          <p className="text-textSecondary mt-1">Auto-generated Voucher Number (Receipt)</p>
        </div>
      </div>

      <div className="glass-card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-textSecondary mb-1">Date</label>
            <input type="date" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Received In</label>
            <select 
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]"
              value={receivedIn}
              onChange={(e) => setReceivedIn(e.target.value)}
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
            <label className="block text-sm text-textSecondary mb-1">Received From (Customer)</label>
            <PartySelect value={party} onChange={setParty} partyType="Customer" />
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Settle Against Invoice (Optional)</label>
            <select
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]"
              value={selectedInvoiceId}
              onChange={(e) => handleInvoiceSelect(e.target.value)}
              disabled={!party || openInvoices.length === 0}
            >
              <option value="">{party ? (openInvoices.length > 0 ? 'Select Pending Invoice...' : 'No open invoices found') : 'Select customer first'}</option>
              {openInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_no} ({new Date(inv.invoice_date).toLocaleDateString('en-IN')}) — ₹{Number(inv.grand_total).toLocaleString('en-IN')} [{inv.status}]
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary">₹</span>
              <input type="number" className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-md text-white h-[38px]" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Payment Mode</label>
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
              <label className="block text-sm text-textSecondary mb-1">Instrument No / UTR</label>
              <input type="text" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" placeholder="Enter reference number" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          )}
          {paymentMode === 'Cheque' && (
            <div>
              <label className="block text-sm text-textSecondary mb-1">Instrument Date</label>
              <input 
                type="date" 
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" 
                value={instrumentDate}
                onChange={(e) => setInstrumentDate(e.target.value)}
              />
            </div>
          )}
          <div className="md:col-span-2">
            <label className="block text-sm text-textSecondary mb-1">Narration</label>
            <textarea className="w-full bg-background border border-border rounded-md px-3 py-2 text-white" rows={2} placeholder="Being amount received for..." value={narration} onChange={(e) => setNarration(e.target.value)}></textarea>
          </div>
        </div>

        <div className="mt-8 p-4 bg-background border border-border rounded-lg">
          <h3 className="text-sm font-medium text-white mb-3">Journal Preview</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-success">Dr: Bank/Cash A/c</span>
              <span className="text-white font-medium">{amount ? formatCurrency(Number(amount)) : '₹0.00'}</span>
            </div>
            <div className="flex justify-between pl-4">
              <span className="text-danger">Cr: {party ? 'Selected Party' : 'Party A/c'}</span>
              <span className="text-white font-medium">{amount ? formatCurrency(Number(amount)) : '₹0.00'}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button 
            type="button"
            onClick={() => { setAmount(''); setReference(''); setInstrumentDate(''); setNarration(''); setSelectedInvoiceId(''); }}
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
            {isSubmitting ? 'Posting...' : 'Post Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}
