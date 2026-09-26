'use client';

import { useState, useEffect } from 'react';
import { bankingApi, apiClient } from '@/lib/api';
import StatsCard from '@/components/ui/StatsCard';
import Modal from '@/components/ui/Modal';
import { FileUp, Landmark, CheckCircle, Clock, Check, X, Printer, ArrowRightLeft, AlertCircle, Loader2, Link2Off } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import Badge from '@/components/ui/Badge';
import { previousPeriod } from '@/lib/fiscal';

export default function BankingPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(previousPeriod());
  const [unreconciled, setUnreconciled] = useState<any[]>([]);
  const [statementEntries, setStatementEntries] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [unmatching, setUnmatching] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // Selected Row for Matching
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedStmtId, setSelectedStmtId] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);

  // BRS Report Modal
  const [isBrsModalOpen, setIsBrsModalOpen] = useState(false);
  const [brsReport, setBrsReport] = useState<any | null>(null);
  const [loadingBrs, setLoadingBrs] = useState(false);

  const fetchAccounts = async () => {
    try {
      const res = await bankingApi.getAccounts();
      const list = Array.isArray(res.data) ? res.data : res.data?.data || res.data?.accounts || [];
      setAccounts(list);
      if (list.length > 0 && !selectedAccount) {
        setSelectedAccount(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load bank accounts:', err);
    }
  };

  const fetchReconciliation = async () => {
    if (!selectedAccount) return;
    try {
      setLoading(true);
      const res = await bankingApi.getReconciliation({ account_id: selectedAccount, month: selectedMonth });
      const bEntries = res.data?.book_entries || res.data?.books_entries || [];
      const sEntries = res.data?.bank_entries || res.data?.statement_entries || [];
      setUnreconciled(bEntries);
      setStatementEntries(sEntries);
      setMatches(res.data?.matches || []);
    } catch (err) {
      console.error('Failed to fetch reconciliation data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchReconciliation();
  }, [selectedAccount, selectedMonth]);

  const handleImport = async () => {
    if (!file || !selectedAccount) {
      alert('Please choose a statement file and bank account');
      return;
    }
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bank_account_id', selectedAccount);
      await bankingApi.importStatement(formData);
      alert('Bank statement imported successfully!');
      setFile(null);
      fetchReconciliation();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to parse bank statement');
    } finally {
      setImporting(false);
    }
  };

  const handleMatchSelected = async () => {
    if (!selectedBookId || !selectedStmtId) return;
    setMatching(true);
    try {
      await bankingApi.matchEntries({ book_entry_id: selectedBookId, bank_entry_id: selectedStmtId });
      alert('Entries reconciled successfully!');
      setSelectedBookId(null);
      setSelectedStmtId(null);
      fetchReconciliation();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to match entries');
    } finally {
      setMatching(false);
    }
  };

  const handleQuickMatch = async (bookId: string, stmtId?: string) => {
    // If a statement entry is already selected, match with it
    const stmtToMatch = stmtId || selectedStmtId;
    if (!stmtToMatch) {
      setSelectedBookId(bookId);
      alert('Now click a corresponding Bank Statement entry on the right to match.');
      return;
    }
    setMatching(true);
    try {
      await bankingApi.matchEntries({ book_entry_id: bookId, bank_entry_id: stmtToMatch });
      alert('Entries reconciled successfully!');
      setSelectedBookId(null);
      setSelectedStmtId(null);
      fetchReconciliation();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to match entries');
    } finally {
      setMatching(false);
    }
  };

  const handleUnmatch = async (m: any) => {
    if (!confirm(`Undo the match between ${m.entry_no || 'book entry'} and the statement line of ${m.txn_date}?`)) return;
    setUnmatching(m.match_id);
    try {
      await bankingApi.unmatchEntries({ match_id: m.match_id, bank_entry_id: m.bank_entry_id });
      fetchReconciliation();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to remove the match');
    } finally {
      setUnmatching(null);
    }
  };

  const handleOpenBrsReport = async () => {
    if (!selectedAccount) return;
    setLoadingBrs(true);
    setIsBrsModalOpen(true);
    try {
      const res = await bankingApi.getBrsReport({ account_id: selectedAccount, month: selectedMonth });
      setBrsReport(res.data);
    } catch (err: any) {
      console.error('Failed to load BRS report:', err);
    } finally {
      setLoadingBrs(false);
    }
  };

  // Dynamic calculations
  const totalBookDr = unreconciled.reduce((acc, r) => acc + (Number(r.dr_amount || r.debit || (r.type === 'Dr' ? r.amount : 0)) || 0), 0);
  const totalBookCr = unreconciled.reduce((acc, r) => acc + (Number(r.cr_amount || r.credit || (r.type === 'Cr' ? r.amount : 0)) || 0), 0);
  const bookBalance = totalBookDr - totalBookCr;

  const totalStmtCr = statementEntries.reduce((acc, r) => acc + (Number(r.credit || (r.type === 'Cr' ? r.amount : 0)) || 0), 0);
  const totalStmtDr = statementEntries.reduce((acc, r) => acc + (Number(r.debit || (r.type === 'Dr' ? r.amount : 0)) || 0), 0);
  const stmtBalance = totalStmtCr - totalStmtDr;

  const difference = Math.abs(bookBalance - stmtBalance);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Bank Reconciliation (BRS)</h1>
          <p className="text-textSecondary mt-1">[Section 44AA] Match book entries with official bank statement lines.</p>
        </div>
        <div className="flex gap-3 items-center">
          <select 
            className="bg-background border border-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-primary"
            value={selectedAccount} 
            onChange={(e) => setSelectedAccount(e.target.value)}
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
            ))}
          </select>
          <input 
            type="month" 
            className="bg-background border border-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-primary"
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)} 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard 
          title="Unreconciled Books Balance" 
          value={formatCurrency(bookBalance)} 
          icon={<Landmark className="w-6 h-6" />} 
        />
        <StatsCard 
          title="Unreconciled Bank Balance" 
          value={formatCurrency(stmtBalance)} 
          icon={<CheckCircle className="w-6 h-6" />} 
        />
        <div className="glass-card p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-textSecondary uppercase tracking-wider">Net Difference</p>
            <h4 className={`text-3xl font-playfair font-semibold ${difference === 0 ? 'text-success' : 'text-warning'}`}>
              {formatCurrency(difference)}
            </h4>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-md ${
            difference === 0 ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20'
          }`}>
            <ArrowRightLeft className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Match Actions Toolbar */}
      {(selectedBookId || selectedStmtId) && (
        <div className="p-4 bg-primary/10 border border-primary/30 rounded-xl flex items-center justify-between">
          <div className="text-xs text-white flex items-center gap-2">
            <span className="font-semibold text-primary">Pair Matching Active:</span>
            <span>Book Entry: {selectedBookId ? '✓ Selected' : 'Pending Selection'}</span>
            <span>|</span>
            <span>Statement Entry: {selectedStmtId ? '✓ Selected' : 'Pending Selection'}</span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => { setSelectedBookId(null); setSelectedStmtId(null); }}
              className="px-3 py-1 bg-surface border border-border text-textSecondary hover:text-white rounded text-xs"
            >
              Clear Selection
            </button>
            <button 
              onClick={handleMatchSelected}
              disabled={!selectedBookId || !selectedStmtId || matching}
              className="px-4 py-1.5 bg-primary text-black font-semibold rounded text-xs hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
            >
              {matching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Reconcile Selected Pair
            </button>
          </div>
        </div>
      )}

      {/* Import Section */}
      <div className="glass-card p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-surface/50">
        <div>
          <h3 className="text-lg font-bold text-white mb-1">Import Statement (SBI / HDFC / ICICI Format)</h3>
          <p className="text-sm text-textSecondary">Upload Excel statement file (.xlsx / .csv) exported from internet banking portal.</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            accept=".xlsx,.xls,.csv"
            className="text-xs text-textSecondary file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-white/10 file:text-white hover:file:bg-white/20" 
            onChange={(e) => setFile(e.target.files?.[0] || null)} 
          />
          <button 
            onClick={handleImport} 
            disabled={importing || !file}
            className="flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary border border-primary/50 rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50 text-sm font-semibold"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            {importing ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Book Entries */}
        <div className="glass-card flex flex-col h-[500px]">
          <div className="p-4 border-b border-border bg-surface/80 flex justify-between items-center">
            <h3 className="font-bold text-white">Unreconciled Books Entries</h3>
            <Badge variant={unreconciled.length > 0 ? "warning" : "success"}>
              {unreconciled.length} Pending
            </Badge>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <table className="w-full text-left text-sm">
              <thead className="text-textSecondary border-b border-border">
                <tr>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Particulars</th>
                  <th className="pb-3 font-medium">Ref No</th>
                  <th className="pb-3 font-medium text-right">Amount (₹)</th>
                  <th className="pb-3 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={5} className="py-12 text-center text-textSecondary">Loading book records...</td></tr>
                ) : unreconciled.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center text-textSecondary">All book transactions reconciled!</td></tr>
                ) : unreconciled.map((row, i) => {
                  const isSelected = selectedBookId === (row.id || String(i));
                  const amt = Number(row.dr_amount || row.debit || (row.type === 'Dr' ? row.amount : row.cr_amount || row.credit || row.amount || 0));
                  const isDr = Number(row.dr_amount || row.debit) > 0 || row.type === 'Dr';
                  const rowId = row.id || String(i);

                  return (
                    <tr 
                      key={i} 
                      onClick={() => setSelectedBookId(isSelected ? null : rowId)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary/20 border-l-4 border-primary' : 'hover:bg-white/5'}`}
                    >
                      <td className="py-3 text-white text-xs">{row.date || row.entry_date}</td>
                      <td className="py-3 text-textSecondary text-xs">{row.desc || row.narration || row.particulars || 'Bank Transaction'}</td>
                      <td className="py-3 text-textSecondary text-xs font-mono">{row.ref || row.reference_no || row.entry_no || '—'}</td>
                      <td className={`py-3 text-right font-medium font-mono text-xs ${isDr ? 'text-success' : 'text-danger'}`}>
                        {formatCurrency(amt)} {isDr ? 'Dr' : 'Cr'}
                      </td>
                      <td className="py-3 text-center">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleQuickMatch(rowId); }}
                          className={`px-2.5 py-1 rounded text-xs transition-colors ${isSelected ? 'bg-primary text-black font-bold' : 'bg-surface border border-border hover:border-primary text-textSecondary hover:text-white'}`}
                        >
                          {isSelected ? 'Selected' : 'Match'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Bank Statement Entries */}
        <div className="glass-card flex flex-col h-[500px]">
          <div className="p-4 border-b border-border bg-surface/80 flex justify-between items-center">
            <h3 className="font-bold text-white">Bank Statement Entries</h3>
            <Badge variant={statementEntries.length > 0 ? "info" : "default"}>
              {statementEntries.length} Imported
            </Badge>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <table className="w-full text-left text-sm">
              <thead className="text-textSecondary border-b border-border">
                <tr>
                  <th className="pb-3 font-medium">Txn Date</th>
                  <th className="pb-3 font-medium">Description</th>
                  <th className="pb-3 font-medium text-right">Amount (₹)</th>
                  <th className="pb-3 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={4} className="py-12 text-center text-textSecondary">Loading statement lines...</td></tr>
                ) : statementEntries.length === 0 ? (
                  <tr><td colSpan={4} className="py-12 text-center text-textSecondary">No imported statement entries found. Upload an Excel file above.</td></tr>
                ) : statementEntries.map((row, i) => {
                  const rowId = row.id || String(i);
                  const isSelected = selectedStmtId === rowId;
                  const amt = Number(row.credit || row.debit || row.amount || 0);
                  const isCr = Number(row.credit) > 0 || row.type === 'Cr';

                  return (
                    <tr 
                      key={i} 
                      onClick={() => setSelectedStmtId(isSelected ? null : rowId)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary/20 border-l-4 border-primary' : 'hover:bg-white/5'}`}
                    >
                      <td className="py-3 text-white text-xs">{row.date || row.txn_date}</td>
                      <td className="py-3 text-textSecondary text-xs truncate max-w-[160px]" title={row.desc || row.description}>
                        {row.desc || row.description || 'Statement Txn'}
                      </td>
                      <td className={`py-3 text-right font-medium font-mono text-xs ${isCr ? 'text-success' : 'text-danger'}`}>
                        {formatCurrency(amt)} {isCr ? 'Cr (Deposit)' : 'Dr (Withdrawal)'}
                      </td>
                      <td className="py-3 text-center">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedStmtId(isSelected ? null : rowId); }}
                          className={`px-2.5 py-1 rounded text-xs transition-colors ${isSelected ? 'bg-primary text-black font-bold' : 'bg-surface border border-border hover:border-primary text-textSecondary hover:text-white'}`}
                        >
                          {isSelected ? 'Selected' : 'Match'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Matched pairs: what has been reconciled this month, and the way back */}
      <div className="glass-card">
        <div className="p-4 border-b border-border bg-surface/80 flex justify-between items-center">
          <h3 className="font-bold text-white">Matched Pairs — {selectedMonth}</h3>
          <Badge variant={matches.length > 0 ? 'success' : 'default'}>{matches.length} Matched</Badge>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead className="text-textSecondary border-b border-border">
              <tr>
                <th className="pb-3 font-medium">Book Entry</th>
                <th className="pb-3 font-medium">Book Date</th>
                <th className="pb-3 font-medium text-right">Book Amount (₹)</th>
                <th className="pb-3 font-medium">Statement Line</th>
                <th className="pb-3 font-medium">Stmt Date</th>
                <th className="pb-3 font-medium text-right">Stmt Amount (₹)</th>
                <th className="pb-3 font-medium">Matched</th>
                <th className="pb-3 font-medium text-center">Undo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {matches.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-textSecondary">No matches recorded for this month.</td></tr>
              ) : matches.map((m) => {
                const bookDr = Number(m.dr_amount || 0);
                const bookCr = Number(m.cr_amount || 0);
                const stmtCr = Number(m.credit || 0);
                const stmtDr = Number(m.debit || 0);
                return (
                  <tr key={m.match_id} className="hover:bg-white/5">
                    <td className="py-3 text-xs">
                      <span className="font-mono text-white">{m.entry_no || '—'}</span>
                      <span className="block text-textSecondary truncate max-w-[220px]" title={m.narration}>{m.narration}</span>
                    </td>
                    <td className="py-3 text-xs text-textSecondary">{m.entry_date}</td>
                    <td className={`py-3 text-right font-mono text-xs ${bookDr > 0 ? 'text-success' : 'text-danger'}`}>
                      {formatCurrency(bookDr || bookCr)} {bookDr > 0 ? 'Dr' : 'Cr'}
                    </td>
                    <td className="py-3 text-xs text-textSecondary truncate max-w-[220px]" title={m.description}>
                      {m.description || 'Statement Txn'} {m.ref_no ? <span className="font-mono">({m.ref_no})</span> : null}
                    </td>
                    <td className="py-3 text-xs text-textSecondary">{m.txn_date}</td>
                    <td className={`py-3 text-right font-mono text-xs ${stmtCr > 0 ? 'text-success' : 'text-danger'}`}>
                      {formatCurrency(stmtCr || stmtDr)} {stmtCr > 0 ? 'Cr' : 'Dr'}
                    </td>
                    <td className="py-3 text-xs text-textSecondary">
                      {m.matched_at ? new Date(m.matched_at).toLocaleDateString('en-IN') : '—'}{m.matched_by_name ? ` by ${m.matched_by_name}` : ''}
                    </td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => handleUnmatch(m)}
                        disabled={unmatching === m.match_id}
                        className="px-2.5 py-1 rounded text-xs bg-surface border border-border text-textSecondary hover:text-white hover:border-danger disabled:opacity-50 flex items-center gap-1 mx-auto"
                      >
                        {unmatching === m.match_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2Off className="w-3 h-3" />} Unmatch
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleOpenBrsReport}
          className="px-6 py-2.5 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 flex items-center gap-2 shadow-lg shadow-primary/20"
        >
          <Printer className="w-4 h-4" /> View Statutory BRS Statement
        </button>
      </div>

      {/* BRS Report Modal */}
      {isBrsModalOpen && (
        <Modal 
          isOpen={isBrsModalOpen} 
          onClose={() => setIsBrsModalOpen(false)} 
          title="Bank Reconciliation Statement (BRS)"
        >
          <div className="space-y-4">
            {loadingBrs || !brsReport ? (
              <div className="py-10 flex items-center justify-center gap-3 text-textSecondary text-sm">
                <Loader2 className="w-5 h-5 animate-spin text-primary" /> Computing the reconciliation statement...
              </div>
            ) : (
              <>
                <div className="p-4 bg-surface border border-border rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-textSecondary">Account:</span>
                    <span className="font-semibold text-white">{brsReport.account_name} ({brsReport.account_code})</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-textSecondary">As at:</span>
                    <span className="font-semibold text-white">{brsReport.as_of_date}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-white font-medium">Balance as per books (bank ledger account):</span>
                    <span className="font-mono font-bold text-white">{formatCurrency(Number(brsReport.balance_as_per_books))}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-textSecondary">Add: payments in the books not yet presented at the bank ({brsReport.unpresented_payments?.length || 0}):</span>
                    <span className="font-mono text-emerald-400">+{formatCurrency(Number(brsReport.add_unpresented_payments))}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-textSecondary">Less: deposits in the books not yet cleared by the bank ({brsReport.uncleared_deposits?.length || 0}):</span>
                    <span className="font-mono text-rose-400">-{formatCurrency(Number(brsReport.less_uncleared_deposits))}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2 text-sm font-bold">
                    <span className="text-primary">Balance the bank statement should show:</span>
                    <span className="font-mono text-primary">{formatCurrency(Number(brsReport.expected_balance_as_per_bank))}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-textSecondary">Balance as per bank statement{brsReport.statement_balance_date ? ` (line dated ${brsReport.statement_balance_date})` : ''}:</span>
                    <span className="font-mono text-white">
                      {brsReport.balance_as_per_bank_statement === null || brsReport.balance_as_per_bank_statement === undefined
                        ? 'No statement imported'
                        : formatCurrency(Number(brsReport.balance_as_per_bank_statement))}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 text-sm font-bold">
                    <span className={brsReport.reconciled ? 'text-success' : 'text-warning'}>Difference:</span>
                    <span className={`font-mono ${brsReport.reconciled ? 'text-success' : 'text-warning'}`}>
                      {brsReport.difference === null || brsReport.difference === undefined ? '—' : formatCurrency(Number(brsReport.difference))}
                    </span>
                  </div>
                  {(Number(brsReport.bank_credits_not_in_books) > 0 || Number(brsReport.bank_debits_not_in_books) > 0) && (
                    <div className="pt-2 text-[11px] text-textSecondary">
                      Statement lines not in the books: credits {formatCurrency(Number(brsReport.bank_credits_not_in_books))}, debits {formatCurrency(Number(brsReport.bank_debits_not_in_books))} ({brsReport.statement_lines_not_in_books?.length || 0} lines: bank charges, interest, direct credits to record).
                    </div>
                  )}
                  <p className="pt-1 text-[11px] text-textSecondary italic">{brsReport.note}</p>
                </div>

                {(brsReport.unpresented_payments?.length > 0 || brsReport.uncleared_deposits?.length > 0) && (
                  <div className="max-h-48 overflow-y-auto border border-border rounded-xl">
                    <table className="w-full text-[11px]">
                      <thead className="bg-surface text-textSecondary sticky top-0">
                        <tr>
                          <th className="px-3 py-1.5 text-left">Outstanding item</th>
                          <th className="px-3 py-1.5 text-left">Date</th>
                          <th className="px-3 py-1.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {[...(brsReport.unpresented_payments || []).map((r: any) => ({ ...r, kind: 'Unpresented payment', amt: r.cr_amount })),
                          ...(brsReport.uncleared_deposits || []).map((r: any) => ({ ...r, kind: 'Uncleared deposit', amt: r.dr_amount }))].map((r: any) => (
                          <tr key={r.id}>
                            <td className="px-3 py-1.5 text-white">{r.kind}: <span className="font-mono">{r.entry_no}</span> <span className="text-textSecondary">{r.narration}</span></td>
                            <td className="px-3 py-1.5 text-textSecondary">{r.entry_date}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-white">{formatCurrency(Number(r.amt))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => window.print()}
                className="px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5 flex items-center gap-2 text-xs"
              >
                <Printer className="w-4 h-4" /> Print BRS
              </button>
              <button 
                onClick={() => setIsBrsModalOpen(false)}
                className="px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
