'use client';

import { useState, useEffect } from 'react';
import PartySelect from '@/components/ui/PartySelect';
import { formatCurrency } from '@/lib/utils';
import { Printer, AlertCircle } from 'lucide-react';
import { ledgerApi, apiClient } from '@/lib/api';
import { financialYearStart } from '@/lib/fiscal';

export default function LedgerPage() {
  const [selectedParty, setSelectedParty] = useState('');
  const [fromDate, setFromDate] = useState(financialYearStart());
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [ledgerData, setLedgerData] = useState<any[]>([]);
  const [partyDetails, setPartyDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const fetchLedger = async () => {
    if (!selectedParty) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const [ledgerRes, partyRes] = await Promise.all([
        ledgerApi.getPartyLedger(selectedParty, { from_date: fromDate, to_date: toDate }),
        apiClient.get(`/parties/${selectedParty}`).catch(() => null)
      ]);
      
      const list = Array.isArray(ledgerRes.data) ? ledgerRes.data : ledgerRes.data?.entries || ledgerRes.data?.data || [];
      setLedgerData(list);

      if (partyRes?.data) {
        setPartyDetails({
          name: partyRes.data.name || partyRes.data.legal_name || 'Party Ledger Statement',
          trade_name: partyRes.data.trade_name,
          gstin: partyRes.data.gstin || 'Unregistered / Exempt',
          pan: partyRes.data.pan,
          creditLimit: partyRes.data.credit_limit,
          opening_balance: Number(partyRes.data.opening_balance || 0),
          opening_bal_type: partyRes.data.opening_bal_type || 'Dr'
        });
      } else {
        setPartyDetails({ name: 'Party Ledger Statement', gstin: 'N/A', creditLimit: 0, opening_balance: 0 });
      }
    } catch (err) {
      console.error('Ledger fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedParty) {
      fetchLedger();
    }
  }, [selectedParty]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Party Ledger Statement</h1>
          <p className="text-textSecondary mt-1">[S44AA] Sub-ledger account statement & running balances.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              const { generatePartyLedgerPDF } = require('@/lib/vectorPdfEngine');
              generatePartyLedgerPDF(partyDetails || { name: 'Party Ledger' }, ledgerData, fromDate, toDate, 'download');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            <Printer className="w-4 h-4" /> Download Vector PDF
          </button>
          <button 
            onClick={() => {
              const { generatePartyLedgerPDF } = require('@/lib/vectorPdfEngine');
              generatePartyLedgerPDF(partyDetails || { name: 'Party Ledger' }, ledgerData, fromDate, toDate, 'print');
            }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5"
          >
            <Printer className="w-4 h-4" /> Print PDF
          </button>
        </div>
      </div>

      <div className="glass-card p-6 flex items-end gap-4">
        <div className="flex-1">
          <label className="block text-sm text-textSecondary mb-1">Select Customer / Supplier Party *</label>
          <PartySelect value={selectedParty} onChange={setSelectedParty} placeholder="Search customer or vendor name..." />
        </div>
        <div>
          <label className="block text-sm text-textSecondary mb-1">From Date</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-background border border-border rounded-md px-3 py-2 text-white h-[38px] outline-none focus:border-primary" />
        </div>
        <div>
          <label className="block text-sm text-textSecondary mb-1">To Date</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-background border border-border rounded-md px-3 py-2 text-white h-[38px] outline-none focus:border-primary" />
        </div>
        <button onClick={fetchLedger} className="px-6 py-2 bg-gold-gradient text-background font-semibold rounded-md h-[38px] hover:opacity-90">
          View Ledger
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4 py-4">
          <div className="h-24 bg-white/10 rounded w-full"></div>
          <div className="h-8 bg-white/10 rounded w-full"></div>
          <div className="h-8 bg-white/10 rounded w-full"></div>
        </div>
      ) : hasSearched && selectedParty ? (
        <div id="printable-voucher" className="printable-area glass-card">
          <div className="p-6 border-b border-border bg-surface/50">
            <h2 className="text-xl font-bold text-white">{partyDetails?.name} {partyDetails?.trade_name ? `(${partyDetails.trade_name})` : ''}</h2>
            <div className="flex gap-6 mt-2 text-sm text-textSecondary font-mono">
              <span>GSTIN: {partyDetails?.gstin || 'N/A'}</span>
              {partyDetails?.pan && <span>PAN: {partyDetails.pan}</span>}
              <span>Credit Limit: {partyDetails?.creditLimit ? formatCurrency(partyDetails.creditLimit) : '—'}</span>
            </div>
          </div>
          
          <div className="p-4 overflow-x-auto">
            {ledgerData.length === 0 ? (
               <div className="text-center py-12 text-textSecondary flex flex-col items-center gap-3">
                 <AlertCircle className="w-12 h-12 text-white/20" />
                 <p>No ledger entries recorded for this party in the selected date range.</p>
               </div>
            ) : (
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
                    <td colSpan={4} className="py-3 font-medium text-right text-white">Opening Balance</td>
                    <td className="py-3 text-right text-white font-mono">
                      {partyDetails?.opening_bal_type === 'Dr' && partyDetails?.opening_balance > 0 ? formatCurrency(partyDetails.opening_balance) : '—'}
                    </td>
                    <td className="py-3 text-right text-success font-mono">
                      {partyDetails?.opening_bal_type === 'Cr' && partyDetails?.opening_balance > 0 ? formatCurrency(partyDetails.opening_balance) : '—'}
                    </td>
                    <td className="py-3 text-right font-semibold text-primary">
                      {partyDetails?.opening_balance ? `${formatCurrency(partyDetails.opening_balance)} ${partyDetails.opening_bal_type || 'Dr'}` : '₹0.00'}
                    </td>
                  </tr>
                  {ledgerData.map((row, index) => (
                    <tr key={index} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 text-white font-mono">{row.date}</td>
                      <td className="py-3 font-medium text-white">{row.voucher_type}</td>
                      <td className="py-3 font-mono text-primary">{row.voucher_no || row.bill_ref || '—'}</td>
                      <td className="py-3 text-textSecondary">{row.particulars || 'Journal Line Entry'}</td>
                      <td className="py-3 text-right font-mono text-white">{row.debit > 0 ? formatCurrency(row.debit) : '—'}</td>
                      <td className="py-3 text-right font-mono text-success">{row.credit > 0 ? formatCurrency(row.credit) : '—'}</td>
                      <td className="py-3 text-right font-mono font-semibold text-primary">{formatCurrency(row.running_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
