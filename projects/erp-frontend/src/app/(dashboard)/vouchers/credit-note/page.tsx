'use client';

import { useState, useEffect, useCallback } from 'react';
import PartySelect from '@/components/ui/PartySelect';
import ItemSelect from '@/components/ui/ItemSelect';
import EInvoicePanel from '@/components/einvoice/EInvoicePanel';
import { Save, Loader2, QrCode } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { vouchersApi, apiClient } from '@/lib/api';

/** A credit note as the vouchers list returns it (journal entry). */
interface NoteRow {
  id: number | string;
  entry_no: string;
  entry_date: string;
  narration: string;
  total_debit: number | string;
  status: string;
}

export default function CreditNotePage() {
  const [party, setParty] = useState('');
  const [item, setItem] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  const [reason, setReason] = useState('Defective / Damaged');
  const [weight, setWeight] = useState('');
  const [rate, setRate] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // The note just posted (for its "Generate IRN"), the recent notes, and the
  // note whose e-invoice panel is open. A credit note against a B2B invoice
  // is e-invoiced as a CRN; the panel says so when the note is B2C.
  const [lastNote, setLastNote] = useState<{ id: number | string; voucher_no: string } | null>(null);
  const [recent, setRecent] = useState<NoteRow[]>([]);
  const [einvoiceFor, setEinvoiceFor] = useState<{ id: number | string; no: string } | null>(null);

  const loadRecent = useCallback(async () => {
    try {
      const res = await vouchersApi.list({ type: 'Credit_Note', limit: 20, offset: 0 });
      const rows = Array.isArray(res.data) ? res.data : res.data?.items || res.data?.rows || [];
      setRecent(rows);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  useEffect(() => {
    if (party) {
      apiClient.get('/sales/invoices', { params: { customer_id: party } })
        .then(res => {
          const list = Array.isArray(res.data) ? res.data : res.data?.invoices || [];
          setInvoices(list);
        })
        .catch(console.error);
    } else {
      setInvoices([]);
      setSelectedInvoice(null);
    }
  }, [party]);

  const taxableValue = (Number(weight || 0) * Number(rate || 0));
  const gstRate = selectedInvoice?.lines?.[0]?.material_gst_rate ?? selectedInvoice?.lines?.[0]?.gst_rate ?? selectedInvoice?.gst_rate ?? 3.0;
  const cgst = taxableValue * (gstRate / 200);
  const sgst = taxableValue * (gstRate / 200);
  const totalCredit = taxableValue + cgst + sgst;

  const handleSubmit = async () => {
    if (!party || !selectedInvoice || taxableValue <= 0) {
      setError('Please select a customer, invoice, and enter valid weight & rate.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const res = await vouchersApi.createCreditNote({
        date,
        party_id: party,
        original_invoice_id: selectedInvoice.id, // Pass selected invoice ID
        material_value: taxableValue,
        making_charges: 0,
        reason: `${reason} — ${selectedInvoice.invoice_no || 'Sales Return'}`
      });
      if (res.data) {
        setSuccess(`Credit Note posted successfully! Voucher No: ${res.data.voucher_no || 'Created'}`);
        setLastNote(res.data.id ? { id: res.data.id, voucher_no: res.data.voucher_no } : null);
        setWeight('');
        setRate('');
        setSelectedInvoice(null);
        loadRecent();
      }
    } catch (e: any) {
      console.error(e);
      setError(e.response?.data?.detail || 'Failed to post credit note');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Credit Note</h1>
          <p className="text-textSecondary mt-1">Auto-generated Voucher Number (Sales Return)</p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-danger/30 bg-danger/10 text-danger text-sm">{error}</div>
      )}
      {success && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-success/30 bg-success/10 text-success text-sm">
          <span>{success}</span>
          {lastNote && (
            <button
              type="button"
              onClick={() => setEinvoiceFor({ id: lastNote.id, no: lastNote.voucher_no })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gold-gradient text-background"
            >
              <QrCode className="w-3.5 h-3.5" /> Generate IRN
            </button>
          )}
        </div>
      )}

      <div className="glass-card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-textSecondary mb-1">Date</label>
            <input type="date" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Customer</label>
            <PartySelect value={party} onChange={setParty} partyType="Customer" />
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Original Invoice Ref</label>
            <select
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]"
              value={selectedInvoice?.id || ''}
              onChange={(e) => {
                const inv = invoices.find(i => i.id === e.target.value);
                setSelectedInvoice(inv || null);
              }}
              disabled={!party || invoices.length === 0}
            >
              <option value="">Select Invoice</option>
              {invoices.map(inv => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_no} ({new Date(inv.invoice_date).toLocaleDateString()}) - {formatCurrency(inv.grand_total)}
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
              <option value="Defective / Damaged">Defective / Damaged</option>
              <option value="Weight Difference">Weight Difference</option>
              <option value="Exchange / Upgrade">Exchange / Upgrade</option>
              <option value="Others">Others</option>
            </select>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <h3 className="text-lg font-playfair font-medium text-white mb-4">Items Returned</h3>
          <div className="grid grid-cols-12 gap-4 items-end">
            <div className="col-span-5">
              <label className="block text-sm text-textSecondary mb-1">Item</label>
              <ItemSelect value={item} onChange={setItem} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-textSecondary mb-1">Weight (gm)</label>
              <input type="number" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" placeholder="0.00" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-textSecondary mb-1">Rate (₹)</label>
              <input type="number" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" placeholder="0.00" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="col-span-3">
              <label className="block text-sm text-textSecondary mb-1">Taxable Value (₹)</label>
              <input type="number" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px] bg-surface" readOnly placeholder="0.00" value={taxableValue || ''} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="p-4 bg-background border border-border rounded-lg">
            <h3 className="text-sm font-medium text-white mb-3">GST Reversal Preview</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-textSecondary">
                <span>Taxable Amount</span>
                <span>{formatCurrency(taxableValue)}</span>
              </div>
              <div className="flex justify-between text-textSecondary">
                <span>CGST ({gstRate / 2}%)</span>
                <span>{formatCurrency(cgst)}</span>
              </div>
              <div className="flex justify-between text-textSecondary">
                <span>SGST ({gstRate / 2}%)</span>
                <span>{formatCurrency(sgst)}</span>
              </div>
              <div className="flex justify-between text-white font-bold pt-2 border-t border-border">
                <span>Total Credit</span>
                <span>{formatCurrency(totalCredit)}</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-background border border-border rounded-lg">
            <h3 className="text-sm font-medium text-white mb-3">Journal Preview</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-success">
                <span>Dr: Sales Return A/c</span>
                <span>{formatCurrency(taxableValue)}</span>
              </div>
              <div className="flex justify-between text-success">
                <span>Dr: Output CGST A/c</span>
                <span>{formatCurrency(cgst)}</span>
              </div>
              <div className="flex justify-between text-success">
                <span>Dr: Output SGST A/c</span>
                <span>{formatCurrency(sgst)}</span>
              </div>
              <div className="flex justify-between text-danger pl-4">
                <span>Cr: Customer A/c</span>
                <span>{formatCurrency(totalCredit)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button 
            type="button"
            onClick={() => { setWeight(''); setRate(''); setError(''); }}
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
            {isSubmitting ? 'Issuing...' : 'Issue Credit Note'}
          </button>
        </div>
      </div>

      {/* Recent notes: open the e-invoice panel to generate, view or cancel the IRN. */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-playfair font-medium text-white">Recent credit notes</h3>
          <p className="text-xs text-textSecondary">A note against a B2B invoice is reported to the IRP as a CRN.</p>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-textSecondary">No credit notes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-textSecondary border-b border-border">
                  <th className="py-2 pr-4">Voucher</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Narration</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 text-right">e-Invoice</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={String(row.id)} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-white">{row.entry_no}</td>
                    <td className="py-2 pr-4 text-textSecondary">{row.entry_date ? new Date(row.entry_date).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="py-2 pr-4 text-textSecondary truncate max-w-[24rem]" title={row.narration}>{row.narration}</td>
                    <td className="py-2 pr-4 text-right text-white">{formatCurrency(Number(row.total_debit || 0))}</td>
                    <td className="py-2 pr-4 text-textSecondary">{row.status}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEinvoiceFor({ id: row.id, no: row.entry_no })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-white hover:border-primary"
                      >
                        <QrCode className="w-3.5 h-3.5" /> IRN
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {einvoiceFor && (
        <EInvoicePanel
          kind="credit_note"
          invoiceId={String(einvoiceFor.id)}
          invoiceNo={einvoiceFor.no}
          onClose={() => setEinvoiceFor(null)}
          onChanged={loadRecent}
        />
      )}
    </div>
  );
}
