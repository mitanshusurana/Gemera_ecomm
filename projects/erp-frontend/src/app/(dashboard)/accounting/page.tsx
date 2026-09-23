"use client";

import { useState, useEffect } from 'react';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { Search, Calendar, Plus, Save, Loader2, BookOpen, Layers } from 'lucide-react';

import { apiClient } from '@/lib/api';
import { financialYearStart } from '@/lib/fiscal';

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState('Trial Balance');
  const tabs = ['Trial Balance', 'Journal Entries', 'General Ledger', 'Cash Book', 'Chart of Accounts & Opening Balances'];

  const [tbData, setTbData] = useState<any[]>([]);
  const [jeData, setJeData] = useState<any[]>([]);
  const [cashbookData, setCashbookData] = useState<any[]>([]);
  const [coaData, setCoaData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // General Ledger State
  const [accounts, setAccounts] = useState<any[]>([]);
  const [glAccountId, setGlAccountId] = useState('');
  const [glFromDate, setGlFromDate] = useState(financialYearStart());
  const [glToDate, setGlToDate] = useState(new Date().toISOString().split('T')[0]);
  const [glData, setGlData] = useState<any[]>([]);
  const [glLoading, setGlLoading] = useState(false);

  // Opening Balance Modal State
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [selectedAccForOb, setSelectedAccForOb] = useState<any>(null);
  const [obAmount, setObAmount] = useState('');
  const [obType, setObType] = useState('D');
  const [isSavingOb, setIsSavingOb] = useState(false);

  // Create Account Modal State
  const [isNewAccModalOpen, setIsNewAccModalOpen] = useState(false);
  const [newAccCode, setNewAccCode] = useState('');
  const [newAccName, setNewAccName] = useState('');
  const [newAccNature, setNewAccNature] = useState('Assets');
  const [newAccGroup, setNewAccGroup] = useState('Current Assets');
  const [newAccNormalBalance, setNewAccNormalBalance] = useState('D');
  const [newAccOpeningBal, setNewAccOpeningBal] = useState('0');
  const [isCreatingAcc, setIsCreatingAcc] = useState(false);

  useEffect(() => {
    // Fetch accounts for dropdowns
    apiClient.get('/accounting/accounts')
      .then(res => {
        const data = res.data?.accounts || [];
        setAccounts(data);
        if (data.length > 0 && !glAccountId) {
          setGlAccountId(data[0].id || data[0].code);
        }
      })
      .catch(console.error);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'Trial Balance') {
        const res = await apiClient.get('/accounting/trial-balance');
        const data = Array.isArray(res.data) ? res.data : res.data?.accounts || res.data?.trial_balance || [];
        setTbData(data);
      } else if (activeTab === 'Journal Entries') {
        const res = await apiClient.get('/accounting/journal-entries');
        const data = Array.isArray(res.data) ? res.data : res.data?.entries || [];
        setJeData(data);
      } else if (activeTab === 'Cash Book') {
        const res = await apiClient.get('/books/cashbook');
        setCashbookData(Array.isArray(res.data) ? res.data : []);
      } else if (activeTab === 'Chart of Accounts & Opening Balances') {
        const res = await apiClient.get('/accounting/accounts');
        setCoaData(res.data?.accounts || []);
      }
    } catch (error) {
      console.error('Error fetching accounting data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  useEffect(() => {
    const fetchGlData = async () => {
      if (activeTab === 'General Ledger' && glAccountId) {
        setGlLoading(true);
        try {
          const res = await apiClient.get(`/accounting/ledger/${glAccountId}?from_date=${glFromDate}&to_date=${glToDate}`);
          const data = res.data?.entries || [];
          setGlData(data);
        } catch (error) {
          console.error('Error fetching GL data:', error);
          setGlData([]);
        } finally {
          setGlLoading(false);
        }
      }
    };
    fetchGlData();
  }, [activeTab, glAccountId, glFromDate, glToDate]);

  const handleSaveOpeningBalance = async () => {
    if (!selectedAccForOb) return;
    setIsSavingOb(true);
    try {
      await apiClient.patch(`/accounting/accounts/${selectedAccForOb.id}/opening-balance`, {
        opening_balance: Number(obAmount || 0),
        opening_balance_type: obType,
        reason: 'Opening Balance Setup'
      });
      setIsOpeningModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to update opening balance');
    } finally {
      setIsSavingOb(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!newAccCode || !newAccName) {
      alert('Please enter account code and name.');
      return;
    }
    setIsCreatingAcc(true);
    try {
      await apiClient.post('/accounting/accounts', {
        code: newAccCode.toUpperCase(),
        name: newAccName,
        group_code: newAccGroup,
        normal_balance: newAccNormalBalance,
        opening_balance: Number(newAccOpeningBal || 0),
        opening_balance_type: newAccNormalBalance,
        reason: 'New Account Creation'
      });
      setIsNewAccModalOpen(false);
      setNewAccCode('');
      setNewAccName('');
      setNewAccOpeningBal('0');
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to create account');
    } finally {
      setIsCreatingAcc(false);
    }
  };

  const columns = [
    { header: 'Account Code', accessorKey: 'code', cell: (item: any) => <span className="font-mono text-white text-xs">{item.code}</span> },
    { header: 'Account Head', accessorKey: 'account_name', cell: (item: any) => <span className="font-medium text-white">{item.account_name || item.account}</span> },
    { header: 'Group', accessorKey: 'group_name', cell: (item: any) => <span className="text-textSecondary text-xs">{item.group_name || 'General'}</span> },
    { header: 'Debit (₹)', accessorKey: 'debit', cell: (item: any) => (item.debit || item.total_debit) > 0 ? formatCurrency(item.debit || item.total_debit) : '-' },
    { header: 'Credit (₹)', accessorKey: 'credit', cell: (item: any) => (item.credit || item.total_credit) > 0 ? formatCurrency(item.credit || item.total_credit) : '-' },
  ];

  const jeColumns = [
    { header: 'Voucher No', accessorKey: 'entry_no', cell: (item: any) => <span className="font-mono text-primary text-xs font-semibold">{item.entry_no}</span> },
    { header: 'Date', accessorKey: 'entry_date', cell: (item: any) => new Date(item.entry_date).toLocaleDateString('en-IN') },
    { header: 'Type', accessorKey: 'entry_type', cell: (item: any) => <Badge variant="warning">{item.entry_type}</Badge> },
    { header: 'Particulars', accessorKey: 'narration', cell: (item: any) => <span className="text-white text-sm">{item.narration}</span> },
    { header: 'Amount (₹)', accessorKey: 'total_debit', cell: (item: any) => formatCurrency(item.total_debit || 0) },
  ];

  const glColumns = [
    { header: 'Date', accessorKey: 'entry_date', cell: (item: any) => new Date(item.entry_date).toLocaleDateString('en-IN') },
    { header: 'Voucher No', accessorKey: 'entry_no', cell: (item: any) => <span className="font-mono text-xs text-primary">{item.entry_no}</span> },
    { header: 'Particulars', accessorKey: 'narration', cell: (item: any) => <span className="text-white">{item.line_narration || item.narration}</span> },
    { header: 'Dr (₹)', accessorKey: 'dr_amount', cell: (item: any) => item.dr_amount > 0 ? formatCurrency(item.dr_amount) : '-' },
    { header: 'Cr (₹)', accessorKey: 'cr_amount', cell: (item: any) => item.cr_amount > 0 ? formatCurrency(item.cr_amount) : '-' },
    { header: 'Running Balance (₹)', accessorKey: 'running_balance', cell: (item: any) => (
      <span className={`font-semibold ${Number(item.running_balance) >= 0 ? 'text-success' : 'text-danger'}`}>
        {formatCurrency(Math.abs(item.running_balance || 0))} {Number(item.running_balance) >= 0 ? 'Dr' : 'Cr'}
      </span>
    )},
  ];

  const cashColumns = [
    { header: 'Date', accessorKey: 'date', cell: (item: any) => new Date(item.date).toLocaleDateString('en-IN') },
    { header: 'Voucher No', accessorKey: 'voucher_no', cell: (item: any) => <span className="font-mono text-xs text-primary">{item.voucher_no}</span> },
    { header: 'Type', accessorKey: 'voucher_type', cell: (item: any) => <Badge variant="info">{item.voucher_type}</Badge> },
    { header: 'Particulars', accessorKey: 'particulars', cell: (item: any) => <span className="text-white">{item.particulars || 'Cash Transaction'}</span> },
    { header: 'Receipt / Inward (₹)', accessorKey: 'debit', cell: (item: any) => item.debit > 0 ? <span className="text-emerald-400 font-semibold">{formatCurrency(item.debit)}</span> : '-' },
    { header: 'Payment / Outward (₹)', accessorKey: 'credit', cell: (item: any) => item.credit > 0 ? <span className="text-rose-400 font-semibold">{formatCurrency(item.credit)}</span> : '-' },
    { header: 'Cash Balance (₹)', accessorKey: 'balance', cell: (item: any) => <span className="text-white font-mono font-bold">{formatCurrency(item.balance || 0)}</span> },
  ];

  const coaColumns = [
    { header: 'Account Code', accessorKey: 'code', cell: (item: any) => <span className="font-mono text-primary font-bold">{item.code}</span> },
    { header: 'Account Name', accessorKey: 'name', cell: (item: any) => <span className="text-white font-medium">{item.name}</span> },
    { header: 'Account Group', accessorKey: 'group_name', cell: (item: any) => item.group_name },
    { header: 'Nature', accessorKey: 'nature', cell: (item: any) => (
      <Badge variant={item.nature === 'Assets' ? 'success' : item.nature === 'Liabilities' ? 'warning' : item.nature === 'Income' ? 'info' : 'danger'}>
        {item.nature}
      </Badge>
    )},
    { header: 'Opening Balance (₹)', accessorKey: 'opening_balance', cell: (item: any) => (
      <span className="font-mono text-textSecondary">
        {formatCurrency(item.opening_balance || 0)} {item.opening_balance_type || item.normal_balance}
      </span>
    )},
    { header: 'Current Balance (₹)', accessorKey: 'current_balance', cell: (item: any) => (
      <span className={`font-mono font-semibold ${item.current_balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {formatCurrency(Math.abs(item.current_balance || 0))} {item.current_balance >= 0 ? (item.normal_balance === 'C' ? 'Cr' : 'Dr') : (item.normal_balance === 'C' ? 'Dr' : 'Cr')}
      </span>
    )},
    { header: 'Action', accessorKey: 'actions', cell: (item: any) => (
      <button
        onClick={() => {
          setSelectedAccForOb(item);
          setObAmount(String(item.opening_balance || '0'));
          setObType(item.opening_balance_type || item.normal_balance || 'D');
          setIsOpeningModalOpen(true);
        }}
        className="px-2.5 py-1 bg-surface border border-border hover:border-primary text-textSecondary hover:text-white rounded text-xs transition-colors"
      >
        Edit Opening Bal
      </button>
    )},
  ];

  const totalDebit = tbData.reduce((acc, curr) => acc + (Number(curr.debit || curr.total_debit) || 0), 0);
  const totalCredit = tbData.reduce((acc, curr) => acc + (Number(curr.credit || curr.total_credit) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Double-Entry Mercantile Accounting [S44AA]</h1>
          <p className="text-textSecondary mt-1">Trial Balance, General Ledger, Cash Book, and Chart of Accounts.</p>
        </div>
        {activeTab === 'Chart of Accounts & Opening Balances' && (
          <button
            onClick={() => setIsNewAccModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" /> New Ledger Account
          </button>
        )}
      </div>

      <div className="glass-card p-6 space-y-6">
        <div className="flex space-x-1 border-b border-border pb-4 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab 
                  ? 'bg-primary/20 text-primary border border-primary/30' 
                  : 'text-textSecondary hover:bg-surface hover:text-white border border-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Trial Balance' && (
          <>
            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : tbData.length === 0 ? (
              <div className="text-center py-8 text-textSecondary">No trial balance records available</div>
            ) : (
              <>
                <DataTable columns={columns} data={tbData} />
                <div className="bg-surface border border-border rounded-xl p-4 flex justify-between items-center mt-4">
                  <span className="font-playfair font-semibold text-white">Trial Balance Totals</span>
                  <div className="flex gap-16 pr-8">
                    <span className="text-sm text-textSecondary">Total Dr: <strong className="text-emerald-400 font-mono text-base">{formatCurrency(totalDebit)}</strong></span>
                    <span className="text-sm text-textSecondary">Total Cr: <strong className="text-emerald-400 font-mono text-base">{formatCurrency(totalCredit)}</strong></span>
                  </div>
                </div>
                {Math.abs(totalDebit - totalCredit) < 0.01 ? (
                  <p className="text-emerald-400 text-sm text-center mt-2 font-medium">✓ Trial Balance is perfectly matched (Dr = Cr)</p>
                ) : (
                  <p className="text-rose-400 text-sm text-center mt-2 font-medium">⚠ Trial Balance difference: {formatCurrency(Math.abs(totalDebit - totalCredit))}</p>
                )}
              </>
            )}
          </>
        )}
        
        {activeTab === 'Journal Entries' && (
          <>
            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : jeData.length === 0 ? (
              <div className="text-center py-8 text-textSecondary">No journal entries found</div>
            ) : (
              <DataTable columns={jeColumns} data={jeData} />
            )}
          </>
        )}
        
        {activeTab === 'General Ledger' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 bg-surface/50 p-4 border border-border rounded-xl">
              <div className="flex-1 min-w-[240px]">
                <label className="block text-xs text-textSecondary mb-1 font-medium">Select Ledger Account</label>
                <select
                  value={glAccountId}
                  onChange={(e) => setGlAccountId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none"
                >
                  <option value="">-- Select Account --</option>
                  {accounts.map(acc => (
                    <option key={acc.id || acc.code} value={acc.id || acc.code}>
                      {acc.code} — {acc.name || acc.account_name} ({acc.group_name})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">From Date</label>
                <input
                  type="date"
                  value={glFromDate}
                  onChange={(e) => setGlFromDate(e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-white focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">To Date</label>
                <input
                  type="date"
                  value={glToDate}
                  onChange={(e) => setGlToDate(e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-white focus:border-primary outline-none"
                />
              </div>
            </div>

            {glLoading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : glData.length === 0 ? (
              <div className="text-center py-8 text-textSecondary">No ledger entries found for selected account and period</div>
            ) : (
              <DataTable columns={glColumns} data={glData} />
            )}
          </div>
        )}

        {activeTab === 'Cash Book' && (
          <div className="space-y-4">
            <p className="text-xs text-textSecondary">Real-time Cash Inward & Outward Register with running physical cash balance.</p>
            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : cashbookData.length === 0 ? (
              <div className="text-center py-8 text-textSecondary">No cash transactions recorded</div>
            ) : (
              <DataTable columns={cashColumns} data={cashbookData} />
            )}
          </div>
        )}

        {activeTab === 'Chart of Accounts & Opening Balances' && (
          <div className="space-y-4">
            <p className="text-xs text-textSecondary">Complete Chart of Accounts. Configure opening balances for financial year transition or migration from previous software.</p>
            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : (
              <DataTable columns={coaColumns} data={coaData} />
            )}
          </div>
        )}
      </div>

      {/* Opening Balance Modal */}
      {isOpeningModalOpen && selectedAccForOb && (
        <Modal isOpen={isOpeningModalOpen} onClose={() => setIsOpeningModalOpen(false)} title={`Set Opening Balance: ${selectedAccForOb.name}`}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-textSecondary mb-1 font-medium">Account</label>
              <div className="p-3 bg-surface border border-border rounded-lg text-white text-sm font-semibold">
                {selectedAccForOb.code} — {selectedAccForOb.name} ({selectedAccForOb.group_name})
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">Opening Balance Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={obAmount}
                  onChange={(e) => setObAmount(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white font-mono"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">Balance Type</label>
                <select
                  value={obType}
                  onChange={(e) => setObType(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white"
                >
                  <option value="D">Dr (Debit / Asset / Receivable)</option>
                  <option value="C">Cr (Credit / Liability / Payable)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button onClick={() => setIsOpeningModalOpen(false)} className="px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5">Cancel</button>
              <button onClick={handleSaveOpeningBalance} disabled={isSavingOb} className="px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 flex items-center gap-2">
                {isSavingOb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Opening Balance
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* New Account Modal */}
      {isNewAccModalOpen && (
        <Modal isOpen={isNewAccModalOpen} onClose={() => setIsNewAccModalOpen(false)} title="Create New Ledger Account">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">Account Code *</label>
                <input
                  type="text"
                  value={newAccCode}
                  onChange={(e) => setNewAccCode(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white font-mono uppercase"
                  placeholder="e.g. EXP-MISC-02"
                />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">Account Name *</label>
                <input
                  type="text"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white"
                  placeholder="e.g. Factory Repairs & Maintenance"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">Account Nature</label>
                <select
                  value={newAccNature}
                  onChange={(e) => setNewAccNature(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white"
                >
                  <option value="Assets">Assets</option>
                  <option value="Liabilities">Liabilities</option>
                  <option value="Expenses">Expenses</option>
                  <option value="Income">Income / Revenue</option>
                  <option value="Equity">Capital & Equity</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">Normal Balance</label>
                <select
                  value={newAccNormalBalance}
                  onChange={(e) => setNewAccNormalBalance(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white"
                >
                  <option value="D">Debit (D)</option>
                  <option value="C">Credit (C)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1 font-medium">Opening Balance (₹)</label>
              <input
                type="number"
                step="0.01"
                value={newAccOpeningBal}
                onChange={(e) => setNewAccOpeningBal(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white font-mono"
                placeholder="0.00"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button onClick={() => setIsNewAccModalOpen(false)} className="px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5">Cancel</button>
              <button onClick={handleCreateAccount} disabled={isCreatingAcc} className="px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 flex items-center gap-2">
                {isCreatingAcc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Create Account
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
