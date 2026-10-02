'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import StatsCard from '@/components/ui/StatsCard';
import { IndianRupee, AlertCircle } from 'lucide-react';
import { formatCurrency, formatBalance } from '@/lib/utils';
import { ledgerApi, reportsApi } from '@/lib/api';
import { today } from '@/lib/fiscal';

/**
 * Two views of the same money, reconciled against each other:
 *
 *  - Ledger view: each party's ledger balance as at the date (Posted
 *    vouchers, opening balance on its own side). A party appears under
 *    Receivables when its balance is Dr and under Payables when it is Cr --
 *    never as a negative receivable.
 *  - Bill-wise (age-wise) view: each open invoice aged by its own date,
 *    with the party's ledger balance and the `unadjusted` figure that
 *    explains the difference (advances, credit notes and receipts not
 *    applied to a bill).
 */
export default function OutstandingPage() {
  const [activeTab, setActiveTab] = useState('Receivables');
  const [isAgeWise, setIsAgeWise] = useState(false);
  const [asOfDate, setAsOfDate] = useState(today());
  const [data, setData] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [recon, setRecon] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (isAgeWise) {
          const res = await reportsApi.outstandingAging({
            party_type: activeTab === 'Receivables' ? 'Customer' : 'Supplier',
            as_of_date: asOfDate,
          });
          setData(res.data?.aging_report || []);
          setTotals(res.data?.totals || null);
          setRecon(res.data?.reconciliation || null);
        } else {
          const res = activeTab === 'Receivables'
            ? await ledgerApi.getReceivables({ as_of_date: asOfDate })
            : await ledgerApi.getPayables({ as_of_date: asOfDate });
          setData(Array.isArray(res.data) ? res.data : []);
          setTotals(null);
          setRecon(null);
        }
      } catch (err) {
        console.error('Outstanding fetch error:', err);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTab, isAgeWise, asOfDate]);

  const num = (v: any) => Number(v || 0);
  const totalOutstanding = data.reduce((acc, row) => acc + num(row.total_outstanding), 0);
  const b0 = data.reduce((acc, row) => acc + num(row.bucket_0_30), 0);
  const b31 = data.reduce((acc, row) => acc + num(row.bucket_31_60), 0);
  const b61 = data.reduce((acc, row) => acc + num(row.bucket_61_90), 0);
  const b90 = data.reduce((acc, row) => acc + num(row.bucket_over_90), 0);
  const unadjusted = data.reduce((acc, row) => acc + num(row.unadjusted), 0);
  const money = (v: any) => (num(v) !== 0 ? formatCurrency(num(v)) : '—');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Outstanding Analysis</h1>
          <p className="text-textSecondary mt-1">Receivables and payables from the party ledgers, and bill-wise aging reconciled against them.</p>
        </div>
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm text-textSecondary mb-1">As of Date</label>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" />
          </div>
          <button
            onClick={() => setIsAgeWise(!isAgeWise)}
            className={`px-4 py-2 border rounded-md font-medium text-sm transition-colors ${isAgeWise ? 'bg-primary/20 text-primary border-primary' : 'border-border text-white hover:bg-white/5'}`}
          >
            Bill-wise age view
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatsCard title={activeTab === 'Receivables' ? 'Total Receivable' : 'Total Payable'} value={formatCurrency(totalOutstanding)} icon={<IndianRupee className="w-6 h-6" />}
          subtitle={isAgeWise ? 'Open bills, as billed' : `${data.length} part${data.length === 1 ? 'y' : 'ies'} with a ${activeTab === 'Receivables' ? 'Dr' : 'Cr'} balance`} />
        <StatsCard title="Overdue (>30d)" value={formatCurrency(b31 + b61 + b90)} icon={<AlertCircle className="w-6 h-6" />} className="border-warning/50" subtitle={isAgeWise ? undefined : 'Bill-wise view only'} />
        <StatsCard title="Overdue (>90d)" value={formatCurrency(b90)} icon={<AlertCircle className="w-6 h-6" />} className="border-danger/50" subtitle={isAgeWise ? undefined : 'Bill-wise view only'} />
        <StatsCard title="On account (unadjusted)" value={isAgeWise ? formatBalance(unadjusted) : '—'} icon={<IndianRupee className="w-6 h-6" />}
          subtitle={isAgeWise ? 'Ledger balance less open bills: advances, unapplied credit notes and receipts' : 'Switch to the bill-wise view'} />
      </div>

      <div className="glass-card">
        <div className="flex items-center gap-6 p-4 border-b border-border">
          {['Receivables', 'Payables'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 border-b-2 font-medium text-sm transition-colors -mb-[17px] ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-textSecondary hover:text-white'
              }`}
            >
              {tab} (Sundry {tab === 'Receivables' ? 'Debtors' : 'Creditors'})
            </button>
          ))}
        </div>

        <div className="p-4 overflow-x-auto">
          {loading ? (
             <div className="animate-pulse space-y-4 py-4">
                <div className="h-8 bg-white/10 rounded w-full"></div>
                <div className="h-8 bg-white/10 rounded w-full"></div>
             </div>
          ) : data.length === 0 ? (
             <div className="text-center py-12 text-textSecondary flex flex-col items-center gap-3">
               <AlertCircle className="w-12 h-12 text-white/20" />
               <p>No {activeTab.toLowerCase()} as at {asOfDate}.</p>
             </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-textSecondary border-b border-border">
                <tr>
                  <th className="pb-3 font-medium">Party Name</th>
                  <th className="pb-3 font-medium">GSTIN</th>
                  {isAgeWise ? (
                    <>
                      <th className="pb-3 font-medium text-right">0-30 days</th>
                      <th className="pb-3 font-medium text-right">31-60 days</th>
                      <th className="pb-3 font-medium text-right">61-90 days</th>
                      <th className="pb-3 font-medium text-right text-danger">&gt;90 days</th>
                      <th className="pb-3 font-medium text-right">Open bills</th>
                      <th className="pb-3 font-medium text-right">Ledger balance</th>
                      <th className="pb-3 font-medium text-right">Unadjusted</th>
                    </>
                  ) : (
                    <>
                      <th className="pb-3 font-medium">Ledger A/c</th>
                      <th className="pb-3 font-medium text-right">Balance</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((row, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="py-3 font-medium text-white">
                      <Link href={`/ledger?party=${row.party_id}`} className="hover:underline">{row.party_name || row.name}</Link>
                    </td>
                    <td className="py-3 text-textSecondary font-mono text-xs">{row.gstin || 'Unregistered'}</td>
                    {isAgeWise ? (
                      <>
                        <td className="py-3 text-right text-white font-mono">{money(row.bucket_0_30)}</td>
                        <td className="py-3 text-right text-white font-mono">{money(row.bucket_31_60)}</td>
                        <td className="py-3 text-right text-white font-mono">{money(row.bucket_61_90)}</td>
                        <td className="py-3 text-right text-danger font-medium font-mono">{money(row.bucket_over_90)}</td>
                        <td className="py-3 text-right font-medium text-primary font-mono">{formatCurrency(num(row.total_outstanding))}</td>
                        <td className={`py-3 text-right font-mono ${row.ledger_side === 'Cr' ? 'text-rose-300' : 'text-emerald-300'}`}>{formatBalance(row.ledger_balance, row.ledger_side)}</td>
                        <td className="py-3 text-right font-mono text-textSecondary" title="Ledger balance less (open sales bills − open purchase bills). Cr = credit on account.">
                          {num(row.unadjusted) === 0 ? '—' : formatBalance(row.unadjusted)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 text-textSecondary font-mono text-xs">{row.account_code || '—'}</td>
                        <td className={`py-3 text-right font-medium font-mono ${row.balance_side === 'Cr' ? 'text-rose-300' : 'text-emerald-300'}`}>
                          {formatBalance(activeTab === 'Receivables' ? num(row.total_outstanding) : -num(row.total_outstanding), row.balance_side)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                <tr className="bg-primary/5 font-bold border-t-2 border-primary/20 text-white">
                  <td className="py-3 text-primary" colSpan={2}>TOTAL</td>
                  {isAgeWise ? (
                    <>
                      <td className="py-3 text-right font-mono">{formatCurrency(b0)}</td>
                      <td className="py-3 text-right font-mono">{formatCurrency(b31)}</td>
                      <td className="py-3 text-right font-mono">{formatCurrency(b61)}</td>
                      <td className="py-3 text-right text-danger font-mono">{formatCurrency(b90)}</td>
                      <td className="py-3 text-right text-primary font-mono">{formatCurrency(totalOutstanding)}</td>
                      <td className="py-3 text-right font-mono"></td>
                      <td className="py-3 text-right font-mono text-textSecondary">{unadjusted === 0 ? '—' : formatBalance(unadjusted)}</td>
                    </>
                  ) : (
                    <>
                      <td></td>
                      <td className="py-3 text-right text-primary font-mono">{formatCurrency(totalOutstanding)} {activeTab === 'Receivables' ? 'Dr' : 'Cr'}</td>
                    </>
                  )}
                </tr>
              </tbody>
            </table>
          )}
          {isAgeWise && recon && (
            <div className="mt-4 text-xs text-textSecondary font-mono bg-surface border border-border rounded-lg p-3 flex flex-wrap gap-6">
              <span>Open sales bills: <strong className="text-white">{formatCurrency(num(recon.bills_receivable))}</strong></span>
              <span>Open purchase bills: <strong className="text-white">{formatCurrency(num(recon.bills_payable))}</strong></span>
              <span>All party ledgers: <strong className="text-white">{formatBalance(recon.ledger_total)}</strong></span>
              <span>On account: <strong className="text-white">{formatBalance(num(recon.ledger_total) - (num(recon.bills_receivable) - num(recon.bills_payable)))}</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
