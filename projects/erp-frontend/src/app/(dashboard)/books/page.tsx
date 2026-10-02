'use client';

import { useState, useEffect } from 'react';
import { booksApi, bankingApi } from '@/lib/api';
import VoucherModal from '@/components/ui/VoucherModal';
import { formatCurrency, formatBalance } from '@/lib/utils';
import { Printer } from 'lucide-react';
import { activeFiscalYearRange, financialYearStart, today } from '@/lib/fiscal';

export default function BooksPage() {
  const [activeTab, setActiveTab] = useState('Day Book');
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);
  const [book, setBook] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [voucherId, setVoucherId] = useState<string | number | null>(null);

  // States for Day Book
  const [dayBookDate, setDayBookDate] = useState(today());

  // States for Cash/Bank Book: the active fiscal year, not the current month.
  const [fromDate, setFromDate] = useState(financialYearStart());
  const [toDate, setToDate] = useState(today());
  const [rangeReady, setRangeReady] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');

  useEffect(() => {
    activeFiscalYearRange().then((r) => { setFromDate(r.from); setToDate(r.to); setRangeReady(true); });
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await bankingApi.getAccounts();
      const list = Array.isArray(res.data) ? res.data : res.data?.data || res.data?.accounts || [];
      setAccounts(list);
      if (list.length > 0 && !selectedAccount) setSelectedAccount(list[0].id);
    } catch (err) {}
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'Day Book') {
        const res = await booksApi.getDayBook({ entry_date: dayBookDate });
        setEntries(Array.isArray(res.data) ? res.data : res.data?.entries || []);
        setBook(null);
      } else if (activeTab === 'Cash Book') {
        const res = await booksApi.getCashBook({ from_date: fromDate, to_date: toDate });
        setBook(res.data);
        setEntries(res.data?.entries || []);
      } else if (activeTab === 'Bank Book') {
        if (!selectedAccount) {
          setLoading(false);
          return;
        }
        const res = await booksApi.getBankBook({ account_id: selectedAccount, from_date: fromDate, to_date: toDate });
        setBook(res.data);
        setEntries(res.data?.entries || []);
      }
    } catch (err) {
      console.error('Failed to fetch books data:', err);
      setEntries([]);
      setBook(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'Bank Book') fetchAccounts();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'Day Book' && !rangeReady) return;
    fetchData();
  }, [activeTab, dayBookDate, fromDate, toDate, selectedAccount, rangeReady]);

  const money = (v: any) => (Number(v) > 0 ? formatCurrency(Number(v)) : '—');

  const LedgerBook = () => (
    <table className="w-full text-left text-sm">
      <thead className="text-textSecondary border-b border-border">
        <tr>
          <th className="pb-3 font-medium">Date</th>
          <th className="pb-3 font-medium">Particulars</th>
          <th className="pb-3 font-medium">Voucher Type</th>
          <th className="pb-3 font-medium">Voucher No</th>
          <th className="pb-3 font-medium text-right">Receipts (Dr)</th>
          <th className="pb-3 font-medium text-right">Payments (Cr)</th>
          <th className="pb-3 font-medium text-right">Balance</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {loading ? (<tr><td colSpan={7} className="py-12 text-center text-textSecondary">Loading...</td></tr>) : !book ? (<tr><td colSpan={7} className="py-12 text-center text-textSecondary">No entries</td></tr>) : (
          <>
            <tr className="bg-white/5 font-mono">
              <td className="py-3 text-textSecondary text-xs">{book.from_date || '—'}</td>
              <td colSpan={3} className="py-3 font-medium text-white">Opening balance b/f {book.accounts?.length ? `(${book.accounts.map((a: any) => a.code).join(', ')})` : ''}</td>
              <td className="py-3 text-right text-white">{money(book.opening_debit)}</td>
              <td className="py-3 text-right text-success">{money(book.opening_credit)}</td>
              <td className="py-3 text-right font-semibold text-primary">{formatBalance(book.opening_balance, book.opening_side)}</td>
            </tr>
            {entries.map((row, i) => (
              <tr key={row.line_id || i} onClick={() => setVoucherId(row.journal_entry_id)} className="hover:bg-white/5 cursor-pointer" title="Open voucher">
                <td className="py-3 text-white font-mono text-xs whitespace-nowrap">{row.date || row.entry_date}</td>
                <td className="py-3 font-medium text-white">
                  {row.particulars || row.entry_narration || row.narration}
                  {row.reference_no && <span className="block text-xs text-textSecondary font-mono">{row.reference_no}</span>}
                </td>
                <td className="py-3 text-textSecondary">{row.voucher_type || row.entry_type}</td>
                <td className="py-3 text-primary font-mono text-xs">{row.voucher_no || row.entry_no}</td>
                <td className="py-3 text-right text-success font-mono">{money(row.debit)}</td>
                <td className="py-3 text-right text-danger font-mono">{money(row.credit)}</td>
                <td className={`py-3 text-right font-medium font-mono ${row.running_side === 'Cr' ? 'text-rose-300' : 'text-white'}`}>{formatBalance(row.running_balance ?? row.balance, row.running_side)}</td>
              </tr>
            ))}
            <tr className="bg-white/5 font-bold border-t-2 border-border">
              <td colSpan={4} className="py-3 text-right text-white">Period totals / Closing Balance c/f</td>
              <td className="py-3 text-right text-white font-mono">{formatCurrency(Number(book.total_debit || 0))}</td>
              <td className="py-3 text-right text-white font-mono">{formatCurrency(Number(book.total_credit || 0))}</td>
              <td className="py-3 text-right text-primary font-mono">{formatBalance(book.closing_balance, book.closing_side)}</td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Books of Accounts</h1>
          <p className="text-textSecondary mt-1">Day Book, Cash Book and Bank Books. Click any line to open its voucher.</p>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5">
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      <div className="glass-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-border gap-4">
          <div className="flex items-center gap-6">
            {['Day Book', 'Cash Book', 'Bank Book'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-4 border-b-2 font-medium text-sm transition-colors -mb-[17px] ${
                  activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-textSecondary hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'Day Book' && (
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-background border border-border rounded-md">
                <input type="date" value={dayBookDate} onChange={(e) => setDayBookDate(e.target.value)} className="bg-background border-x border-border px-2 py-1 text-sm text-white" />
              </div>
            </div>
          )}

          {(activeTab === 'Cash Book' || activeTab === 'Bank Book') && (
            <div className="flex flex-wrap items-center gap-3">
              {activeTab === 'Bank Book' && (
                <select className="bg-background border border-border rounded-md px-3 py-1.5 text-white text-sm" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                </select>
              )}
              <div className="flex items-center gap-2">
                <input type="date" className="bg-background border border-border rounded-md px-2 py-1.5 text-white text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                <span className="text-textSecondary">to</span>
                <input type="date" className="bg-background border border-border rounded-md px-2 py-1.5 text-white text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
              <button onClick={() => activeFiscalYearRange().then((r) => { setFromDate(r.from); setToDate(r.to); })} className="px-3 py-1.5 border border-border rounded-md text-textSecondary hover:text-white hover:border-primary text-xs">
                Active fiscal year
              </button>
            </div>
          )}
        </div>

        <div className="p-4 overflow-x-auto">
          {activeTab === 'Day Book' && (
            <table className="w-full text-left text-sm">
              <thead className="text-textSecondary border-b border-border">
                <tr>
                  <th className="pb-3 font-medium">Voucher Type</th>
                  <th className="pb-3 font-medium">Voucher No</th>
                  <th className="pb-3 font-medium">Particulars / Lines</th>
                  <th className="pb-3 font-medium text-right">Debit (₹)</th>
                  <th className="pb-3 font-medium text-right">Credit (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (<tr><td colSpan={5} className="py-12 text-center text-textSecondary">Loading...</td></tr>) : entries.length === 0 ? (<tr><td colSpan={5} className="py-12 text-center text-textSecondary">No vouchers posted on {dayBookDate}</td></tr>) : entries.map((row, i) => (
                  <tr key={row.id || i} className="hover:bg-white/5 cursor-pointer align-top" onClick={() => setVoucherId(row.id)} title="Open voucher">
                    <td className="py-3 text-textSecondary">{row.voucher_type || row.entry_type}</td>
                    <td className="py-3 text-primary font-mono text-xs">
                      {row.voucher_no || row.entry_no}
                      {row.reference_no && <span className="block text-[10px] text-textSecondary">{row.reference_no}</span>}
                    </td>
                    <td className="py-3">
                      <div className="font-medium text-white">{row.narration}</div>
                      <div className="mt-1 space-y-0.5 text-xs text-textSecondary font-mono">
                        {(row.lines || []).map((l: any) => (
                          <div key={l.id} className="flex justify-between gap-4">
                            <span>{Number(l.cr_amount) > 0 ? '    To ' : ''}{l.account_code} {l.account_name}{l.party_name ? ` (${l.party_name})` : ''}</span>
                            <span>{Number(l.dr_amount) > 0 ? `Dr ${formatCurrency(Number(l.dr_amount))}` : `Cr ${formatCurrency(Number(l.cr_amount))}`}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 text-right text-white font-mono">{formatCurrency(Number(row.total_debit || 0))}</td>
                    <td className="py-3 text-right text-white font-mono">{formatCurrency(Number(row.total_credit || 0))}</td>
                  </tr>
                ))}
                <tr className="bg-white/5 font-bold border-t-2 border-border">
                  <td colSpan={3} className="py-3 text-right text-white">Total ({entries.length} voucher{entries.length === 1 ? '' : 's'})</td>
                  <td className="py-3 text-right text-primary font-mono">{formatCurrency(entries.reduce((acc, r) => acc + (Number(r.total_debit) || 0), 0))}</td>
                  <td className="py-3 text-right text-primary font-mono">{formatCurrency(entries.reduce((acc, r) => acc + (Number(r.total_credit) || 0), 0))}</td>
                </tr>
              </tbody>
            </table>
          )}

          {(activeTab === 'Cash Book' || activeTab === 'Bank Book') && <LedgerBook />}
        </div>
      </div>

      <VoucherModal voucherId={voucherId} onClose={() => setVoucherId(null)} />
    </div>
  );
}
