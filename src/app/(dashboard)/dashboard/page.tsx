'use client';

import { IndianRupee, Diamond, ShoppingBag, FileText, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import StatsCard from '@/components/ui/StatsCard';
import RevenueChart from '@/components/charts/RevenueChart';
import StockChart from '@/components/charts/StockChart';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    revenue: 0,
    revenue_ytd: 0,
    stock_grams: 0,
    stock_value: 0,
    pending_orders: 0,
    completed_orders: 0,
    gst_liability: 0,
    output_gst: 0,
    itc_available: 0
  });
  const [revenueChartData, setRevenueChartData] = useState<any[]>([]);
  const [stockChartData, setStockChartData] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/reports/dashboard-stats');
      if (res.data) {
        if (res.data.stats) setStats(res.data.stats);
        if (res.data.revenue_chart) setRevenueChartData(res.data.revenue_chart);
        if (res.data.stock_chart) setStockChartData(res.data.stock_chart);
        if (res.data.recent_transactions) setTransactions(res.data.recent_transactions);
        if (res.data.alerts) setAlerts(res.data.alerts);
      }
    } catch (err) {
      console.error('Dashboard data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const transactionColumns = [
    { header: 'Voucher No', accessorKey: 'id', cell: (item: any) => <span className="font-mono font-medium text-primary">{item.id}</span> },
    { header: 'Voucher Type', accessorKey: 'type', cell: (item: any) => <span className="text-textSecondary text-xs px-2 py-0.5 rounded bg-surface border border-border">{item.type}</span> },
    { header: 'Particulars', accessorKey: 'entity', cell: (item: any) => <span className="text-white text-sm line-clamp-1">{item.entity}</span> },
    { header: 'Date', accessorKey: 'date', cell: (item: any) => <span className="text-textSecondary text-xs">{new Date(item.date).toLocaleDateString('en-IN')}</span> },
    { header: 'Amount', accessorKey: 'amount', cell: (item: any) => <span className="font-medium text-white">{formatCurrency(item.amount)}</span> },
    { header: 'Status', accessorKey: 'status', cell: (item: any) => (
      <Badge variant={item.status === 'Posted' || item.status === 'Completed' ? 'success' : item.status === 'Draft' ? 'warning' : 'info'}>
        {item.status || 'Posted'}
      </Badge>
    )}
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Executive Dashboard</h1>
          <p className="text-textSecondary mt-1">Real-time enterprise metrics, live inventory valuation, and GST compliance overview.</p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg text-textSecondary hover:text-white hover:border-primary transition-colors text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Live Data
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          title="Total Revenue (MTD)" 
          value={loading ? '...' : formatCurrency(stats.revenue)} 
          icon={<IndianRupee className="w-6 h-6" />}
          subtitle={`YTD: ${formatCurrency(stats.revenue_ytd)}`}
        />
        <StatsCard 
          title="Precious Metal Stock" 
          value={loading ? '...' : `${Number(stats.stock_grams).toFixed(2)} gm`} 
          icon={<Diamond className="w-6 h-6" />}
          subtitle={`Valuation: ${formatCurrency(stats.stock_value)}`}
        />
        <StatsCard 
          title="Production Work Orders" 
          value={loading ? '...' : `${stats.pending_orders} Active`} 
          icon={<ShoppingBag className="w-6 h-6" />}
          subtitle={`${stats.completed_orders} Completed Orders`}
        />
        <StatsCard 
          title="Net GST Liability" 
          value={loading ? '...' : formatCurrency(stats.gst_liability)} 
          icon={<FileText className="w-6 h-6" />}
          subtitle={`ITC: ${formatCurrency(stats.itc_available)}`}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-playfair font-semibold text-white">Revenue vs Expenses (Live)</h3>
            <span className="text-xs text-textSecondary">Monthly Trend</span>
          </div>
          <RevenueChart data={revenueChartData} />
        </div>
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-playfair font-semibold text-white">Current Stock Balances (Live)</h3>
            <span className="text-xs text-textSecondary">Weight by Category</span>
          </div>
          <StockChart data={stockChartData} />
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-playfair font-semibold text-white">Recent Journal Transactions</h3>
            <span className="text-xs text-textSecondary">Double-Entry Ledger [S44AA]</span>
          </div>
          {loading ? (
             <div className="animate-pulse space-y-4">
                <div className="h-8 bg-white/10 rounded w-full"></div>
                <div className="h-8 bg-white/10 rounded w-full"></div>
                <div className="h-8 bg-white/10 rounded w-full"></div>
             </div>
          ) : transactions.length > 0 ? (
            <DataTable columns={transactionColumns} data={transactions} />
          ) : (
            <div className="text-center py-8 text-textSecondary">No recent transactions.</div>
          )}
        </div>
        
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-playfair font-semibold text-white">Statutory & Inventory Alerts</h3>
            <Badge variant="warning">{alerts.length} Active</Badge>
          </div>
          
          <div className="space-y-3 mt-4">
            {alerts.length === 0 ? (
              <div className="text-center py-6 text-textSecondary text-sm">No active alerts. All systems compliant.</div>
            ) : (
              alerts.map((al, idx) => (
                <div 
                  key={idx} 
                  className={`p-3 rounded-lg flex gap-3 items-start border ${
                    al.type === 'warning' 
                      ? 'bg-warning/10 border-warning/20' 
                      : 'bg-primary/10 border-primary/20'
                  }`}
                >
                  {al.type === 'warning' ? (
                    <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  ) : (
                    <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">{al.title}</p>
                    <p className="text-xs text-textSecondary mt-1">{al.desc}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
