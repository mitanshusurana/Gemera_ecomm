'use client';

import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

import { apiClient, vouchersApi } from '@/lib/api';

export default function JournalVoucherPage() {
  const [rows, setRows] = useState([{ id: 1, type: 'Dr', account: '', amount: '', remarks: '' }, { id: 2, type: 'Cr', account: '', amount: '', remarks: '' }]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [narration, setNarration] = useState('');

  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const companyId = typeof window !== 'undefined' ? localStorage.getItem('company_id') : null;

  useEffect(() => {
    const loadAccounts = async () => {
      setIsLoadingAccounts(true);
      try {
        const res = await apiClient.get('/accounting/accounts');
        const accs = Array.isArray(res.data) ? res.data : res.data?.accounts || res.data?.data || [];
        setAccounts(accs);
      } catch (err) {
        console.error('Failed to load accounts:', err);
      } finally {
        setIsLoadingAccounts(false);
      }
    };

    loadAccounts();
  }, []);

  const addRow = () => {
    setRows([...rows, { id: Date.now(), type: 'Dr', account: '', amount: '', remarks: '' }]);
  };

  const removeRow = (id: number) => {
    if (rows.length > 2) {
      setRows(rows.filter(r => r.id !== id));
    }
  };

  const totalDr = rows.filter(r => r.type === 'Dr').reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const totalCr = rows.filter(r => r.type === 'Cr').reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const diff = totalDr - totalCr;

  const handleSubmit = async () => {
    if (diff !== 0 || totalDr === 0) return;
    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const res = await vouchersApi.createJournal({
        date,
        narration,
        reason: 'Manual Journal Entry',
        lines: rows.map(r => ({
          account_id: r.account,
          debit: r.type === 'Dr' ? Number(r.amount) : 0,
          credit: r.type === 'Cr' ? Number(r.amount) : 0,
          remarks: r.remarks
        }))
      });

      if (res.data) {
        setSuccess(`Journal entry posted! Voucher No: ${res.data.voucher_no || 'Created'}`);
        setRows([{ id: Date.now(), type: 'Dr', account: '', amount: '', remarks: '' }, { id: Date.now() + 1, type: 'Cr', account: '', amount: '', remarks: '' }]);
        setNarration('');
      }
    } catch (e: any) {
      console.error(e);
      setError(e.response?.data?.detail || 'Failed to post journal entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Journal Entry</h1>
          <p className="text-textSecondary mt-1">Auto-generated Voucher Number (Journal)</p>
        </div>
      </div>

      <div className="glass-card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-textSecondary mb-1">Date</label>
            <input type="date" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Narration (Global)</label>
            <input type="text" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" placeholder="Being..." value={narration} onChange={(e) => setNarration(e.target.value)} />
          </div>
        </div>

        <div className="mt-6">
          <table className="w-full text-left text-sm">
            <thead className="text-textSecondary border-b border-border">
              <tr>
                <th className="pb-3 font-medium w-[80px]">Dr/Cr</th>
                <th className="pb-3 font-medium">Account</th>
                <th className="pb-3 font-medium text-right w-[150px]">Amount (₹)</th>
                <th className="pb-3 font-medium w-[200px]">Remarks</th>
                <th className="pb-3 font-medium w-[50px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="py-3">
                    <select 
                      className="w-full bg-background border border-border rounded-md px-2 py-2 text-white h-[38px]"
                      value={row.type}
                      onChange={(e) => {
                        const newRows = [...rows];
                        newRows[index].type = e.target.value;
                        setRows(newRows);
                      }}
                    >
                      <option value="Dr">Dr</option>
                      <option value="Cr">Cr</option>
                    </select>
                  </td>
                  <td className="py-3 px-2">
                    <select 
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]"
                      value={row.account}
                      onChange={(e) => {
                        const newRows = [...rows];
                        newRows[index].account = e.target.value;
                        setRows(newRows);
                      }}
                      disabled={isLoadingAccounts}
                    >
                      <option value="">Select Ledger Account...</option>
                      {isLoadingAccounts ? (
                        <option>Loading...</option>
                      ) : (
                        accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name} {acc.code ? `(${acc.code})` : ''}</option>
                        ))
                      )}
                    </select>
                  </td>
                  <td className="py-3 px-2">
                    <input 
                      type="number" 
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px] text-right" 
                      placeholder="0.00"
                      value={row.amount}
                      onChange={(e) => {
                        const newRows = [...rows];
                        newRows[index].amount = e.target.value;
                        setRows(newRows);
                      }}
                    />
                  </td>
                  <td className="py-3 px-2">
                    <input 
                      type="text" 
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" 
                      placeholder="Optional remarks" 
                      value={row.remarks}
                      onChange={(e) => {
                        const newRows = [...rows];
                        newRows[index].remarks = e.target.value;
                        setRows(newRows);
                      }}
                    />
                  </td>
                  <td className="py-3 text-right">
                    <button onClick={() => removeRow(row.id)} className="p-2 text-textSecondary hover:text-danger rounded-md hover:bg-white/5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <button onClick={addRow} className="mt-3 flex items-center gap-2 text-sm text-primary hover:text-primary/80">
            <Plus className="w-4 h-4" />
            Add Row
          </button>
        </div>

        <div className="mt-6 p-4 bg-background border border-border rounded-lg flex justify-between items-center text-sm">
          <div className="text-textSecondary">Totals</div>
          <div className="flex gap-8 text-white font-medium">
            <div className="flex gap-4">
              <span className="text-textSecondary">Dr:</span>
              <span>{formatCurrency(totalDr)}</span>
            </div>
            <div className="flex gap-4">
              <span className="text-textSecondary">Cr:</span>
              <span>{formatCurrency(totalCr)}</span>
            </div>
            <div className={`flex gap-4 ${diff === 0 ? 'text-success' : 'text-danger'}`}>
              <span className="text-textSecondary">Diff:</span>
              <span>{formatCurrency(Math.abs(diff))}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button 
            type="button"
            onClick={() => {
              setRows([{ id: 1, type: 'Dr', account: '', amount: '', remarks: '' }, { id: 2, type: 'Cr', account: '', amount: '', remarks: '' }]);
              setNarration('');
              setError('');
            }}
            className="px-4 py-2 border border-border rounded-md text-white hover:bg-white/5"
          >
            Reset
          </button>
          <button 
            disabled={diff !== 0 || totalDr === 0 || isSubmitting || !companyId}
            onClick={handleSubmit}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSubmitting ? 'Posting...' : 'Post Journal'}
          </button>
        </div>
      </div>
    </div>
  );
}
