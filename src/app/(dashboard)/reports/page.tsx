"use client";

import { useState, useEffect } from 'react';
import { FileText, Download, ShieldCheck, Loader2, RefreshCw, Calendar, CheckCircle2, AlertTriangle, Layers, Percent, Factory, BookOpen } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import DataTable from '@/components/ui/DataTable';
import { formatCurrency } from '@/lib/utils';
import { apiClient } from '@/lib/api';

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState('Trial Balance');
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any>(null);

  // Filter States
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [fromDate, setFromDate] = useState('2026-04-01');
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [monthYear, setMonthYear] = useState(new Date().toISOString().slice(0, 7));

  const reportTypes = [
    { id: 'Trial Balance', name: 'Trial Balance [S44AA]', desc: 'Double-entry trial balance verifying total Dr = Cr balance equality' },
    { id: 'Profit & Loss', name: 'Profit & Loss [S44AA]', desc: 'Financial performance showing Income vs. Expenses & Net Profit' },
    { id: 'Balance Sheet', name: 'Balance Sheet [S44AA]', desc: 'Financial position showing Assets, Liabilities & Equity' },
    { id: 'Stock Register', name: 'Stock Register [CGST-R56-2]', desc: 'Quantitative commodity-wise stock movements and valuation' },
    { id: 'Production Account', name: 'Production Account [CGST-R56-12]', desc: 'Monthly manufacturing account (WIP, output, wastage loss, scrap)' },
    { id: 'GST Tax Register', name: 'GST Tax Register [CGST-R56-4]', desc: 'Dual-rate tax register (3% Material, 5% Making), ITC & RCM' },
    { id: 'Age-Wise Outstanding', name: 'Age-Wise Aging [S44AA]', desc: 'Receivables & Payables aging breakdown (0-30, 31-60, 61-90, 90+ days)' },
    { id: 'Audit Trail Log', name: 'Audit Trail Log [MCA-11g]', desc: 'Immutable database change history with sequence numbers & row hashes' },
  ];

  const fetchReport = async () => {
    setLoading(true);
    try {
      if (selectedReport === 'Trial Balance') {
        const res = await apiClient.get(`/reports/trial-balance?as_of_date=${asOfDate}`);
        setReportData(res.data);
      } else if (selectedReport === 'Profit & Loss') {
        const res = await apiClient.get(`/reports/profit-loss?from_date=${fromDate}&to_date=${toDate}`);
        setReportData(res.data);
      } else if (selectedReport === 'Balance Sheet') {
        const res = await apiClient.get(`/reports/balance-sheet?as_of_date=${asOfDate}`);
        setReportData(res.data);
      } else if (selectedReport === 'Stock Register') {
        const res = await apiClient.get(`/inventory/stock-register?as_of_date=${asOfDate}`);
        setReportData(res.data);
      } else if (selectedReport === 'Production Account') {
        const res = await apiClient.get(`/reports/production-account?month_year=${monthYear}`);
        setReportData(res.data);
      } else if (selectedReport === 'GST Tax Register') {
        const res = await apiClient.get(`/reports/gst-tax-register?from_date=${fromDate}&to_date=${toDate}`);
        setReportData(res.data);
      } else if (selectedReport === 'Age-Wise Outstanding') {
        const res = await apiClient.get(`/reports/outstanding-aging?as_of_date=${asOfDate}`);
        setReportData(res.data);
      } else if (selectedReport === 'Audit Trail Log') {
        const res = await apiClient.get(`/reports/audit-trail?from_date=${fromDate}&to_date=${toDate}`);
        setReportData(res.data);
      }
    } catch (err) {
      console.error('Error fetching report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedReport, asOfDate, fromDate, toDate, monthYear]);

  // Column definitions for different statutory tables
  const trialColumns = [
    { header: 'Account Code', accessorKey: 'code', cell: (item: any) => <span className="font-mono text-white">{item.code}</span> },
    { header: 'Account Name', accessorKey: 'account_name', cell: (item: any) => <span className="font-medium text-white">{item.account_name}</span> },
    { header: 'Group Name', accessorKey: 'group_name', cell: (item: any) => <span className="text-textSecondary text-xs">{item.group_name}</span> },
    { header: 'Total Debit (₹)', accessorKey: 'total_debit', cell: (item: any) => formatCurrency(item.total_debit || 0) },
    { header: 'Total Credit (₹)', accessorKey: 'total_credit', cell: (item: any) => formatCurrency(item.total_credit || 0) },
    { header: 'Net Balance (₹)', accessorKey: 'net_balance', cell: (item: any) => (
      <span className={`font-semibold ${item.net_balance >= 0 ? 'text-success' : 'text-danger'}`}>
        {formatCurrency(Math.abs(item.net_balance))} {item.net_balance >= 0 ? 'Dr' : 'Cr'}
      </span>
    )}
  ];

  const stockColumns = [
    { header: 'Material Code', accessorKey: 'code', cell: (item: any) => <span className="font-mono text-white">{item.code || item.material_code}</span> },
    { header: 'Name', accessorKey: 'name', cell: (item: any) => <span className="font-medium text-white">{item.name || item.material_name}</span> },
    { header: 'Category / Group', accessorKey: 'group_name', cell: (item: any) => item.group_name || item.category || 'Stock Material' },
    { header: 'HSN / SAC', accessorKey: 'hsn_code', cell: (item: any) => <span className="font-mono text-xs">{item.hsn_code || '71131910'}</span> },
    { header: 'GST Rate', accessorKey: 'gst_tax_rate', cell: (item: any) => `${item.gst_tax_rate ?? item.material_gst_rate ?? 3.0}%` },
    { header: 'Closing Stock', accessorKey: 'current_stock', cell: (item: any) => `${Number(item.current_stock || 0).toLocaleString()} ${item.unit || 'gm'}` },
    { header: 'Net Weight', accessorKey: 'closing_weight_gm', cell: (item: any) => `${Number(item.closing_weight_gm || item.current_stock || 0).toFixed(2)} gm` },
    { header: 'Valuation Rate', accessorKey: 'standard_rate', cell: (item: any) => formatCurrency(item.standard_rate || 0) },
    { header: 'Stock Value (₹)', accessorKey: 'stock_value', cell: (item: any) => <span className="font-mono font-semibold text-primary">{formatCurrency(item.stock_value || 0)}</span> }
  ];

  const auditColumns = [
    { header: 'Seq #', accessorKey: 'sequence_no', cell: (item: any) => <span className="font-mono text-xs text-primary">#{item.sequence_no}</span> },
    { header: 'Timestamp', accessorKey: 'server_timestamp', cell: (item: any) => new Date(item.server_timestamp).toLocaleString('en-IN') },
    { header: 'User', accessorKey: 'user_name', cell: (item: any) => item.user_name || item.user_email || 'Admin User' },
    { header: 'Action', accessorKey: 'action', cell: (item: any) => (
      <Badge variant={item.action === 'INSERT' ? 'success' : item.action === 'UPDATE' ? 'warning' : 'danger'}>
        {item.action}
      </Badge>
    )},
    { header: 'Table', accessorKey: 'table_name', cell: (item: any) => <span className="font-mono text-xs text-white">{item.table_name}</span> },
    { header: 'Reason / Purpose', accessorKey: 'reason', cell: (item: any) => item.reason || 'Financial mutation' }
  ];

  const agingColumns = [
    { header: 'Party Name', accessorKey: 'party_name', cell: (item: any) => <span className="font-medium text-white">{item.party_name}</span> },
    { header: 'GSTIN', accessorKey: 'gstin', cell: (item: any) => <span className="font-mono text-xs text-textSecondary">{item.gstin || 'Unregistered'}</span> },
    { header: '0 - 30 Days (₹)', accessorKey: 'bucket_0_30', cell: (item: any) => formatCurrency(item.bucket_0_30 || 0) },
    { header: '31 - 60 Days (₹)', accessorKey: 'bucket_31_60', cell: (item: any) => formatCurrency(item.bucket_31_60 || 0) },
    { header: '61 - 90 Days (₹)', accessorKey: 'bucket_61_90', cell: (item: any) => formatCurrency(item.bucket_61_90 || 0) },
    { header: '90+ Days Overdue (₹)', accessorKey: 'bucket_over_90', cell: (item: any) => <span className="text-danger font-semibold">{formatCurrency(item.bucket_over_90 || 0)}</span> },
    { header: 'Total Outstanding', accessorKey: 'total_outstanding', cell: (item: any) => <span className="font-bold text-primary">{formatCurrency(item.total_outstanding || 0)}</span> }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Statutory & MIS Reporting Center</h1>
          <p className="text-textSecondary mt-1">Real-time compliance reports under Section 44AA, CGST Rule 56, and MCA Rule 11(g).</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success" className="px-3 py-1 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4" /> MCA Rule 11(g) Compliant
          </Badge>
          <button 
            onClick={fetchReport}
            className="p-2 bg-surface border border-border rounded-lg text-textSecondary hover:text-white hover:border-primary transition-colors"
            title="Refresh Report Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Report Cards / Tabs Selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {reportTypes.map((rep) => (
          <div
            key={rep.id}
            onClick={() => setSelectedReport(rep.id)}
            className={`glass-card p-4 cursor-pointer transition-all border ${
              selectedReport === rep.id 
                ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(212,168,67,0.2)]' 
                : 'border-border hover:border-white/30'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${selectedReport === rep.id ? 'bg-primary text-black' : 'bg-surface text-textSecondary'}`}>
                {rep.id}
              </span>
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-playfair font-semibold text-white text-sm">{rep.name}</h3>
            <p className="text-xs text-textSecondary mt-1 line-clamp-2">{rep.desc}</p>
          </div>
        ))}
      </div>

      {/* Dynamic Report Container */}
      <div className="glass-card p-6 space-y-6">
        {/* Sub-header & Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border pb-4 gap-4">
          <div>
            <h2 className="text-xl font-playfair font-bold text-white">{selectedReport} Report</h2>
            <p className="text-xs text-textSecondary">
              Statutory Mercantile Format • Generated on {new Date().toLocaleDateString('en-IN')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter controls based on report type */}
            {(selectedReport === 'Trial Balance' || selectedReport === 'Balance Sheet' || selectedReport === 'Stock Register' || selectedReport === 'Age-Wise Outstanding') && (
              <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-white">
                <Calendar className="w-3.5 h-3.5 text-textSecondary" />
                <span className="text-textSecondary">As Of:</span>
                <input 
                  type="date" 
                  value={asOfDate} 
                  onChange={(e) => setAsOfDate(e.target.value)} 
                  className="bg-transparent border-none text-white focus:outline-none text-xs" 
                />
              </div>
            )}

            {(selectedReport === 'Profit & Loss' || selectedReport === 'GST Tax Register' || selectedReport === 'Audit Trail Log') && (
              <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-white">
                <Calendar className="w-3.5 h-3.5 text-textSecondary" />
                <span className="text-textSecondary">From:</span>
                <input 
                  type="date" 
                  value={fromDate} 
                  onChange={(e) => setFromDate(e.target.value)} 
                  className="bg-transparent border-none text-white focus:outline-none text-xs" 
                />
                <span className="text-textSecondary">To:</span>
                <input 
                  type="date" 
                  value={toDate} 
                  onChange={(e) => setToDate(e.target.value)} 
                  className="bg-transparent border-none text-white focus:outline-none text-xs" 
                />
              </div>
            )}

            {selectedReport === 'Production Account' && (
              <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-white">
                <Calendar className="w-3.5 h-3.5 text-textSecondary" />
                <span className="text-textSecondary">Month:</span>
                <input 
                  type="month" 
                  value={monthYear} 
                  onChange={(e) => setMonthYear(e.target.value)} 
                  className="bg-transparent border-none text-white focus:outline-none text-xs" 
                />
              </div>
            )}

            <button 
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border text-white text-xs font-semibold rounded-lg hover:border-primary transition-colors"
            >
              <Download className="w-4 h-4" /> Print / Export PDF
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-textSecondary">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <span>Fetching live statutory records from database...</span>
          </div>
        ) : selectedReport === 'Trial Balance' ? (
          /* 1. Trial Balance [S44AA] */
          <div className="space-y-4">
            <DataTable columns={trialColumns} data={reportData?.accounts || []} />
            <div className="bg-surface border border-border rounded-xl p-4 flex flex-col md:flex-row justify-between items-center text-sm gap-4">
              <span className="font-semibold text-white">Trial Balance Equality Check [S44AA]:</span>
              <div className="flex items-center gap-6">
                <span className="text-textSecondary">Total Dr: <strong className="text-white font-mono">{formatCurrency(reportData?.total_debit || 0)}</strong></span>
                <span className="text-textSecondary">Total Cr: <strong className="text-white font-mono">{formatCurrency(reportData?.total_credit || 0)}</strong></span>
                <Badge variant={reportData?.is_balanced ? 'success' : 'danger'}>
                  {reportData?.is_balanced ? 'Balanced (Dr = Cr)' : 'Unbalanced'}
                </Badge>
              </div>
            </div>
          </div>
        ) : selectedReport === 'Profit & Loss' ? (
          /* 2. Profit & Loss [S44AA] */
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
                <h3 className="font-playfair font-bold text-white text-base border-b border-border pb-2">Revenue / Direct Income</h3>
                <div className="space-y-2 text-sm">
                  {(reportData?.revenue || []).length === 0 ? (
                    <div className="text-textSecondary py-3 text-center">No revenue recorded in selected period</div>
                  ) : (
                    (reportData?.revenue || []).map((r: any) => (
                      <div key={r.code} className="flex justify-between items-center py-1 border-b border-border/40">
                        <div>
                          <span className="text-white">{r.account_name}</span>
                          <span className="text-textSecondary text-xs block">{r.code}</span>
                        </div>
                        <span className="text-white font-mono">{formatCurrency(r.total_cr - r.total_dr)}</span>
                      </div>
                    ))
                  )}
                  <div className="border-t border-border pt-3 flex justify-between font-semibold">
                    <span className="text-white">Total Revenue</span>
                    <span className="text-success font-mono">{formatCurrency(reportData?.total_revenue || 0)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
                <h3 className="font-playfair font-bold text-white text-base border-b border-border pb-2">Cost of Goods & Expenses</h3>
                <div className="space-y-2 text-sm">
                  {(reportData?.expenses || []).length === 0 ? (
                    <div className="text-textSecondary py-3 text-center">No expenses recorded in selected period</div>
                  ) : (
                    (reportData?.expenses || []).map((e: any) => (
                      <div key={e.code} className="flex justify-between items-center py-1 border-b border-border/40">
                        <div>
                          <span className="text-white">{e.account_name}</span>
                          <span className="text-textSecondary text-xs block">{e.code}</span>
                        </div>
                        <span className="text-white font-mono">{formatCurrency(e.total_dr - e.total_cr)}</span>
                      </div>
                    ))
                  )}
                  <div className="border-t border-border pt-3 flex justify-between font-semibold">
                    <span className="text-white">Total Expenses</span>
                    <span className="text-danger font-mono">{formatCurrency(reportData?.total_expenses || 0)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-primary/30 rounded-xl p-5 flex justify-between items-center">
              <div>
                <span className="font-playfair font-bold text-lg text-white">Net Operating Profit / (Loss)</span>
                <p className="text-xs text-textSecondary">Calculated for statutory tax computation [S44AA]</p>
              </div>
              <span className={`text-2xl font-bold font-mono ${Number(reportData?.net_profit || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatCurrency(reportData?.net_profit || 0)}
              </span>
            </div>
          </div>
        ) : selectedReport === 'Balance Sheet' ? (
          /* 3. Balance Sheet [S44AA] */
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Assets Section */}
              <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-border pb-3">
                  <h3 className="font-playfair font-bold text-white text-lg">Assets</h3>
                  <span className="text-sm font-semibold text-success font-mono">
                    {formatCurrency(reportData?.total_assets || 0)}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  {(reportData?.assets || []).length === 0 ? (
                    <div className="text-textSecondary py-4 text-center">No asset balances found</div>
                  ) : (
                    (reportData?.assets || []).map((a: any) => (
                      <div key={a.code} className="flex justify-between items-center py-1 border-b border-border/50">
                        <div>
                          <span className="text-white font-medium">{a.account_name}</span>
                          <span className="text-textSecondary text-xs block">{a.group_name} ({a.code})</span>
                        </div>
                        <span className="text-white font-mono">{formatCurrency(a.balance || 0)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Liabilities & Equity Section */}
              <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-border pb-3">
                  <h3 className="font-playfair font-bold text-white text-lg">Liabilities & Capital Equity</h3>
                  <span className="text-sm font-semibold text-warning font-mono">
                    {formatCurrency(reportData?.totals?.total_liabilities_and_equity || 0)}
                  </span>
                </div>
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="text-xs uppercase font-semibold text-textSecondary mb-2">Liabilities</h4>
                    {(reportData?.liabilities || []).length === 0 ? (
                      <div className="text-textSecondary py-1 text-xs">No active liabilities</div>
                    ) : (
                      (reportData?.liabilities || []).map((l: any) => (
                        <div key={l.code} className="flex justify-between items-center py-1 border-b border-border/50">
                          <div>
                            <span className="text-white font-medium">{l.account_name}</span>
                            <span className="text-textSecondary text-xs block">{l.code}</span>
                          </div>
                          <span className="text-white font-mono">{formatCurrency(l.balance || 0)}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs uppercase font-semibold text-textSecondary mb-2">Capital & Equity</h4>
                    {(reportData?.equity || []).map((eq: any) => (
                      <div key={eq.code} className="flex justify-between items-center py-1 border-b border-border/50">
                        <div>
                          <span className="text-white font-medium">{eq.account_name}</span>
                          <span className="text-textSecondary text-xs block">{eq.code}</span>
                        </div>
                        <span className="text-white font-mono">{formatCurrency(eq.balance || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-xl p-4 flex justify-between items-center text-sm">
              <span className="font-semibold text-white">Balance Sheet Balance Verification:</span>
              <div className="flex items-center gap-6">
                <span className="text-textSecondary">Total Assets: <strong className="text-white font-mono">{formatCurrency(reportData?.total_assets || 0)}</strong></span>
                <span className="text-textSecondary">Total Liab + Equity: <strong className="text-white font-mono">{formatCurrency(reportData?.totals?.total_liabilities_and_equity || 0)}</strong></span>
                <Badge variant={reportData?.totals?.is_balanced ? 'success' : 'danger'}>
                  {reportData?.totals?.is_balanced ? 'Matched (Assets = Liab + Equity)' : 'Difference Detected'}
                </Badge>
              </div>
            </div>
          </div>
        ) : selectedReport === 'Stock Register' ? (
          /* 4. Stock Register [CGST Rule 56(2)] */
          <div className="space-y-4">
            <DataTable columns={stockColumns} data={Array.isArray(reportData) ? reportData : reportData?.items || reportData?.stock || []} />
            <div className="bg-surface border border-border rounded-xl p-4 flex flex-col md:flex-row justify-between items-center text-sm gap-4">
              <span className="font-semibold text-white">Stock Valuation Summary [CGST Rule 56(2)]:</span>
              <div className="flex items-center gap-6">
                <span className="text-textSecondary">Gold Stock Weight: <strong className="text-white font-mono">{Number(reportData?.total_gold_weight_gm || 0).toFixed(2)} gm</strong></span>
                <span className="text-textSecondary">Total Valuation: <strong className="text-primary font-mono">{formatCurrency(reportData?.total_stock_value || 0)}</strong></span>
              </div>
            </div>
          </div>
        ) : selectedReport === 'Production Account' ? (
          /* 5. Monthly Production Account [CGST Rule 56(12)] */
          <div className="space-y-6">
            {/* Manufacturing Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-surface border border-border rounded-xl p-4">
                <span className="text-xs text-textSecondary">Orders Completed</span>
                <p className="text-2xl font-bold text-white mt-1">{reportData?.summary?.completed_orders || 0} / {reportData?.summary?.total_orders || 0}</p>
              </div>
              <div className="bg-surface border border-border rounded-xl p-4">
                <span className="text-xs text-textSecondary">Raw Material Consumed</span>
                <p className="text-2xl font-bold text-warning mt-1">{Number(reportData?.summary?.total_consumed_wt_gm || 0).toFixed(2)} gm</p>
                <span className="text-xs text-textSecondary font-mono">{formatCurrency(reportData?.summary?.total_consumed_cost || 0)}</span>
              </div>
              <div className="bg-surface border border-border rounded-xl p-4">
                <span className="text-xs text-textSecondary">Finished Output Produced</span>
                <p className="text-2xl font-bold text-success mt-1">{Number(reportData?.summary?.total_output_wt_gm || 0).toFixed(2)} gm</p>
                <span className="text-xs text-textSecondary font-mono">{formatCurrency(reportData?.summary?.total_output_valuation || 0)}</span>
              </div>
              <div className="bg-surface border border-border rounded-xl p-4">
                <span className="text-xs text-textSecondary">Melting & Bench Loss</span>
                <p className="text-2xl font-bold text-danger mt-1">{Number(reportData?.summary?.total_wastage_wt_gm || 0).toFixed(2)} gm</p>
                <span className="text-xs text-textSecondary font-mono">{formatCurrency(reportData?.summary?.total_wastage_cost || 0)}</span>
              </div>
            </div>

            {/* Consumption & Output Details */}
            <div className="space-y-3">
              <h3 className="font-playfair font-bold text-white text-base">Raw Materials Issued to Artisans / WIP</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-textSecondary border-b border-border">
                    <tr>
                      <th className="pb-2">Material</th>
                      <th className="pb-2">Qty Issued</th>
                      <th className="pb-2">Net Wt</th>
                      <th className="pb-2">Purity</th>
                      <th className="pb-2">Rate (₹)</th>
                      <th className="pb-2 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(reportData?.consumption || []).length === 0 ? (
                      <tr><td colSpan={6} className="py-4 text-center text-textSecondary">No consumption entries for {monthYear}</td></tr>
                    ) : (
                      (reportData?.consumption || []).map((c: any) => (
                        <tr key={c.id}>
                          <td className="py-2 text-white font-medium">{c.material_name} ({c.material_code})</td>
                          <td className="py-2 text-textSecondary">{c.quantity_issued} {c.uom}</td>
                          <td className="py-2 text-white">{c.net_weight} gm</td>
                          <td className="py-2 text-textSecondary">{c.purity}</td>
                          <td className="py-2 font-mono">{formatCurrency(c.rate)}</td>
                          <td className="py-2 text-right font-mono font-semibold text-white">{formatCurrency(c.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Finished Goods Output Details */}
            <div className="space-y-3 pt-4 border-t border-border">
              <h3 className="font-playfair font-bold text-white text-base">Finished Goods Output & Hallmarking</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-textSecondary border-b border-border">
                    <tr>
                      <th className="pb-2">Material / Product</th>
                      <th className="pb-2">Qty Produced</th>
                      <th className="pb-2">Net Weight</th>
                      <th className="pb-2">Hallmark / Certificate</th>
                      <th className="pb-2">Valuation Rate</th>
                      <th className="pb-2 text-right">Valuation Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(reportData?.output || []).length === 0 ? (
                      <tr><td colSpan={6} className="py-4 text-center text-textSecondary">No output entries for {monthYear}</td></tr>
                    ) : (
                      (reportData?.output || []).map((o: any) => (
                        <tr key={o.id}>
                          <td className="py-2 text-white font-medium">{o.material_name}</td>
                          <td className="py-2 text-textSecondary">{o.quantity_produced} pc</td>
                          <td className="py-2 text-white">{o.net_weight} gm</td>
                          <td className="py-2 text-primary font-mono">{o.hallmark_no || 'BIS Hallmarked'}</td>
                          <td className="py-2 font-mono">{formatCurrency(o.valuation_rate)}</td>
                          <td className="py-2 text-right font-mono font-semibold text-success">{formatCurrency(o.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : selectedReport === 'GST Tax Register' ? (
          /* 6. GST Tax Register [CGST Rule 56(4)] */
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-surface border border-border rounded-xl p-4">
                <span className="text-xs text-textSecondary">Material Taxable (3% GST)</span>
                <p className="text-xl font-bold text-white mt-1">{formatCurrency(reportData?.summary?.total_material_taxable_3pct || 0)}</p>
              </div>
              <div className="bg-surface border border-border rounded-xl p-4">
                <span className="text-xs text-textSecondary">Making Charges (5% GST)</span>
                <p className="text-xl font-bold text-white mt-1">{formatCurrency(reportData?.summary?.total_making_taxable_5pct || 0)}</p>
              </div>
              <div className="bg-surface border border-border rounded-xl p-4">
                <span className="text-xs text-textSecondary">Total Output GST</span>
                <p className="text-xl font-bold text-primary mt-1">{formatCurrency(reportData?.summary?.total_output_gst || 0)}</p>
              </div>
              <div className="bg-surface border border-border rounded-xl p-4">
                <span className="text-xs text-textSecondary">Net GST Payable in Cash</span>
                <p className="text-xl font-bold text-success mt-1">{formatCurrency(reportData?.summary?.net_payable_cash || 0)}</p>
              </div>
            </div>

            {/* Outward supplies table */}
            <div className="space-y-3">
              <h3 className="font-playfair font-bold text-white text-base">Outward Tax Invoices (Dual-Rate GST 3% & 5%)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-textSecondary border-b border-border">
                    <tr>
                      <th className="pb-2">Invoice No</th>
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Customer</th>
                      <th className="pb-2">Material Value (3%)</th>
                      <th className="pb-2">Making Charges (5%)</th>
                      <th className="pb-2">Total GST</th>
                      <th className="pb-2 text-right">Grand Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(reportData?.output_register || []).length === 0 ? (
                      <tr><td colSpan={7} className="py-4 text-center text-textSecondary">No outward sales invoices in selected period</td></tr>
                    ) : (
                      (reportData?.output_register || []).map((out: any) => (
                        <tr key={out.id}>
                          <td className="py-2 text-primary font-mono">{out.invoice_no}</td>
                          <td className="py-2 text-textSecondary">{new Date(out.invoice_date).toLocaleDateString('en-IN')}</td>
                          <td className="py-2 text-white font-medium">{out.customer_name}</td>
                          <td className="py-2 font-mono">{formatCurrency(out.material_taxable_value)}</td>
                          <td className="py-2 font-mono">{formatCurrency(out.making_taxable_value)}</td>
                          <td className="py-2 font-mono text-warning">{formatCurrency(out.total_tax_amount)}</td>
                          <td className="py-2 text-right font-mono font-bold text-white">{formatCurrency(out.grand_total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : selectedReport === 'Age-Wise Outstanding' ? (
          /* 7. Age-Wise Outstanding [S44AA] */
          <div className="space-y-4">
            <DataTable columns={agingColumns} data={reportData?.aging_report || []} />
            <div className="bg-surface border border-border rounded-xl p-4 flex justify-between items-center text-sm">
              <span className="font-semibold text-white">Total Outstanding Receivables:</span>
              <span className="text-primary font-mono font-bold text-lg">{formatCurrency(reportData?.totals?.total_outstanding || 0)}</span>
            </div>
          </div>
        ) : (
          /* 8. Audit Trail Log [MCA Rule 11(g)] */
          <div className="space-y-4">
            <DataTable columns={auditColumns} data={reportData?.audit_trail || []} />
            <div className="p-3 bg-surface border border-border rounded-lg text-xs text-textSecondary flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span><strong>MCA Rule 11(g) Statement:</strong> {reportData?.note || 'Immutable database audit log enabled. Direct DELETE and UPDATE mutations are permanently prohibited at schema level.'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
