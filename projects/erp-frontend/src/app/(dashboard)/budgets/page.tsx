"use client";

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';

import { BudgetRow, controlsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

// An amount per income or expense ledger for the financial year, read against
// what the books show so far. Under budget is good for an expense; over it is
// good for income.

export default function BudgetsPage() {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [meta, setMeta] = useState<{ year_label: string; upto: string } | null>(null);
  const [totals, setTotals] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await controlsApi.getBudgets();
      setRows(res.data?.rows || []);
      setTotals(res.data?.totals || null);
      setMeta({ year_label: res.data?.fiscal_year?.year_label, upto: res.data?.actuals_up_to });
      setEdits({});
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const changed = Object.entries(edits).filter(([id, v]) => {
    const row = rows.find((r) => r.account_id === id);
    return row && Number(v || 0) !== row.budget;
  });

  const save = async () => {
    setSaving(true); setMessage('');
    try {
      await controlsApi.saveBudgets(changed.map(([account_id, v]) => ({ account_id, amount: Number(v || 0) })));
      setMessage(`${changed.length} budget${changed.length === 1 ? '' : 's'} saved.`);
      await load();
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Could not save the budgets.');
    } finally {
      setSaving(false);
    }
  };

  const section = (nature: 'Income' | 'Expenses') => {
    const list = rows.filter((r) => r.nature === nature);
    const t = totals?.[nature];
    return (
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-playfair font-semibold text-white">{nature}</h3>
          {t && <span className="text-xs text-textSecondary">Budget {formatCurrency(t.budget)} · actual {formatCurrency(t.actual)}{t.used_pct != null ? ` · ${t.used_pct}%` : ''}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-textSecondary text-xs uppercase tracking-wider border-b border-border">
              <tr>
                <th className="text-left py-2 pr-3">Ledger</th>
                <th className="text-right py-2 px-3 w-40">Budget (₹)</th>
                <th className="text-right py-2 px-3">Actual (₹)</th>
                <th className="text-left py-2 px-3 w-48">Used</th>
                <th className="text-right py-2 pl-3">Variance (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((r) => {
                const value = edits[r.account_id] ?? (r.budget ? String(r.budget) : '');
                const pct = r.used_pct ?? 0;
                const over = nature === 'Expenses' && r.budget > 0 && r.actual > r.budget;
                return (
                  <tr key={r.account_id}>
                    <td className="py-2.5 pr-3">
                      <span className="block text-white">{r.name}</span>
                      <span className="block text-xs text-textSecondary">{r.code} · {r.group_name}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <input type="number" min="0" step="1" value={value} placeholder="—"
                        onChange={(e) => setEdits({ ...edits, [r.account_id]: e.target.value })}
                        className="w-full bg-surface border border-border rounded px-2 py-1.5 text-right font-mono text-white focus:border-primary outline-none" />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-white">{formatCurrency(r.actual)}</td>
                    <td className="py-2.5 px-3">
                      {r.budget > 0 ? (
                        <span className="flex items-center gap-2">
                          <span className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <span className="block h-1.5 rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: over ? '#d95926' : '#3987e5' }} />
                          </span>
                          <span className="text-xs text-textSecondary w-12 text-right">{pct}%</span>
                        </span>
                      ) : <span className="text-xs text-textSecondary">no budget</span>}
                    </td>
                    <td className={`py-2.5 pl-3 text-right font-mono ${r.budget > 0 ? (r.favourable ? 'text-success' : 'text-danger') : 'text-textSecondary'}`}>
                      {r.budget > 0 ? `${r.favourable ? '' : '−'}${formatCurrency(Math.abs(r.variance))}` : '—'}
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-textSecondary">No {nature.toLowerCase()} ledgers.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Budgets</h1>
          <p className="text-textSecondary mt-1">
            {meta ? `Financial year ${meta.year_label} · actuals up to ${new Date(meta.upto).toLocaleDateString('en-IN')}` : 'Budget against actuals for the financial year.'}
          </p>
        </div>
        <button onClick={save} disabled={saving || changed.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-gold-gradient text-background font-semibold text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save {changed.length > 0 ? `${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Budgets'}
        </button>
      </div>
      {message && <div className="glass-card p-3 text-sm text-textSecondary">{message}</div>}
      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
      ) : (
        <>
          {section('Expenses')}
          {section('Income')}
        </>
      )}
    </div>
  );
}
