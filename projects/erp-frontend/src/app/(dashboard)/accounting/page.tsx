"use client";

import { useState, useEffect, useCallback } from 'react';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import VoucherModal from '@/components/ui/VoucherModal';
import { formatCurrency, formatBalance } from '@/lib/utils';
import { Plus, Save, Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Info, ChevronDown, ChevronRight } from 'lucide-react';

import { apiClient, reportsApi } from '@/lib/api';
import { activeFiscalYearRange, financialYearStart, today } from '@/lib/fiscal';

const STATUS_STYLE: Record<string, { badge: 'success' | 'danger' | 'warning' | 'default'; label: string; icon: any; row: string }> = {
  ok: { badge: 'success', label: 'Reconciled', icon: CheckCircle2, row: 'border-success/30' },
  fail: { badge: 'danger', label: 'Discrepancy', icon: XCircle, row: 'border-danger/40 bg-danger/5' },
  warn: { badge: 'warning', label: 'Sub-paisa difference', icon: AlertTriangle, row: 'border-warning/40 bg-warning/5' },
  info: { badge: 'default', label: 'For the record', icon: Info, row: 'border-border' },
};

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState('Trial Balance');
  const tabs = ['Trial Balance', 'Journal Entries', 'General Ledger', 'Cash Book', 'Chart of Accounts & Opening Balances', 'Reconcile'];

  const [tbData, setTbData] = useState<any>(null);
  const [jeData, setJeData] = useState<any[]>([]);
  const [cashbook, setCashbook] = useState<any>(null);
  const [coaData, setCoaData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Default range: the company's active fiscal year, not the current month.
  const [range, setRange] = useState<{ from: string; to: string; label: string }>({ from: financialYearStart(), to: today(), label: '' });
  const [rangeReady, setRangeReady] = useState(false);
  useEffect(() => {
    activeFiscalYearRange().then((r) => { setRange(r); setRangeReady(true); });
  }, []);

  const [asOfDate, setAsOfDate] = useState(today());

  // General Ledger State
  const [accounts, setAccounts] = useState<any[]>([]);
  const [glAccountId, setGlAccountId] = useState('');
  const [glData, setGlData] = useState<any>(null);
  const [glLoading, setGlLoading] = useState(false);

  // Drill-down
  const [voucherId, setVoucherId] = useState<string | number | null>(null);

  // Reconcile
  const [recon, setRecon] = useState<any>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [openCheck, setOpenCheck] = useState<string | null>(null);

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
    // The whole chart, not the first page of it: the default page is 100 rows.
    apiClient.get('/accounting/accounts', { params: { limit: 1000 } })
      .then(res => {
        const data = res.data?.accounts || [];
        setAccounts(data);
        if (data.length > 0 && !glAccountId) {
          setGlAccountId(data[0].id || data[0].code);
        }
      })
      .catch(console.error);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'Trial Balance') {
        const res = await apiClient.get('/accounting/trial-balance', { params: { as_of_date: asOfDate } });
        setTbData(res.data);
      } else if (activeTab === 'Journal Entries') {
        const res = await apiClient.get('/accounting/journal-entries', { params: { from_date: range.from, to_date: range.to } });
        const data = Array.isArray(res.data) ? res.data : res.data?.entries || [];
        setJeData(data);
      } else if (activeTab === 'Cash Book') {
        const res = await apiClient.get('/books/cashbook', { params: { from_date: range.from, to_date: range.to } });
        setCashbook(res.data);
      } else if (activeTab === 'Chart of Accounts & Opening Balances') {
        const res = await apiClient.get('/accounting/accounts', { params: { limit: 1000 } });
        setCoaData(res.data?.accounts || []);
      } else if (activeTab === 'Reconcile') {
        setReconLoading(true);
        const res = await reportsApi.reconciliation(asOfDate);
        setRecon(res.data);
        setReconLoading(false);
      }
    } catch (error) {
      console.error('Error fetching accounting data:', error);
      setReconLoading(false);
    } finally {
      setLoading(false);
    }
  }, [activeTab, asOfDate, range.from, range.to]);

  useEffect(() => {
    if (!rangeReady && (activeTab === 'Journal Entries' || activeTab === 'Cash Book')) return;
    fetchData();
  }, [fetchData, rangeReady]);

  useEffect(() => {
    const fetchGlData = async () => {
      if (activeTab === 'General Ledger' && glAccountId && rangeReady) {
        setGlLoading(true);
        try {
          const res = await apiClient.get(`/accounting/ledger/${glAccountId}`, { params: { from_date: range.from, to_date: range.to } });
          setGlData(res.data);
        } catch (error) {
          console.error('Error fetching GL data:', error);
          setGlData(null);
        } finally {
          setGlLoading(false);
        }
      }
    };
    fetchGlData();
  }, [activeTab, glAccountId, range.from, range.to, rangeReady]);

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

  const money = (v: any) => (Number(v) > 0 ? formatCurrency(Number(v)) : '—');

  const columns = [
    { header: 'Code', accessorKey: 'code', cell: (item: any) => <span className="font-mono text-white text-xs">{item.code}</span> },
    { header: 'Account Head', accessorKey: 'account_name', cell: (item: any) => (
      <div>
        <span className="font-medium text-white">{item.account_name || item.account}</span>
        <span className="block text-textSecondary text-xs">{item.group_name || 'General'}</span>
      </div>
    )},
    { header: 'Opening Dr (₹)', accessorKey: 'opening_debit', cell: (item: any) => <span className="font-mono text-textSecondary">{money(item.opening_debit)}</span> },
    { header: 'Opening Cr (₹)', accessorKey: 'opening_credit', cell: (item: any) => <span className="font-mono text-textSecondary">{money(item.opening_credit)}</span> },
    { header: 'Debit (₹)', accessorKey: 'debit', cell: (item: any) => <span className="font-mono">{money(item.debit ?? item.total_debit)}</span> },
    { header: 'Credit (₹)', accessorKey: 'credit', cell: (item: any) => <span className="font-mono">{money(item.credit ?? item.total_credit)}</span> },
    { header: 'Closing Dr (₹)', accessorKey: 'closing_debit', cell: (item: any) => <span className="font-mono text-white font-semibold">{money(item.closing_debit)}</span> },
    { header: 'Closing Cr (₹)', accessorKey: 'closing_credit', cell: (item: any) => <span className="font-mono text-white font-semibold">{money(item.closing_credit)}</span> },
  ];

  const jeColumns = [
    { header: 'Voucher No', accessorKey: 'entry_no', cell: (item: any) => <span className="font-mono text-primary text-xs font-semibold">{item.entry_no}</span> },
    { header: 'Date', accessorKey: 'entry_date', cell: (item: any) => <span className="font-mono text-xs">{item.entry_date}</span> },
    { header: 'Type', accessorKey: 'entry_type', cell: (item: any) => <Badge variant="warning">{item.entry_type}</Badge> },
    { header: 'Particulars', accessorKey: 'narration', cell: (item: any) => (
      <div>
        <span className="text-white text-sm">{item.narration}</span>
        {item.reference_no && <span className="block text-xs text-textSecondary font-mono">{item.reference_no}</span>}
      </div>
    )},
    { header: 'Amount (₹)', accessorKey: 'total_debit', cell: (item: any) => <span className="font-mono">{formatCurrency(Number(item.total_debit || 0))}</span> },
    { header: 'Status', accessorKey: 'status', cell: (item: any) => <Badge variant={item.status === 'Posted' ? 'success' : 'default'}>{item.status}</Badge> },
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
        {Number(item.opening_balance) ? `${formatCurrency(Number(item.opening_balance))} ${(item.opening_balance_type || item.normal_balance) === 'C' ? 'Cr' : 'Dr'}` : '—'}
      </span>
    )},
    { header: 'Current Balance (₹)', accessorKey: 'current_balance', cell: (item: any) => (
      <button
        onClick={() => { setGlAccountId(item.id); setActiveTab('General Ledger'); }}
        className={`font-mono font-semibold hover:underline ${Number(item.balance_signed) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
        title="Open this account's ledger"
      >
        {formatBalance(item.balance_signed ?? item.current_balance, item.balance_side)}
      </button>
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

  const tbRows: any[] = tbData?.accounts || [];
  const tbTotals = tbData?.totals || {};

  const DateRangeBar = () => (
    <div className="flex flex-wrap items-end gap-3 bg-surface/50 p-3 border border-border rounded-xl text-xs">
      <div>
        <label className="block text-textSecondary mb-1 font-medium">From</label>
        <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value, label: 'custom' })}
          className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-white focus:border-primary outline-none" />
      </div>
      <div>
        <label className="block text-textSecondary mb-1 font-medium">To</label>
        <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value, label: 'custom' })}
          className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-white focus:border-primary outline-none" />
      </div>
      <button onClick={() => activeFiscalYearRange().then(setRange)} className="px-3 py-2 border border-border rounded-lg text-textSecondary hover:text-white hover:border-primary">
        Active fiscal year
      </button>
      {range.label && range.label !== 'custom' && <span className="text-textSecondary pb-2">{range.label}</span>}
    </div>
  );

  const LedgerTable = ({ data, title }: { data: any; title: string }) => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <div className="text-white font-semibold">{title}</div>
          <div className="text-xs text-textSecondary">{data.from_date || 'inception'} to {data.to_date || today()} · click a line to open its voucher</div>
        </div>
        <div className="flex gap-6 font-mono text-xs">
          <span className="text-textSecondary">Opening <strong className="text-white">{formatBalance(data.opening_balance, data.opening_side)}</strong></span>
          <span className="text-textSecondary">Closing <strong className="text-primary">{formatBalance(data.closing_balance, data.closing_side)}</strong></span>
        </div>
      </div>
      <div className="w-full glass rounded-xl overflow-x-auto border border-border">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-textSecondary uppercase bg-surface">
            <tr>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Voucher</th>
              <th className="px-4 py-3 font-semibold">Particulars</th>
              <th className="px-4 py-3 font-semibold text-right">Dr (₹)</th>
              <th className="px-4 py-3 font-semibold text-right">Cr (₹)</th>
              <th className="px-4 py-3 font-semibold text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-white/5 border-b border-border/50">
              <td className="px-4 py-3 font-mono text-xs text-textSecondary">{data.from_date || '—'}</td>
              <td className="px-4 py-3 text-textSecondary text-xs" colSpan={2}>Opening balance b/f</td>
              <td className="px-4 py-3 text-right font-mono text-white">{money(data.opening_debit)}</td>
              <td className="px-4 py-3 text-right font-mono text-success">{money(data.opening_credit)}</td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-white">{formatBalance(data.opening_balance, data.opening_side)}</td>
            </tr>
            {(data.entries || []).map((e: any) => (
              <tr key={e.line_id} onClick={() => setVoucherId(e.journal_entry_id)}
                className="bg-background hover:bg-white/5 border-b border-border/50 cursor-pointer transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-white whitespace-nowrap">{e.entry_date || e.date}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="font-mono text-xs text-primary">{e.entry_no || e.voucher_no}</span>
                  <span className="block text-[10px] text-textSecondary">{e.entry_type || e.voucher_type}</span>
                </td>
                <td className="px-4 py-3 text-white">
                  {e.line_narration || e.particulars || e.narration}
                  {e.reference_no && <span className="block text-xs text-textSecondary font-mono">{e.reference_no}</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-white">{money(e.debit ?? e.dr_amount)}</td>
                <td className="px-4 py-3 text-right font-mono text-success">{money(e.credit ?? e.cr_amount)}</td>
                <td className={`px-4 py-3 text-right font-mono font-semibold ${e.running_side === 'Cr' ? 'text-rose-300' : 'text-emerald-300'}`}>
                  {formatBalance(e.running_balance, e.running_side)}
                </td>
              </tr>
            ))}
            <tr className="bg-primary/5 font-semibold border-t-2 border-primary/20">
              <td className="px-4 py-3 text-right text-white" colSpan={3}>Period totals / closing balance c/f</td>
              <td className="px-4 py-3 text-right font-mono text-white">{formatCurrency(Number(data.total_debit || 0))}</td>
              <td className="px-4 py-3 text-right font-mono text-success">{formatCurrency(Number(data.total_credit || 0))}</td>
              <td className="px-4 py-3 text-right font-mono text-primary">{formatBalance(data.closing_balance, data.closing_side)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  const ReconcilePanel = () => {
    if (reconLoading || !recon) {
      return <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
    }
    const s = recon.summary || {};
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <Badge variant={s.all_ok ? 'success' : s.fail > 0 ? 'danger' : 'warning'}>
              {s.all_ok ? 'All checks reconcile' : `${s.fail} discrepancy(ies), ${s.warn} sub-paisa`}
            </Badge>
            <span className="text-textSecondary text-xs">as at {recon.as_of_date} · generated {recon.generated_at}</span>
          </div>
          <button onClick={fetchData} className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg text-textSecondary hover:text-white hover:border-primary text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Re-run checks
          </button>
        </div>
        <div className="space-y-2">
          {(recon.checks || []).map((c: any) => {
            const st = STATUS_STYLE[c.status] || STATUS_STYLE.info;
            const Icon = st.icon;
            const isCount = Array.isArray(c.items);
            const open = openCheck === c.name;
            return (
              <div key={c.name} className={`border rounded-xl ${st.row}`}>
                <button onClick={() => setOpenCheck(open ? null : c.name)} className="w-full flex items-start gap-3 p-4 text-left">
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${c.status === 'ok' ? 'text-success' : c.status === 'fail' ? 'text-danger' : c.status === 'warn' ? 'text-warning' : 'text-textSecondary'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-white text-sm font-medium">{c.label}</span>
                      <Badge variant={st.badge}>{st.label}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-textSecondary">
                      {isCount ? (
                        <span>{c.count} item(s)</span>
                      ) : (
                        <>
                          {/* Totals are amounts, not balances; only the ledger-vs-bills figure carries a side. */}
                          <span>expected <strong className="text-white">{c.name === 'outstanding_vs_ledgers' ? formatBalance(c.expected) : formatCurrency(Number(c.expected || 0))}</strong></span>
                          <span>actual <strong className="text-white">{c.name === 'outstanding_vs_ledgers' ? formatBalance(c.actual) : formatCurrency(Number(c.actual || 0))}</strong></span>
                          <span>difference <strong className={Number(c.difference) === 0 ? 'text-success' : 'text-danger'}>{Number(c.difference) === 0 ? '0.00' : Number(c.difference).toFixed(4)}</strong></span>
                        </>
                      )}
                    </div>
                  </div>
                  {open ? <ChevronDown className="w-4 h-4 text-textSecondary" /> : <ChevronRight className="w-4 h-4 text-textSecondary" />}
                </button>
                {open && (
                  <div className="px-12 pb-4 text-xs text-textSecondary space-y-2">
                    <p>{c.detail}</p>
                    {c.components && (
                      <table className="text-xs font-mono">
                        <tbody>
                          {Object.entries(c.components).map(([k, v]: any) => (
                            <tr key={k}><td className="pr-4 uppercase">{k}</td><td className="pr-4">register {Number(v.register).toFixed(2)}</td><td>posted {Number(v.posted).toFixed(2)} ({v.accounts.join(', ')})</td></tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {c.accounts && c.accounts.length > 0 && (
                      <div className="font-mono">{c.accounts.map((a: any) => `${a.code} ${a.name}: ${Number(a.balance).toFixed(2)}`).join(' · ')}</div>
                    )}
                    {c.books && c.books.length > 0 && (
                      <div className="font-mono">{c.books.map((b: any) => `${b.code} ${b.name}: ${formatBalance(b.balance, b.side)}`).join(' · ')}</div>
                    )}
                    {c.on_account_vouchers && c.on_account_vouchers.length > 0 && (
                      <div className="font-mono">On-account vouchers: {c.on_account_vouchers.map((v: any) => `${v.entry_type} ×${v.vouchers} net ${formatBalance(v.net_dr)}`).join(' · ')}</div>
                    )}
                    {isCount && c.items.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-textSecondary uppercase"><tr>{Object.keys(c.items[0]).map((k) => <th key={k} className="pr-4 py-1 text-left font-medium">{k}</th>)}</tr></thead>
                          <tbody>
                            {c.items.map((it: any, i: number) => (
                              <tr key={i} className="border-t border-border/40">
                                {Object.entries(it).map(([k, v]: any) => (
                                  <td key={k} className="pr-4 py-1 font-mono text-white">
                                    {k === 'id' && it.entry_no ? <button className="text-primary underline" onClick={() => setVoucherId(v)}>{String(v)}</button> : String(v ?? '—')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {c.openings && c.openings.length > 0 && (
                      <div className="font-mono">{c.openings.map((o: any) => `${o.entry_no} (${o.entry_date}, ${o.year_label}, prev ${o.previous_year || '—'} ${o.previous_closed ? 'closed' : 'OPEN'})`).join(' · ')}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {recon.gst_account_balances && (
          <div className="text-xs text-textSecondary font-mono">
            GST account balances (net credit): {Object.entries(recon.gst_account_balances).map(([k, v]: any) => `${k} ${Number(v).toFixed(2)}`).join(' · ')}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Double-Entry Mercantile Accounting [S44AA]</h1>
          <p className="text-textSecondary mt-1">Trial Balance, General Ledger, Cash Book, Chart of Accounts, and the live reconciliation of the books.</p>
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

        {(activeTab === 'Trial Balance' || activeTab === 'Reconcile') && (
          <div className="flex items-end gap-3 text-xs">
            <div>
              <label className="block text-textSecondary mb-1 font-medium">As of</label>
              <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)}
                className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-white focus:border-primary outline-none" />
            </div>
          </div>
        )}

        {activeTab === 'Trial Balance' && (
          <>
            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : tbRows.length === 0 ? (
              <div className="text-center py-8 text-textSecondary">No trial balance records available</div>
            ) : (
              <>
                <DataTable columns={columns} data={tbRows} />
                <div className="bg-surface border border-border rounded-xl p-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-xs mt-4">
                  <div><div className="text-textSecondary">Opening Dr</div><div className="font-mono text-white">{formatCurrency(Number(tbTotals.opening_debit || 0))}</div></div>
                  <div><div className="text-textSecondary">Opening Cr</div><div className="font-mono text-white">{formatCurrency(Number(tbTotals.opening_credit || 0))}</div></div>
                  <div><div className="text-textSecondary">Total Dr</div><div className="font-mono text-emerald-400">{formatCurrency(Number(tbTotals.total_debit || 0))}</div></div>
                  <div><div className="text-textSecondary">Total Cr</div><div className="font-mono text-emerald-400">{formatCurrency(Number(tbTotals.total_credit || 0))}</div></div>
                  <div><div className="text-textSecondary">Closing Dr</div><div className="font-mono text-white font-semibold">{formatCurrency(Number(tbTotals.closing_debit || 0))}</div></div>
                  <div><div className="text-textSecondary">Closing Cr</div><div className="font-mono text-white font-semibold">{formatCurrency(Number(tbTotals.closing_credit || 0))}</div></div>
                </div>
                {tbTotals.is_balanced ? (
                  <p className="text-emerald-400 text-sm text-center mt-2 font-medium">Trial balance agrees: debits equal credits (postings and closing balances).</p>
                ) : (
                  <p className="text-rose-400 text-sm text-center mt-2 font-medium">
                    Trial balance difference: postings {Number(tbTotals.difference || 0).toFixed(4)}, closing balances {Number(tbTotals.closing_difference || 0).toFixed(4)}
                  </p>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'Journal Entries' && (
          <div className="space-y-4">
            <DateRangeBar />
            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : jeData.length === 0 ? (
              <div className="text-center py-8 text-textSecondary">No journal entries found</div>
            ) : (
              <DataTable columns={jeColumns} data={jeData} onRowClick={(item) => setVoucherId(item.id || item.entry_uuid)} />
            )}
          </div>
        )}

        {activeTab === 'General Ledger' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4 bg-surface/50 p-4 border border-border rounded-xl">
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
            </div>
            <DateRangeBar />

            {glLoading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : !glData ? (
              <div className="text-center py-8 text-textSecondary">Select an account</div>
            ) : (
              <LedgerTable data={glData} title={`${glData.account?.code} — ${glData.account?.name}`} />
            )}
          </div>
        )}

        {activeTab === 'Cash Book' && (
          <div className="space-y-4">
            <p className="text-xs text-textSecondary">Ledger of every Cash account: opening balance, each receipt and payment in voucher order, running balance.</p>
            <DateRangeBar />
            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : !cashbook ? (
              <div className="text-center py-8 text-textSecondary">No cash transactions recorded</div>
            ) : (
              <LedgerTable data={cashbook} title={(cashbook.accounts || []).map((a: any) => `${a.code} ${a.name}`).join(', ') || 'Cash'} />
            )}
          </div>
        )}

        {activeTab === 'Chart of Accounts & Opening Balances' && (
          <div className="space-y-4">
            <p className="text-xs text-textSecondary">Complete Chart of Accounts with opening balances (on their own side) and current balances. Click a balance to open the ledger.</p>
            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : (
              <DataTable columns={coaColumns} data={coaData} />
            )}
          </div>
        )}

        {activeTab === 'Reconcile' && <ReconcilePanel />}
      </div>

      <VoucherModal voucherId={voucherId} onClose={() => setVoucherId(null)} />

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
