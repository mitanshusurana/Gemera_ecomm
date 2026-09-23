'use client';

import { useState, useEffect } from 'react';
import PartySelect from '@/components/ui/PartySelect';
import { Save, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { vouchersApi, purchasesApi } from '@/lib/api';

export default function DebitNotePage() {
  const [party, setParty] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);

  const [reason, setReason] = useState('Purity Difference');
  const [taxableAmount, setTaxableAmount] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (party) {
      purchasesApi.list({ supplier_id: party })
        .then(res => {
          const list = Array.isArray(res.data) ? res.data : res.data?.items || res.data?.invoices || [];
          setPurchases(list);
        })
        .catch(console.error);
    } else {
      setPurchases([]);
      setSelectedPurchase(null);
    }
  }, [party]);

  const amount = Number(taxableAmount || 0);
  const gstRate = selectedPurchase?.lines?.[0]?.material_gst_rate ?? selectedPurchase?.lines?.[0]?.gst_rate ?? selectedPurchase?.gst_rate ?? 3.0;
  const cgst = amount * (gstRate / 200);
  const sgst = amount * (gstRate / 200);
  const totalDebit = amount + cgst + sgst;

  const handleSubmit = async () => {
    if (!party || !selectedPurchase || amount <= 0) {
      setError('Please select a supplier, purchase invoice and enter valid amount.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const res = await vouchersApi.createDebitNote({
        date,
        party_id: party,
        original_purchase_id: selectedPurchase.id,
        amount: totalDebit,
        reason: `${reason} — ${selectedPurchase.invoice_no || 'Purchase Return'}`
      });
      if (res.data) {
        setSuccess(`Debit Note posted successfully! Voucher No: ${res.data.voucher_no || 'Created'}`);
        setTaxableAmount('');
        setSelectedPurchase(null);
      }
    } catch (e: any) {
      console.error(e);
      setError(e.response?.data?.detail || 'Failed to post debit note');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Debit Note</h1>
          <p className="text-textSecondary mt-1">Auto-generated Voucher Number (Purchase Return)</p>
        </div>
      </div>

      <div className="glass-card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-textSecondary mb-1">Date</label>
            <input type="date" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Supplier</label>
            <PartySelect value={party} onChange={setParty} partyType="Supplier" />
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Original Purchase Ref</label>
            <select
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]"
              value={selectedPurchase?.id || ''}
              onChange={(e) => {
                const pur = purchases.find(p => p.id === e.target.value);
                setSelectedPurchase(pur || null);
              }}
              disabled={!party || purchases.length === 0}
            >
              <option value="">Select Purchase Invoice</option>
              {purchases.map(pur => (
                <option key={pur.id} value={pur.id}>
                  {pur.invoice_no} ({new Date(pur.invoice_date).toLocaleDateString()}) - {formatCurrency(pur.grand_total)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Reason for Return</label>
            <select 
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="Purity Difference">Purity Difference</option>
              <option value="Weight Difference">Weight Difference</option>
              <option value="Defective Materials">Defective Materials</option>
              <option value="Others">Others</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Amount (Taxable)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary">₹</span>
              <input type="number" className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-md text-white h-[38px]" placeholder="0.00" value={taxableAmount} onChange={(e) => setTaxableAmount(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="p-4 bg-background border border-border rounded-lg">
            <h3 className="text-sm font-medium text-white mb-3">ITC Reversal Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-textSecondary">
                <span>Taxable Amount</span>
                <span>{formatCurrency(amount)}</span>
              </div>
              <div className="flex justify-between text-textSecondary">
                <span>CGST ITC to Reverse ({gstRate / 2}%)</span>
                <span>{formatCurrency(cgst)}</span>
              </div>
              <div className="flex justify-between text-textSecondary">
                <span>SGST ITC to Reverse ({gstRate / 2}%)</span>
                <span>{formatCurrency(sgst)}</span>
              </div>
              <div className="flex justify-between text-white font-bold pt-2 border-t border-border">
                <span>Total Debit Amount</span>
                <span>{formatCurrency(totalDebit)}</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-background border border-border rounded-lg">
            <h3 className="text-sm font-medium text-white mb-3">Journal Preview</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-success">
                <span>Dr: Supplier A/c</span>
                <span>{formatCurrency(totalDebit)}</span>
              </div>
              <div className="flex justify-between text-danger pl-4">
                <span>Cr: Purchase Return A/c</span>
                <span>{formatCurrency(amount)}</span>
              </div>
              <div className="flex justify-between text-danger pl-4">
                <span>Cr: Input CGST A/c</span>
                <span>{formatCurrency(cgst)}</span>
              </div>
              <div className="flex justify-between text-danger pl-4">
                <span>Cr: Input SGST A/c</span>
                <span>{formatCurrency(sgst)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button 
            type="button"
            onClick={() => { setTaxableAmount(''); setError(''); setSelectedPurchase(null); }}
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
            {isSubmitting ? 'Issuing...' : 'Issue Debit Note'}
          </button>
        </div>
      </div>
    </div>
  );
}
