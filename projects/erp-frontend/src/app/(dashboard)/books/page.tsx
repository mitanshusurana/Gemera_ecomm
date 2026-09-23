'use client';

import { useState, useEffect } from 'react';
import { booksApi, bankingApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Printer, ChevronLeft, ChevronRight } from 'lucide-react';
import { financialYearStart } from '@/lib/fiscal';

export default function BooksPage() {
  const [activeTab, setActiveTab] = useState('Day Book');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  // States for Day Book
  const [dayBookDate, setDayBookDate] = useState(new Date().toISOString().split('T')[0]);
  
  // States for Cash/Bank Book
  const [fromDate, setFromDate] = useState(financialYearStart());
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedAccount, setSelectedAccount] = useState('');

  const fetchAccounts = async () => {
    try {
      const res = await bankingApi.getAccounts();
      const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setAccounts(list);
      if (list.length > 0) setSelectedAccount(list[0].id);
    } catch (err) {}
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'Day Book') {
        const res = await booksApi.getDayBook({ entry_date: dayBookDate, date: dayBookDate });
        const list = Array.isArray(res.data) ? res.data : res.data?.entries || [];
        setData(list);
      } else if (activeTab === 'Cash Book') {
        const res = await booksApi.getCashBook({ from_date: fromDate, to_date: toDate });
        const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setData(list);
      } else if (activeTab === 'Bank Book') {
        if (!selectedAccount) {
          setLoading(false);
          return;
        }
        const res = await booksApi.getBankBook({ account_id: selectedAccount, from_date: fromDate, to_date: toDate });
        const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setData(list);
      }
    } catch (err) {
      console.error('Failed to fetch books data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'Bank Book') fetchAccounts();
  }, [activeTab]);

  useEffect(() => {
    fetchData();
  }, [activeTab, dayBookDate, fromDate, toDate, selectedAccount]);


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Books of Accounts</h1>
          <p className="text-textSecondary mt-1">View Day Book, Cash Book, and Bank Books.</p>
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

          {activeTab === 'Cash Book' && (
            <div className="flex items-center gap-2">
              <input type="date" className="bg-background border border-border rounded-md px-2 py-1.5 text-white text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <span className="text-textSecondary">to</span>
              <input type="date" className="bg-background border border-border rounded-md px-2 py-1.5 text-white text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          )}

          {activeTab === 'Bank Book' && (
            <div className="flex items-center gap-4">
              <select className="bg-background border border-border rounded-md px-3 py-1.5 text-white text-sm" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
              </select>
              <div className="flex items-center gap-2">
                <input type="date" className="bg-background border border-border rounded-md px-2 py-1.5 text-white text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                <span className="text-textSecondary">to</span>
                <input type="date" className="bg-background border border-border rounded-md px-2 py-1.5 text-white text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
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
                  <th className="pb-3 font-medium">Particulars</th>
                  <th className="pb-3 font-medium text-right">Debit (₹)</th>
                  <th className="pb-3 font-medium text-right">Credit (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (<tr><td colSpan={5} className="py-12 text-center text-textSecondary">Loading...</td></tr>) : data.length === 0 ? (<tr><td colSpan={5} className="py-12 text-center text-textSecondary">No entries</td></tr>) : data.map((row, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="py-3 text-textSecondary">{row.voucher_type || row.vtype || row.entry_type}</td>
                    <td className="py-3 text-primary">{row.voucher_no || row.vno || row.entry_no}</td>
                    <td className="py-3 font-medium text-white">{row.narration || row.part || row.particulars}</td>
                    <td className="py-3 text-right text-white">{formatCurrency(row.total_debit || row.dr || row.debit || 0)}</td>
                    <td className="py-3 text-right text-white">{formatCurrency(row.total_credit || row.cr || row.credit || 0)}</td>
                  </tr>
                ))}
                <tr className="bg-white/5 font-bold border-t-2 border-border">
                  <td colSpan={3} className="py-3 text-right text-white">Total</td>
                  <td className="py-3 text-right text-primary">{formatCurrency(data.reduce((acc, r) => acc + (Number(r.total_debit || r.dr || r.debit) || 0), 0))}</td>
                  <td className="py-3 text-right text-primary">{formatCurrency(data.reduce((acc, r) => acc + (Number(r.total_credit || r.cr || r.credit) || 0), 0))}</td>
                </tr>
              </tbody>
            </table>
          )}

          {activeTab === 'Cash Book' && (
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
                {loading ? (<tr><td colSpan={7} className="py-12 text-center text-textSecondary">Loading...</td></tr>) : data.length === 0 ? (<tr><td colSpan={7} className="py-12 text-center text-textSecondary">No entries</td></tr>) : data.map((row, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="py-3 text-white">{row.date || row.entry_date}</td>
                    <td className="py-3 font-medium text-white">{row.particulars || row.narration || row.part}</td>
                    <td className="py-3 text-textSecondary">{row.voucher_type || row.vtype || row.entry_type}</td>
                    <td className="py-3 text-primary">{row.voucher_no || row.vno || row.entry_no}</td>
                    <td className="py-3 text-right text-success">{row.debit || row.dr ? formatCurrency(row.debit || row.dr) : '—'}</td>
                    <td className="py-3 text-right text-danger">{row.credit || row.cr ? formatCurrency(row.credit || row.cr) : '—'}</td>
                    <td className="py-3 text-right font-medium text-white">{formatCurrency(row.balance || row.bal || 0)} Dr</td>
                  </tr>
                ))}
                <tr className="bg-white/5 font-bold border-t-2 border-border">
                  <td colSpan={4} className="py-3 text-right text-white">Closing Balance</td>
                  <td className="py-3 text-right text-white"></td>
                  <td className="py-3 text-right text-white"></td>
                  <td className="py-3 text-right text-primary">{formatCurrency(data.length > 0 ? (data[data.length - 1].balance || data[data.length - 1].bal || 0) : 0)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {activeTab === 'Bank Book' && (
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
                {loading ? (<tr><td colSpan={7} className="py-12 text-center text-textSecondary">Loading...</td></tr>) : data.length === 0 ? (<tr><td colSpan={7} className="py-12 text-center text-textSecondary">No entries</td></tr>) : data.map((row, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="py-3 text-white">{row.date || row.entry_date}</td>
                    <td className="py-3 font-medium text-white">{row.particulars || row.narration || row.part}</td>
                    <td className="py-3 text-textSecondary">{row.voucher_type || row.vtype || row.entry_type}</td>
                    <td className="py-3 text-primary">{row.voucher_no || row.vno || row.entry_no}</td>
                    <td className="py-3 text-right text-success">{row.debit || row.dr ? formatCurrency(row.debit || row.dr) : '—'}</td>
                    <td className="py-3 text-right text-danger">{row.credit || row.cr ? formatCurrency(row.credit || row.cr) : '—'}</td>
                    <td className="py-3 text-right font-medium text-white">{formatCurrency(row.balance || row.bal || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
