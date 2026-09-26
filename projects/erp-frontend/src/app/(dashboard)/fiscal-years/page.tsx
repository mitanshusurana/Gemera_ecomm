'use client';

import { useEffect, useState } from 'react';
import { CalendarRange, Lock, Unlock, CheckCircle2, Plus, Loader2, AlertTriangle, BookLock } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { fiscalYearsApi, type ClosingPreview, type FiscalYear } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { normaliseRole, useMe } from '@/lib/session';

const CAN_AMEND = ['owner', 'admin'];

function errorText(err: any, fallback: string): string {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: any) => x.msg || JSON.stringify(x)).join('; ');
  return fallback;
}

export default function FiscalYearsPage() {
  const { me } = useMe();
  const canAmend = CAN_AMEND.includes(normaliseRole(me?.role));

  const [years, setYears] = useState<FiscalYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Create
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creating, setCreating] = useState(false);

  // Close
  const [closing, setClosing] = useState<FiscalYear | null>(null);
  const [preview, setPreview] = useState<ClosingPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [closingBusy, setClosingBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fiscalYearsApi.list();
      setYears(res.data?.fiscal_years || []);
    } catch (err) {
      setMessage({ kind: 'err', text: errorText(err, 'Failed to load fiscal years') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const suggestNext = () => {
    const last = years[years.length - 1];
    if (!last) return;
    const end = new Date(last.end_date);
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
    const nextEnd = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate() - 1);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setStartDate(iso(start));
    setEndDate(iso(nextEnd));
    setLabel(`${start.getFullYear()}-${String(nextEnd.getFullYear() % 100).padStart(2, '0')}`);
  };

  const openCreate = () => {
    setLabel('');
    setStartDate('');
    setEndDate('');
    suggestNext();
    setIsCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await fiscalYearsApi.create({ year_label: label.trim(), start_date: startDate, end_date: endDate });
      setIsCreateOpen(false);
      setMessage({ kind: 'ok', text: `Fiscal year ${label.trim()} created.` });
      await load();
    } catch (err) {
      setMessage({ kind: 'err', text: errorText(err, 'Failed to create fiscal year') });
    } finally {
      setCreating(false);
    }
  };

  const act = async (fy: FiscalYear, action: 'activate' | 'lock' | 'unlock') => {
    setBusyId(fy.id);
    try {
      if (action === 'activate') await fiscalYearsApi.activate(fy.id);
      if (action === 'lock') await fiscalYearsApi.lock(fy.id);
      if (action === 'unlock') await fiscalYearsApi.unlock(fy.id);
      setMessage({ kind: 'ok', text: `${fy.year_label}: ${action} done.` });
      await load();
    } catch (err) {
      setMessage({ kind: 'err', text: errorText(err, `Failed to ${action} ${fy.year_label}`) });
    } finally {
      setBusyId(null);
    }
  };

  const openClose = async (fy: FiscalYear) => {
    setClosing(fy);
    setPreview(null);
    setConfirmText('');
    setPreviewLoading(true);
    try {
      const res = await fiscalYearsApi.closingPreview(fy.id);
      setPreview(res.data);
    } catch (err) {
      setMessage({ kind: 'err', text: errorText(err, 'Failed to compute the closing') });
      setClosing(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClose = async () => {
    if (!closing) return;
    setClosingBusy(true);
    try {
      const res = await fiscalYearsApi.close(closing.id);
      const d = res.data;
      setMessage({
        kind: 'ok',
        text: `${d.closed} closed: ${d.accounts_closed} P&L accounts transferred ${formatCurrency(Number(d.net_profit))} to ${d.retained_earnings_account}; ` +
          `${d.next_year.year_label} ${d.next_year.created ? 'created' : 'already existed'} with ${d.next_year.balances_carried} balances carried forward.`,
      });
      setClosing(null);
      await load();
    } catch (err) {
      setMessage({ kind: 'err', text: errorText(err, 'Year-end closing failed') });
    } finally {
      setClosingBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Fiscal Years</h1>
          <p className="text-textSecondary mt-1">
            Period lock and year-end closing. A locked year refuses every posting dated inside it (HTTP 423).
          </p>
        </div>
        {canAmend && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 text-sm"
          >
            <Plus className="w-4 h-4" /> New Fiscal Year
          </button>
        )}
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm border ${
            message.kind === 'ok' ? 'bg-success/10 border-success/30 text-success' : 'bg-danger/10 border-danger/30 text-danger'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-textSecondary border-b border-border bg-surface/80">
            <tr>
              <th className="px-4 py-3 font-medium">Year</th>
              <th className="px-4 py-3 font-medium">From</th>
              <th className="px-4 py-3 font-medium">To</th>
              <th className="px-4 py-3 font-medium text-right">Entries</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Locked / Closed</th>
              {canAmend && <th className="px-4 py-3 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-textSecondary">Loading fiscal years...</td></tr>
            ) : years.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-textSecondary">No fiscal years. Create one before posting.</td></tr>
            ) : years.map((fy) => {
              const busy = busyId === fy.id;
              const ended = fy.end_date < today;
              return (
                <tr key={fy.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 font-mono font-semibold text-white flex items-center gap-2">
                    <CalendarRange className="w-4 h-4 text-primary" /> {fy.year_label}
                  </td>
                  <td className="px-4 py-3 text-textSecondary">{fy.start_date}</td>
                  <td className="px-4 py-3 text-textSecondary">{fy.end_date}</td>
                  <td className="px-4 py-3 text-right font-mono text-textSecondary">{fy.entry_count}</td>
                  <td className="px-4 py-3">
                    {fy.is_active ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}
                  </td>
                  <td className="px-4 py-3 space-x-2">
                    {fy.is_closed ? (
                      <Badge variant="info" className="gap-1"><BookLock className="w-3 h-3" /> Closed {fy.closed_at ? fy.closed_at.slice(0, 10) : ''}</Badge>
                    ) : fy.is_locked ? (
                      <Badge variant="warning" className="gap-1"><Lock className="w-3 h-3" /> Locked {fy.locked_by_name ? `by ${fy.locked_by_name}` : ''}</Badge>
                    ) : (
                      <Badge variant="default" className="gap-1"><Unlock className="w-3 h-3" /> Open</Badge>
                    )}
                  </td>
                  {canAmend && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {!fy.is_active && !fy.is_closed && (
                          <button disabled={busy} onClick={() => act(fy, 'activate')} className="px-2.5 py-1 rounded text-xs bg-surface border border-border text-white hover:border-primary disabled:opacity-50">
                            Activate
                          </button>
                        )}
                        {!fy.is_closed && (fy.is_locked ? (
                          <button disabled={busy} onClick={() => act(fy, 'unlock')} className="px-2.5 py-1 rounded text-xs bg-surface border border-border text-white hover:border-primary disabled:opacity-50 flex items-center gap-1">
                            <Unlock className="w-3 h-3" /> Unlock
                          </button>
                        ) : (
                          <button disabled={busy} onClick={() => act(fy, 'lock')} className="px-2.5 py-1 rounded text-xs bg-surface border border-border text-white hover:border-primary disabled:opacity-50 flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Lock
                          </button>
                        ))}
                        {!fy.is_closed && ended && (
                          <button disabled={busy} onClick={() => openClose(fy)} className="px-2.5 py-1 rounded text-xs bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 disabled:opacity-50 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Close year
                          </button>
                        )}
                        {busy && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="glass-card p-4 text-xs text-textSecondary space-y-1">
        <p><span className="text-white font-medium">Lock</span> refuses purchases, vouchers, bank reconciliation matches and (once wired) sales dated inside the year; unlock reopens it.</p>
        <p><span className="text-white font-medium">Close year</span> posts the closing journal (every Income and Expenses account into Retained Earnings), locks the year, creates the next one if needed and posts its opening balances. A closed year cannot be reopened.</p>
      </div>

      {/* Create modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="New Fiscal Year">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Label</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={10} placeholder="2027-28"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Start</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">End</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <p className="text-xs text-textSecondary">Years may not overlap. The new year is created inactive; activate it when the business starts posting into it.</p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5 text-sm">Cancel</button>
            <button type="submit" disabled={creating} className="px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50 flex items-center gap-2">
              {creating && <Loader2 className="w-4 h-4 animate-spin" />} Create
            </button>
          </div>
        </form>
      </Modal>

      {/* Close-year confirmation */}
      <Modal isOpen={!!closing} onClose={() => setClosing(null)} title={`Close fiscal year ${closing?.year_label || ''}`}>
        {previewLoading || !preview ? (
          <div className="py-10 flex items-center justify-center gap-3 text-textSecondary">
            <Loader2 className="w-6 h-6 animate-spin text-primary" /> Computing the closing journal...
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg text-warning text-xs flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>This posts the closing journal dated {preview.fiscal_year.end_date}, locks and closes the year, and cannot be undone.</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-surface border border-border rounded-lg">
                <p className="text-[11px] uppercase tracking-wider text-textSecondary">Income closed</p>
                <p className="font-mono text-white text-base">{formatCurrency(Number(preview.total_income))}</p>
                <p className="text-[11px] text-textSecondary">{preview.income_accounts.length} accounts</p>
              </div>
              <div className="p-3 bg-surface border border-border rounded-lg">
                <p className="text-[11px] uppercase tracking-wider text-textSecondary">Expenses closed</p>
                <p className="font-mono text-white text-base">{formatCurrency(Number(preview.total_expenses))}</p>
                <p className="text-[11px] text-textSecondary">{preview.expense_accounts.length} accounts</p>
              </div>
              <div className="p-3 bg-surface border border-primary/40 rounded-lg">
                <p className="text-[11px] uppercase tracking-wider text-textSecondary">To {preview.retained_earnings.code}</p>
                <p className={`font-mono text-base ${Number(preview.net_profit) >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatCurrency(Number(preview.net_profit))}
                </p>
                <p className="text-[11px] text-textSecondary">
                  {preview.retained_earnings.name}: {formatCurrency(Number(preview.retained_earnings.balance_before))} → {formatCurrency(Number(preview.retained_earnings.balance_after))}
                </p>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-surface text-textSecondary sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Account</th>
                    <th className="px-3 py-2 text-left">Nature</th>
                    <th className="px-3 py-2 text-right">Balance closed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...preview.income_accounts, ...preview.expense_accounts].map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-1.5 text-white"><span className="font-mono text-primary">{a.code}</span> {a.name}</td>
                      <td className="px-3 py-1.5 text-textSecondary">{a.nature}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-white">{formatCurrency(Math.abs(Number(a.balance)))} {Number(a.balance) >= 0 ? 'Cr' : 'Dr'}</td>
                    </tr>
                  ))}
                  {preview.income_accounts.length + preview.expense_accounts.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-4 text-center text-textSecondary">No P&L postings in this year; only the lock and the carry-forward will happen.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-textSecondary">
              Next year <span className="font-mono text-white">{preview.next_year.year_label}</span> ({preview.next_year.start_date} to {preview.next_year.end_date}){' '}
              {preview.next_year.exists ? 'exists' : 'will be created'}; {preview.carried_forward.length} balance-sheet balances will be posted as its opening journal.
              {Number(preview.opening_difference) !== 0 && (
                <span className="block mt-1 text-danger">
                  Balance-sheet accounts are out by {formatCurrency(Number(preview.opening_difference))}; the closing will be refused until the opening balances are corrected.
                </span>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Type the year label <span className="font-mono text-white">{closing?.year_label}</span> to confirm</label>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-primary font-mono" />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setClosing(null)} className="px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5 text-sm">Cancel</button>
              <button
                type="button"
                disabled={closingBusy || confirmText.trim() !== closing?.year_label || Number(preview.opening_difference) !== 0}
                onClick={handleClose}
                className="px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {closingBusy && <Loader2 className="w-4 h-4 animate-spin" />} Close {closing?.year_label}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
