"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Landmark, Wallet } from 'lucide-react';

import CashFlowChart, { FLOW_IN, FLOW_OUT } from '@/components/charts/CashFlowChart';
import { insightsApi, BusinessOverview } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

// Who owes the business, whom it owes, how much cash there is, where the
// money went. Each figure links to the report that owns it.

function DueCard({ title, hint, icon, dues, href, loading }: {
  title: string; hint: string; icon: React.ReactNode; href: string; loading: boolean;
  dues?: BusinessOverview['receivables'];
}) {
  const total = dues?.total ?? 0;
  const overdue = dues?.overdue ?? 0;
  const current = dues?.current ?? 0;
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  return (
    <Link href={href} className="glass-card p-6 block hover:border-primary/60 transition-colors border border-border">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-textSecondary uppercase tracking-wider">{title}</p>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="text-xs text-textSecondary mt-1">{hint}</p>
      <h4 className="text-3xl font-playfair font-semibold text-white mt-3">{loading ? '...' : formatCurrency(total)}</h4>
      {/* current | overdue, as one bar with a gap between the two parts */}
      <div className="flex gap-[2px] h-1.5 mt-4" aria-hidden="true">
        {total > 0 ? (
          <>
            {current > 0 && <div className="rounded-full" style={{ width: `${pct}%`, backgroundColor: FLOW_IN }} />}
            {overdue > 0 && <div className="rounded-full" style={{ width: `${100 - pct}%`, backgroundColor: FLOW_OUT }} />}
          </>
        ) : (
          <div className="rounded-full w-full bg-white/10" />
        )}
      </div>
      <div className="mt-3 space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-textSecondary">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: FLOW_IN }} />
            Current
          </span>
          <span className="text-white font-mono">{formatCurrency(current)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-textSecondary">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: FLOW_OUT }} />
            Overdue{dues && dues.overdue_count > 0 ? ` · ${dues.overdue_count} ${dues.overdue_count === 1 ? 'bill' : 'bills'}` : ''}
          </span>
          <span className="text-white font-mono">{formatCurrency(overdue)}</span>
        </div>
      </div>
    </Link>
  );
}

export default function MoneyOverview({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<BusinessOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    insightsApi.overview()
      .then((res) => { if (active) { setData(res.data); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey]);

  if (failed) {
    return <div className="glass-card p-4 text-sm text-textSecondary">The business overview could not be loaded. The figures below are unaffected.</div>;
  }

  const flow = data?.cash_flow;
  const expenses = data?.top_expenses;
  const maxExpense = Math.max(1, ...(expenses?.rows || []).map((r) => r.amount));
  const hasFlow = (flow?.months || []).some((m) => m.incoming > 0 || m.outgoing > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <DueCard
          title="Total Receivables" hint="Unpaid sales invoices" href="/outstanding"
          icon={<ArrowDownLeft className="w-5 h-5" />} dues={data?.receivables} loading={loading}
        />
        <DueCard
          title="Total Payables" hint="Unpaid purchase bills" href="/outstanding"
          icon={<ArrowUpRight className="w-5 h-5" />} dues={data?.payables} loading={loading}
        />
        <Link href="/banking" className="glass-card p-6 block hover:border-primary/60 transition-colors border border-border">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-textSecondary uppercase tracking-wider">Cash &amp; Bank</p>
            <Landmark className="w-5 h-5 text-primary" />
          </div>
          <p className="text-xs text-textSecondary mt-1">Book balances today</p>
          <h4 className="text-3xl font-playfair font-semibold text-white mt-3">{loading ? '...' : formatCurrency(data?.cash_bank.total ?? 0)}</h4>
          <div className="mt-4 space-y-1.5">
            {(data?.cash_bank.accounts || []).slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-textSecondary truncate">
                  {a.account_type === 'Cash' ? <Wallet className="w-3.5 h-3.5" /> : <Landmark className="w-3.5 h-3.5" />}
                  <span className="truncate">{a.name}</span>
                </span>
                <span className="text-white font-mono">{formatCurrency(a.balance)}</span>
              </div>
            ))}
            {!loading && (data?.cash_bank.accounts || []).length === 0 && (
              <p className="text-xs text-textSecondary">No cash or bank ledger yet. Add one under Accounting.</p>
            )}
            {(data?.cash_bank.accounts || []).length > 4 && (
              <p className="text-xs text-textSecondary">+ {(data?.cash_bank.accounts || []).length - 4} more</p>
            )}
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-playfair font-semibold text-white">Cash Flow</h3>
            <span className="text-xs text-textSecondary">This financial year · cash and bank ledgers, transfers between them left out</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 mb-2 text-xs">
            <div><p className="text-textSecondary">Cash on {data?.fy_start ? new Date(data.fy_start).toLocaleDateString('en-IN') : '1 April'}</p><p className="text-white font-mono text-sm mt-0.5">{formatCurrency(flow?.opening ?? 0)}</p></div>
            <div><p className="text-textSecondary">Money in (+)</p><p className="text-white font-mono text-sm mt-0.5">{formatCurrency(flow?.incoming ?? 0)}</p></div>
            <div><p className="text-textSecondary">Money out (−)</p><p className="text-white font-mono text-sm mt-0.5">{formatCurrency(flow?.outgoing ?? 0)}</p></div>
            <div><p className="text-textSecondary">Cash today (=)</p><p className="text-white font-mono text-sm mt-0.5">{formatCurrency(flow?.closing ?? 0)}</p></div>
          </div>
          {hasFlow ? (
            <CashFlowChart data={flow?.months || []} />
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-textSecondary">
              {loading ? 'Loading...' : 'No receipts or payments recorded this year yet.'}
            </div>
          )}
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-playfair font-semibold text-white">Top Expenses</h3>
            <Link href="/reports?report=expenses_by_account" className="text-xs text-primary hover:underline">All expenses</Link>
          </div>
          <p className="text-xs text-textSecondary mt-1">
            This financial year · total {formatCurrency(expenses?.total ?? 0)} against income {formatCurrency(data?.income_expense.income ?? 0)}
          </p>
          <div className="mt-5 space-y-4">
            {(expenses?.rows || []).map((r) => (
              <div key={r.account_id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white truncate pr-3" title={`${r.code} · ${r.group_name}`}>{r.name}</span>
                  <span className="text-white font-mono text-xs">{formatCurrency(r.amount)}</span>
                </div>
                <div className="h-1.5 mt-1.5 rounded-full bg-white/5">
                  <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (r.amount / maxExpense) * 100)}%`, backgroundColor: FLOW_IN }} />
                </div>
              </div>
            ))}
            {!loading && (expenses?.rows || []).length === 0 && (
              <p className="text-sm text-textSecondary py-6 text-center">No expense recorded this financial year.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
