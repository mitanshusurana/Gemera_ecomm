'use client';

import { useState, useEffect } from 'react';
import PartySelect from '@/components/ui/PartySelect';
import VoucherModal from '@/components/ui/VoucherModal';
import { formatCurrency, formatBalance } from '@/lib/utils';
import { Printer, AlertCircle } from 'lucide-react';
import { ledgerApi, apiClient } from '@/lib/api';
import { activeFiscalYearRange, financialYearStart, today } from '@/lib/fiscal';

export default function LedgerPage() {
  const [selectedParty, setSelectedParty] = useState('');
  // Default range: the company's active fiscal year (not the current month).
  const [fromDate, setFromDate] = useState(financialYearStart());
  const [toDate, setToDate] = useState(today());
  const [rangeLabel, setRangeLabel] = useState('');
  const [rangeReady, setRangeReady] = useState(false);
  const [ledger, setLedger] = useState<any>(null);
  const [partyDetails, setPartyDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [voucherId, setVoucherId] = useState<string | number | null>(null);

  useEffect(() => {
    activeFiscalYearRange().then((r) => { setFromDate(r.from); setToDate(r.to); setRangeLabel(r.label); setRangeReady(true); });
    // /ledger?party=<id> opens straight on a party (the outstanding report links here).
    if (typeof window !== 'undefined') {
      const party = new URLSearchParams(window.location.search).get('party');
      if (party) setSelectedParty(party);
    }
  }, []);

  const fetchLedger = async () => {
    if (!selectedParty) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const [ledgerRes, partyRes] = await Promise.all([
        ledgerApi.getPartyLedger(selectedParty, { from_date: fromDate, to_date: toDate }),
        apiClient.get(`/parties/${selectedParty}`).catch(() => null)
      ]);
      setLedger(ledgerRes.data);

      if (partyRes?.data) {
        setPartyDetails({
          name: partyRes.data.name || partyRes.data.legal_name || 'Party Ledger Statement',
          trade_name: partyRes.data.trade_name,
          gstin: partyRes.data.gstin || 'Unregistered / Exempt',
          pan: partyRes.data.pan,
          party_type: partyRes.data.party_type,
          creditLimit: partyRes.data.credit_limit,
        });
      } else {
        setPartyDetails({ name: ledgerRes.data?.party?.name || 'Party Ledger Statement', gstin: 'N/A', creditLimit: 0 });
      }
    } catch (err) {
      console.error('Ledger fetch error:', err);
      setLedger(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedParty && rangeReady) {
      fetchLedger();
    }
  }, [selectedParty, rangeReady]);

  const entries: any[] = ledger?.entries || [];
  const money = (v: any) => (Number(v) > 0 ? formatCurrency(Number(v)) : '—');

  // The PDF generator takes the rows as a flat list with running_balance;
  // hand it the signed figures and the opening row as the first line.
  const pdfRows = () => {
    if (!ledger) return [];
    const opening = {
      date: ledger.from_date || '', voucher_type: 'Opening', voucher_no: '', particulars: 'Opening balance b/f',
      debit: Number(ledger.opening_debit || 0), credit: Number(ledger.opening_credit || 0),
      running_balance: Number(ledger.opening_balance || 0),
    };
    return [opening, ...entries.map((e) => ({ ...e, debit: Number(e.debit), credit: Number(e.credit), running_balance: Number(e.running_balance) }))];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Party Ledger Statement</h1>
          <p className="text-textSecondary mt-1">[S44AA] Sub-ledger statement: opening balance, every voucher in date order, running balance with Dr/Cr. Click a line to open its voucher.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const { generatePartyLedgerPDF } = require('@/lib/vectorPdfEngine');
              generatePartyLedgerPDF(partyDetails || { name: 'Party Ledger' }, pdfRows(), fromDate, toDate, 'download');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            <Printer className="w-4 h-4" /> Download Vector PDF
          </button>
          <button
            onClick={() => {
              const { generatePartyLedgerPDF } = require('@/lib/vectorPdfEngine');
              generatePartyLedgerPDF(partyDetails || { name: 'Party Ledger' }, pdfRows(), fromDate, toDate, 'print');
            }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5"
          >
            <Printer className="w-4 h-4" /> Print PDF
          </button>
        </div>
      </div>

      <div className="glass-card p-6 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[260px]">
          <label className="block text-sm text-textSecondary mb-1">Select Customer / Supplier Party *</label>
          <PartySelect value={selectedParty} onChange={setSelectedParty} placeholder="Search customer or vendor name..." />
        </div>
        <div>
          <label className="block text-sm text-textSecondary mb-1">From Date</label>
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setRangeLabel('custom'); }} className="bg-background border border-border rounded-md px-3 py-2 text-white h-[38px] outline-none focus:border-primary" />
        </div>
        <div>
          <label className="block text-sm text-textSecondary mb-1">To Date</label>
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setRangeLabel('custom'); }} className="bg-background border border-border rounded-md px-3 py-2 text-white h-[38px] outline-none focus:border-primary" />
        </div>
        <button onClick={() => activeFiscalYearRange().then((r) => { setFromDate(r.from); setToDate(r.to); setRangeLabel(r.label); })} className="px-3 py-2 border border-border rounded-md text-textSecondary hover:text-white hover:border-primary h-[38px] text-xs">
          Active fiscal year
        </button>
        <button onClick={fetchLedger} className="px-6 py-2 bg-gold-gradient text-background font-semibold rounded-md h-[38px] hover:opacity-90">
          View Ledger
        </button>
        {rangeLabel && rangeLabel !== 'custom' && <span className="text-xs text-textSecondary pb-2">{rangeLabel}</span>}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4 py-4">
          <div className="h-24 bg-white/10 rounded w-full"></div>
          <div className="h-8 bg-white/10 rounded w-full"></div>
          <div className="h-8 bg-white/10 rounded w-full"></div>
        </div>
      ) : hasSearched && selectedParty && ledger ? (
        <div id="printable-voucher" className="printable-area glass-card">
          <div className="p-6 border-b border-border bg-surface/50 flex flex-wrap justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">{partyDetails?.name} {partyDetails?.trade_name ? `(${partyDetails.trade_name})` : ''}</h2>
              <div className="flex flex-wrap gap-6 mt-2 text-sm text-textSecondary font-mono">
                <span>GSTIN: {partyDetails?.gstin || 'N/A'}</span>
                {partyDetails?.pan && <span>PAN: {partyDetails.pan}</span>}
                <span>Ledger A/c: {ledger.party?.account_code}</span>
                <span>Credit Limit: {partyDetails?.creditLimit ? formatCurrency(partyDetails.creditLimit) : '—'}</span>
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="text-textSecondary text-xs">Closing balance as at {ledger.to_date || toDate}</div>
              <div className={`text-2xl font-mono font-bold ${ledger.closing_side === 'Cr' ? 'text-rose-300' : 'text-emerald-300'}`}>
                {formatBalance(ledger.closing_balance, ledger.closing_side)}
              </div>
              <div className="text-xs text-textSecondary mt-1">
                {ledger.closing_side === 'Cr' ? 'Credit balance: the party is owed this amount (advance, credit note or supplier bill).' : 'Debit balance: the party owes this amount.'}
              </div>
            </div>
          </div>

          <div className="p-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-textSecondary border-b border-border">
                <tr>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Voucher Type</th>
                  <th className="pb-3 font-medium">Voucher No</th>
                  <th className="pb-3 font-medium">Particulars</th>
                  <th className="pb-3 font-medium text-right">Debit (₹)</th>
                  <th className="pb-3 font-medium text-right">Credit (₹)</th>
                  <th className="pb-3 font-medium text-right text-primary">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="bg-white/5 font-mono">
                  <td className="py-3 text-textSecondary text-xs">{ledger.from_date || '—'}</td>
                  <td colSpan={3} className="py-3 font-medium text-white">Opening Balance b/f</td>
                  <td className="py-3 text-right text-white">{money(ledger.opening_debit)}</td>
                  <td className="py-3 text-right text-success">{money(ledger.opening_credit)}</td>
                  <td className="py-3 text-right font-semibold text-primary">{formatBalance(ledger.opening_balance, ledger.opening_side)}</td>
                </tr>
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-textSecondary">
                      <AlertCircle className="w-8 h-8 text-white/20 mx-auto mb-2" />
                      No vouchers for this party in the selected range; the opening and closing balances are the balance brought forward.
                    </td>
                  </tr>
                )}
                {entries.map((row) => (
                  <tr key={row.line_id} onClick={() => setVoucherId(row.journal_entry_id)} className="hover:bg-white/5 transition-colors cursor-pointer" title="Open voucher">
                    <td className="py-3 text-white font-mono text-xs whitespace-nowrap">{row.date}</td>
                    <td className="py-3 font-medium text-white">{row.voucher_type}</td>
                    <td className="py-3 font-mono text-primary text-xs">
                      {row.voucher_no}
                      {row.bill_ref && <span className="block text-[10px] text-textSecondary">{row.bill_ref}</span>}
                    </td>
                    <td className="py-3 text-textSecondary">{row.particulars || row.entry_narration || 'Journal Line Entry'}</td>
                    <td className="py-3 text-right font-mono text-white">{money(row.debit)}</td>
                    <td className="py-3 text-right font-mono text-success">{money(row.credit)}</td>
                    <td className={`py-3 text-right font-mono font-semibold ${row.running_side === 'Cr' ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {formatBalance(row.running_balance, row.running_side)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-primary/5 font-bold border-t-2 border-primary/20 text-white">
                  <td colSpan={4} className="py-3 text-right">Period totals / Closing Balance c/f</td>
                  <td className="py-3 text-right font-mono">{formatCurrency(Number(ledger.total_debit || 0))}</td>
                  <td className="py-3 text-right font-mono text-success">{formatCurrency(Number(ledger.total_credit || 0))}</td>
                  <td className="py-3 text-right font-mono text-primary">{formatBalance(ledger.closing_balance, ledger.closing_side)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <VoucherModal voucherId={voucherId} onClose={() => setVoucherId(null)} />
    </div>
  );
}
