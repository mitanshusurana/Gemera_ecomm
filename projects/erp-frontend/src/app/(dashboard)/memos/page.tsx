"use client";

/**
 * Approval memos (jangad).
 *
 * Goods go out to a dealer on approval, stay the company's property, and come
 * back or get invoiced within a fortnight or so. This screen is the register:
 * what is out, with whom, for how long; a form to issue a memo; and, per memo,
 * the return / convert-to-invoice / cancel actions and the printed jangad.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Printer, Download, RotateCcw, FileText, X, Trash2, ClipboardList,
  AlertTriangle, Clock, Loader2, Ban, RefreshCw,
} from 'lucide-react';

import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import PartySelect from '@/components/ui/PartySelect';
import ItemSelect, { StockItem } from '@/components/ui/ItemSelect';
import { useToast } from '@/components/ui/Toast';
import { approvalMemosApi } from '@/lib/api';
import { useCompany } from '@/lib/company';
import { formatCurrency } from '@/lib/utils';
import { isoDate, today } from '@/lib/fiscal';
import { generateApprovalMemoPDF } from '@/lib/vectorPdfEngine';

type MemoStatus = 'Open' | 'Partially_Returned' | 'Closed' | 'Cancelled';

interface MemoRow {
  id: string;
  memo_no: string;
  memo_date: string;
  due_date: string;
  status: MemoStatus;
  party_id: string;
  party_name: string;
  party_city?: string;
  total_quantity: string | number;
  total_value: string | number;
  outstanding_quantity: string | number;
  outstanding_value: string | number;
  is_overdue: boolean;
  days_out: number;
}

interface MemoLine {
  id: string;
  sequence_no: number;
  material_id: string;
  material_code: string;
  material_name: string;
  description: string | null;
  hsn_code?: string | null;
  uom?: string | null;
  quantity: string | number;
  gross_weight: string | number | null;
  net_weight: string | number | null;
  rate: string | number;
  value: string | number;
  quantity_returned: string | number;
  quantity_invoiced: string | number;
  outstanding_quantity: string | number;
  outstanding_value: string | number;
  invoice_id: string | null;
  invoice_no?: string | null;
}

interface MemoDetail extends MemoRow {
  narration: string | null;
  fiscal_year: string;
  lines: MemoLine[];
  company: any;
  party_gstin?: string | null;
  party_address1?: string | null;
  party_city?: string;
  party_state_name?: string | null;
  party_phone?: string | null;
}

interface FormLine {
  key: number;
  material_id: string;
  code: string;
  name: string;
  unit: string;
  description: string;
  quantity: string;
  gross_weight: string;
  net_weight: string;
  rate: string;
}

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '0');
  return Number.isFinite(n) ? n : 0;
};

const fmtQty = (v: any) => num(v).toLocaleString('en-IN', { maximumFractionDigits: 4 });
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

const plusDays = (iso: string, days: number): string => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
};

const statusVariant = (s: MemoStatus): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
  switch (s) {
    case 'Open': return 'info';
    case 'Partially_Returned': return 'warning';
    case 'Closed': return 'success';
    case 'Cancelled': return 'danger';
    default: return 'default';
  }
};

const statusLabel = (s: MemoStatus) => s.replace('_', ' ');

const newLine = (key: number): FormLine => ({
  key, material_id: '', code: '', name: '', unit: '', description: '',
  quantity: '1', gross_weight: '', net_weight: '', rate: '',
});

const errorText = (err: any, fallback: string): string => {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: any) => x.msg || JSON.stringify(x)).join('; ');
  return err?.message || fallback;
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MemosPage() {
  const { showToast } = useToast();
  const { company } = useCompany();

  const [memos, setMemos] = useState<MemoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('live');
  const [partyFilter, setPartyFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [aging, setAging] = useState<any>(null);

  const [isNewOpen, setIsNewOpen] = useState(false);
  const [detail, setDetail] = useState<MemoDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState<'return' | 'convert' | null>(null);

  const fetchMemos = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: 200 };
      if (statusFilter && statusFilter !== 'all' && statusFilter !== 'live') params.status = statusFilter;
      if (partyFilter) params.party_id = partyFilter;
      if (overdueOnly) params.overdue = true;
      const res = await approvalMemosApi.list(params);
      let list: MemoRow[] = res.data?.memos || [];
      if (statusFilter === 'live') {
        list = list.filter((m) => m.status === 'Open' || m.status === 'Partially_Returned');
      }
      setMemos(list);
    } catch (err: any) {
      showToast('error', 'Could not load approval memos', errorText(err, 'Request failed'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, partyFilter, overdueOnly, showToast]);

  const fetchAging = useCallback(async () => {
    try {
      const res = await approvalMemosApi.aging();
      setAging(res.data);
    } catch {
      setAging(null);
    }
  }, []);

  useEffect(() => { fetchMemos(); }, [fetchMemos]);
  useEffect(() => { fetchAging(); }, [fetchAging]);

  const refreshAll = () => { fetchMemos(); fetchAging(); };

  const openDetail = async (row: { id: string }) => {
    setDetailLoading(true);
    try {
      const res = await approvalMemosApi.getById(row.id);
      setDetail(res.data);
    } catch (err: any) {
      showToast('error', 'Could not open memo', errorText(err, 'Request failed'));
    } finally {
      setDetailLoading(false);
    }
  };

  const reloadDetail = async () => {
    if (!detail) return;
    await openDetail({ id: detail.id });
  };

  const printMemo = (memo: MemoDetail, mode: 'download' | 'print') => {
    if (!memo.lines || memo.lines.length === 0) {
      showToast('warning', 'Memo has no lines', 'Reopen the memo and try again.');
    }
    generateApprovalMemoPDF(memo, mode, memo.company || company);
  };

  const cancelMemo = async (memo: MemoDetail) => {
    const reason = window.prompt(`Cancel memo ${memo.memo_no}? All goods return to stock. Enter a reason:`, 'Issued in error');
    if (reason === null) return;
    try {
      await approvalMemosApi.cancel(memo.id, { reason: reason || 'Approval memo cancelled' });
      showToast('success', `Memo ${memo.memo_no} cancelled`, 'Stock has returned to the default location.');
      setDetail(null);
      refreshAll();
    } catch (err: any) {
      showToast('error', 'Cancellation refused', errorText(err, 'Request failed'));
    }
  };

  const columns = useMemo(() => [
    { header: 'Memo No', accessorKey: 'memo_no', cell: (m: MemoRow) => (
      <div className="flex items-center gap-2">
        <span className="font-medium text-white">{m.memo_no}</span>
        {m.is_overdue && <AlertTriangle className="w-4 h-4 text-danger" aria-label="Overdue" />}
      </div>
    ) },
    { header: 'Date', accessorKey: 'memo_date', cell: (m: MemoRow) => fmtDate(m.memo_date) },
    { header: 'Party', accessorKey: 'party_name', cell: (m: MemoRow) => (
      <div>
        <div className="text-white">{m.party_name}</div>
        {m.party_city && <div className="text-xs text-textSecondary">{m.party_city}</div>}
      </div>
    ) },
    { header: 'Due', accessorKey: 'due_date', cell: (m: MemoRow) => (
      <span className={m.is_overdue ? 'text-danger font-medium' : ''}>
        {fmtDate(m.due_date)}
        {m.is_overdue && <span className="block text-xs">{m.days_out} days out</span>}
      </span>
    ) },
    { header: 'Memo Value', accessorKey: 'total_value', cell: (m: MemoRow) => formatCurrency(num(m.total_value)) },
    { header: 'Still Out', accessorKey: 'outstanding_value', cell: (m: MemoRow) => (
      <div>
        <div className="text-primary font-medium">{formatCurrency(num(m.outstanding_value))}</div>
        <div className="text-xs text-textSecondary">{fmtQty(m.outstanding_quantity)} of {fmtQty(m.total_quantity)}</div>
      </div>
    ) },
    { header: 'Status', accessorKey: 'status', cell: (m: MemoRow) => (
      <Badge variant={statusVariant(m.status)}>{statusLabel(m.status)}</Badge>
    ) },
    { header: 'Actions', accessorKey: 'actions', cell: (m: MemoRow) => (
      <div className="flex gap-2 items-center">
        <button
          onClick={(e) => { e.stopPropagation(); openDetail(m); }}
          className="p-1 text-textSecondary hover:text-white transition-colors"
          title="Open memo"
        >
          <FileText className="w-4 h-4" />
        </button>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            try {
              const res = await approvalMemosApi.getById(m.id);
              generateApprovalMemoPDF(res.data, 'print', res.data.company || company);
            } catch (err: any) {
              showToast('error', 'Could not print memo', errorText(err, 'Request failed'));
            }
          }}
          className="p-1 text-textSecondary hover:text-white transition-colors"
          title="Print memo"
        >
          <Printer className="w-4 h-4" />
        </button>
      </div>
    ) },
  ], [company, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const overdueCount = memos.filter((m) => m.is_overdue).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Approval Memos (Jangad)</h1>
          <p className="text-textSecondary mt-1">
            Goods sent on approval. Not a supply, no GST; title passes only when a tax invoice is raised.
          </p>
        </div>
        <button
          onClick={() => setIsNewOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(212,168,67,0.3)]"
        >
          <Plus className="w-4 h-4" /> New Memo
        </button>
      </div>

      <AgingCard aging={aging} overdueCount={overdueCount} onRefresh={fetchAging} />

      {/* Filters */}
      <div className="glass-card p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="space-y-1">
          <label className="text-xs text-textSecondary font-medium">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none"
          >
            <option value="live">Out on approval (Open + Partial)</option>
            <option value="Open">Open</option>
            <option value="Partially_Returned">Partially Returned</option>
            <option value="Closed">Closed</option>
            <option value="Cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary font-medium">Party</label>
          <PartySelect placeholder="All parties" value={partyFilter} onChange={(id) => setPartyFilter(id)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-white cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
            className="accent-primary w-4 h-4"
          />
          Overdue only
        </label>
        <button
          onClick={refreshAll}
          className="flex items-center justify-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-white hover:border-white/30 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="glass-card p-6">
        {loading ? (
          <div className="animate-pulse flex flex-col space-y-4">
            <div className="h-10 bg-surface rounded w-full"></div>
            <div className="h-10 bg-surface rounded w-full"></div>
            <div className="h-10 bg-surface rounded w-full"></div>
          </div>
        ) : memos.length === 0 ? (
          <div className="text-center py-12 text-textSecondary space-y-2">
            <ClipboardList className="w-10 h-10 mx-auto text-primary/60" />
            <p className="text-base font-semibold text-white">No approval memos match these filters</p>
            <p className="text-xs">Issue one with &quot;New Memo&quot; when goods go out on jangad.</p>
          </div>
        ) : (
          <DataTable columns={columns} data={memos} onRowClick={(m) => openDetail(m)} />
        )}
      </div>

      <Modal isOpen={isNewOpen} onClose={() => setIsNewOpen(false)} title="Issue Approval Memo (Jangad)">
        <NewMemoForm
          onSuccess={(memoNo) => {
            setIsNewOpen(false);
            showToast('success', `Memo ${memoNo} issued`, 'Stock moved to Goods on Approval.');
            refreshAll();
          }}
        />
      </Modal>

      {(detail || detailLoading) && (
        <DetailPanel
          memo={detail}
          loading={detailLoading}
          onClose={() => { setDetail(null); setAction(null); }}
          onReturn={() => setAction('return')}
          onConvert={() => setAction('convert')}
          onCancel={() => detail && cancelMemo(detail)}
          onPrint={(mode) => detail && printMemo(detail, mode)}
        />
      )}

      {detail && action === 'return' && (
        <Modal isOpen onClose={() => setAction(null)} title={`Return goods — ${detail.memo_no}`}>
          <ReturnForm
            memo={detail}
            onDone={async (memoStatus) => {
              setAction(null);
              showToast('success', 'Return recorded', `Memo is now ${statusLabel(memoStatus)}.`);
              await reloadDetail();
              refreshAll();
            }}
          />
        </Modal>
      )}

      {detail && action === 'convert' && (
        <Modal isOpen onClose={() => setAction(null)} title={`Convert to tax invoice — ${detail.memo_no}`}>
          <ConvertForm
            memo={detail}
            onDone={async (invoiceNo, memoStatus) => {
              setAction(null);
              showToast('success', `Invoice ${invoiceNo} raised`, `Memo is now ${statusLabel(memoStatus)}.`);
              await reloadDetail();
              refreshAll();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

// ─── Aging card ──────────────────────────────────────────────────────────────

function AgingCard({ aging, overdueCount, onRefresh }: { aging: any; overdueCount: number; onRefresh: () => void }) {
  const labels: string[] = aging?.bucket_labels || ['0-15', '16-30', '31-60', '61+'];
  const overall = aging?.overall || {};
  const total = num(aging?.total_open_value);
  const tone = (label: string) =>
    label === '61+' ? 'text-danger' : label === '31-60' ? 'text-warning' : 'text-white';

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-textSecondary uppercase tracking-wider">Goods out on approval</p>
            <h4 className="text-2xl font-playfair font-semibold text-white">{formatCurrency(total)}</h4>
          </div>
        </div>
        <div className="text-right text-xs text-textSecondary">
          <div>{aging?.open_memos ?? 0} open memo{(aging?.open_memos ?? 0) === 1 ? '' : 's'}</div>
          {overdueCount > 0 && <div className="text-danger font-medium">{overdueCount} overdue in view</div>}
          <button onClick={onRefresh} className="mt-1 text-primary hover:text-white transition-colors">refresh</button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {labels.map((label) => (
          <div key={label} className="bg-surface/60 border border-border rounded-lg p-3">
            <div className="text-xs text-textSecondary">{label} days</div>
            <div className={`text-lg font-semibold ${tone(label)}`}>{formatCurrency(num(overall[label]))}</div>
          </div>
        ))}
      </div>
      {Array.isArray(aging?.parties) && aging.parties.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-textSecondary uppercase">
              <tr>
                <th className="text-left py-1 pr-3">Party</th>
                {labels.map((l) => <th key={l} className="text-right py-1 px-2">{l}</th>)}
                <th className="text-right py-1 pl-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {aging.parties.slice(0, 8).map((p: any) => (
                <tr key={p.party_id} className="border-t border-border/40">
                  <td className="py-1 pr-3 text-white">{p.party_name} <span className="text-textSecondary">({p.memos})</span></td>
                  {labels.map((l) => (
                    <td key={l} className={`text-right py-1 px-2 ${num(p.buckets?.[l]) > 0 ? tone(l) : 'text-textSecondary'}`}>
                      {num(p.buckets?.[l]) > 0 ? formatCurrency(num(p.buckets[l])) : '—'}
                    </td>
                  ))}
                  <td className="text-right py-1 pl-3 text-primary font-medium">{formatCurrency(num(p.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── New memo form ───────────────────────────────────────────────────────────

function NewMemoForm({ onSuccess }: { onSuccess: (memoNo: string) => void }) {
  const { showToast } = useToast();
  const [partyId, setPartyId] = useState('');
  const [memoDate, setMemoDate] = useState(today());
  const [dueDate, setDueDate] = useState(plusDays(today(), 15));
  const [dueTouched, setDueTouched] = useState(false);
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<FormLine[]>([newLine(1)]);
  const [submitting, setSubmitting] = useState(false);

  // Due date follows the memo date (+15 days) until the user sets it by hand.
  useEffect(() => {
    if (!dueTouched) setDueDate(plusDays(memoDate, 15));
  }, [memoDate, dueTouched]);

  const update = (key: number, patch: Partial<FormLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const onItem = (key: number, item?: StockItem) => {
    if (!item) {
      update(key, { material_id: '', code: '', name: '', unit: '' });
      return;
    }
    update(key, {
      material_id: item.id, code: item.code, name: item.name, unit: item.unit,
    });
  };

  const lineValue = (l: FormLine) => num(l.quantity) * num(l.rate);
  const totalQty = lines.reduce((s, l) => s + num(l.quantity), 0);
  const totalValue = lines.reduce((s, l) => s + lineValue(l), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyId) { showToast('warning', 'Select the party the goods are going to'); return; }
    const bad = lines.find((l) => !l.material_id || num(l.quantity) <= 0);
    if (bad) { showToast('warning', 'Every line needs an item and a positive quantity'); return; }
    const netOverGross = lines.find((l) => l.gross_weight && l.net_weight && num(l.net_weight) > num(l.gross_weight));
    if (netOverGross) { showToast('warning', 'Net weight cannot exceed gross weight'); return; }

    setSubmitting(true);
    try {
      const res = await approvalMemosApi.create({
        party_id: partyId,
        memo_date: memoDate,
        due_date: dueDate,
        narration: narration || null,
        lines: lines.map((l) => ({
          material_id: l.material_id,
          description: l.description || l.name || null,
          quantity: l.quantity,
          gross_weight: l.gross_weight === '' ? null : l.gross_weight,
          net_weight: l.net_weight === '' ? null : l.net_weight,
          rate: l.rate === '' ? '0' : l.rate,
        })),
        reason: 'Approval memo issued from UI',
      });
      onSuccess(res.data?.memo_no || '');
    } catch (err: any) {
      showToast('error', 'Memo not issued', errorText(err, 'Request failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none';

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-3 space-y-1">
          <label className="text-xs text-textSecondary">Party (customer / dealer) *</label>
          <PartySelect value={partyId} onChange={(id) => setPartyId(id)} placeholder="Search party..." />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Memo date *</label>
          <input type="date" value={memoDate} onChange={(e) => setMemoDate(e.target.value)} className={inputCls} required />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Due back by * <span className="text-textSecondary/70">(default +15 days)</span></label>
          <input
            type="date" value={dueDate} min={memoDate}
            onChange={(e) => { setDueTouched(true); setDueDate(e.target.value); }}
            className={inputCls} required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Narration</label>
          <input type="text" value={narration} onChange={(e) => setNarration(e.target.value)} className={inputCls} placeholder="Sent with Ramesh; select for Diwali order" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-playfair font-medium text-white">Goods going out</h4>
          <button
            type="button"
            onClick={() => setLines((ls) => [...ls, newLine((ls[ls.length - 1]?.key || 0) + 1)])}
            className="text-xs text-primary flex items-center gap-1 hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4" /> Add line
          </button>
        </div>

        <div className="bg-surface/50 border border-border rounded-xl overflow-hidden">
          {lines.map((l, idx) => (
            <div key={l.key} className={`p-4 space-y-3 ${idx !== lines.length - 1 ? 'border-b border-border' : ''}`}>
              <div className="flex gap-3 items-start">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-textSecondary">Item *</label>
                  <ItemSelect value={l.material_id} onChange={(_, item) => onItem(l.key, item)} placeholder="Type code or name..." />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-textSecondary">Description</label>
                  <input type="text" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} className={`${inputCls} h-[38px]`} placeholder={l.name || 'Lot / piece description'} />
                </div>
                <div className="pt-6">
                  <button
                    type="button"
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
                    className="text-textSecondary hover:text-danger transition-colors p-1"
                    title="Remove line"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-textSecondary">Qty {l.unit && <span>({l.unit})</span>} *</label>
                  <input type="number" step="any" min="0" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} className={inputCls} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-textSecondary">Gross wt (g)</label>
                  <input type="number" step="any" min="0" value={l.gross_weight} onChange={(e) => update(l.key, { gross_weight: e.target.value })} className={inputCls} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-textSecondary">Net wt (g)</label>
                  <input type="number" step="any" min="0" value={l.net_weight} onChange={(e) => update(l.key, { net_weight: e.target.value })} className={inputCls} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-textSecondary">Rate (₹)</label>
                  <input type="number" step="any" min="0" value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value })} className={inputCls} placeholder="0.00" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-textSecondary">Value</label>
                  <div className="px-3 py-2 text-sm text-primary font-medium border border-border/50 rounded-lg bg-white/5">{formatCurrency(lineValue(l))}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-8 text-sm">
          <div className="text-textSecondary">Total qty: <span className="text-white font-medium">{fmtQty(totalQty)}</span></div>
          <div className="text-textSecondary">Memo value: <span className="text-primary font-semibold">{formatCurrency(totalValue)}</span></div>
        </div>
      </div>

      <p className="text-xs text-textSecondary border-l-2 border-primary/40 pl-3">
        Stock moves from the default location to &quot;Goods on Approval&quot;. No GST and no journal entry: a jangad is not a supply.
      </p>

      <div className="flex justify-end">
        <button
          type="submit" disabled={submitting}
          className="flex items-center gap-2 px-5 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Issue Memo
        </button>
      </div>
    </form>
  );
}

// ─── Detail panel ────────────────────────────────────────────────────────────

function DetailPanel({
  memo, loading, onClose, onReturn, onConvert, onCancel, onPrint,
}: {
  memo: MemoDetail | null;
  loading: boolean;
  onClose: () => void;
  onReturn: () => void;
  onConvert: () => void;
  onCancel: () => void;
  onPrint: (mode: 'download' | 'print') => void;
}) {
  const live = memo ? memo.status === 'Open' || memo.status === 'Partially_Returned' : false;
  const anyOutstanding = memo ? memo.lines.some((l) => num(l.outstanding_quantity) > 0) : false;
  const untouched = memo ? memo.lines.every((l) => num(l.quantity_returned) === 0 && num(l.quantity_invoiced) === 0) : false;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <aside className="relative z-50 w-full max-w-3xl h-full bg-surface border-l border-border overflow-y-auto shadow-2xl">
        {loading || !memo ? (
          <div className="p-10 flex items-center gap-3 text-textSecondary"><Loader2 className="w-5 h-5 animate-spin text-primary" /> Loading memo...</div>
        ) : (
          <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-playfair font-bold text-white">{memo.memo_no}</h2>
                  <Badge variant={statusVariant(memo.status)}>{statusLabel(memo.status)}</Badge>
                  {memo.is_overdue && <Badge variant="danger">Overdue {memo.days_out}d</Badge>}
                </div>
                <p className="text-textSecondary text-sm mt-1">
                  {memo.party_name}{memo.party_city ? `, ${memo.party_city}` : ''} · GSTIN {memo.party_gstin || 'Unregistered'}
                </p>
              </div>
              <button onClick={onClose} className="text-textSecondary hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Info label="Memo date" value={fmtDate(memo.memo_date)} />
              <Info label="Due back" value={fmtDate(memo.due_date)} danger={memo.is_overdue} />
              <Info label="Memo value" value={formatCurrency(num(memo.total_value))} />
              <Info label="Still out" value={formatCurrency(num(memo.outstanding_value))} highlight />
            </div>
            {memo.narration && <p className="text-sm text-textSecondary italic">{memo.narration}</p>}

            <div className="overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-sm">
                <thead className="text-xs text-textSecondary uppercase bg-background">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Gross / Net</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Value</th>
                    <th className="px-3 py-2 text-right">Returned</th>
                    <th className="px-3 py-2 text-right">Invoiced</th>
                    <th className="px-3 py-2 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {memo.lines.map((l) => (
                    <tr key={l.id} className="border-t border-border/50">
                      <td className="px-3 py-2 text-textSecondary">{l.sequence_no}</td>
                      <td className="px-3 py-2">
                        <div className="text-white">{l.description || l.material_name}</div>
                        <div className="text-xs text-textSecondary font-mono">{l.material_code}{l.hsn_code ? ` · HSN ${l.hsn_code}` : ''}</div>
                        {l.invoice_no && <div className="text-xs text-success">Invoice {l.invoice_no}</div>}
                      </td>
                      <td className="px-3 py-2 text-right text-white">{fmtQty(l.quantity)} {l.uom || ''}</td>
                      <td className="px-3 py-2 text-right text-textSecondary">{l.gross_weight != null ? num(l.gross_weight).toFixed(3) : '—'} / {l.net_weight != null ? num(l.net_weight).toFixed(3) : '—'}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(num(l.rate))}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(num(l.value))}</td>
                      <td className="px-3 py-2 text-right text-textSecondary">{fmtQty(l.quantity_returned)}</td>
                      <td className="px-3 py-2 text-right text-textSecondary">{fmtQty(l.quantity_invoiced)}</td>
                      <td className={`px-3 py-2 text-right font-medium ${num(l.outstanding_quantity) > 0 ? 'text-primary' : 'text-success'}`}>{fmtQty(l.outstanding_quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
              <button onClick={() => onPrint('print')} className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm text-white hover:border-primary transition-colors">
                <Printer className="w-4 h-4" /> Print memo
              </button>
              <button onClick={() => onPrint('download')} className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm text-white hover:border-primary transition-colors">
                <Download className="w-4 h-4" /> Download PDF
              </button>
              {live && anyOutstanding && (
                <>
                  <button onClick={onReturn} className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg text-sm text-white hover:bg-white/20 transition-colors">
                    <RotateCcw className="w-4 h-4" /> Return
                  </button>
                  <button onClick={onConvert} className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity">
                    <FileText className="w-4 h-4" /> Convert to invoice
                  </button>
                </>
              )}
              {memo.status === 'Open' && untouched && (
                <button onClick={onCancel} className="ml-auto flex items-center gap-2 px-4 py-2 border border-danger/40 text-danger rounded-lg text-sm hover:bg-danger/10 transition-colors">
                  <Ban className="w-4 h-4" /> Cancel memo
                </button>
              )}
            </div>
            <p className="text-xs text-textSecondary">Goods sent on approval only. Title does not pass until invoiced.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function Info({ label, value, highlight, danger }: { label: string; value: string; highlight?: boolean; danger?: boolean }) {
  return (
    <div className="bg-background/60 border border-border rounded-lg p-3">
      <div className="text-xs text-textSecondary">{label}</div>
      <div className={`font-medium ${danger ? 'text-danger' : highlight ? 'text-primary' : 'text-white'}`}>{value}</div>
    </div>
  );
}

// ─── Return form ─────────────────────────────────────────────────────────────

function ReturnForm({ memo, onDone }: { memo: MemoDetail; onDone: (memoStatus: MemoStatus) => void }) {
  const { showToast } = useToast();
  const open = memo.lines.filter((l) => num(l.outstanding_quantity) > 0);
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(open.map((l) => [l.id, String(num(l.outstanding_quantity))]))
  );
  const [returnDate, setReturnDate] = useState(today());
  const [reason, setReason] = useState('Goods returned by party');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = open
      .map((l) => ({ line_id: l.id, quantity: qty[l.id] }))
      .filter((x) => num(x.quantity) > 0);
    if (lines.length === 0) { showToast('warning', 'Enter a quantity on at least one line'); return; }
    const over = open.find((l) => num(qty[l.id]) > num(l.outstanding_quantity));
    if (over) { showToast('warning', `Line ${over.sequence_no}: only ${fmtQty(over.outstanding_quantity)} is out`); return; }
    setSubmitting(true);
    try {
      const res = await approvalMemosApi.returnGoods(memo.id, { lines, return_date: returnDate, reason });
      onDone(res.data?.memo_status || 'Open');
    } catch (err: any) {
      showToast('error', 'Return refused', errorText(err, 'Request failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none';

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Return date</label>
          <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Reason</label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-textSecondary uppercase bg-background">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2 text-right w-40">Returning</th>
            </tr>
          </thead>
          <tbody>
            {open.map((l) => (
              <tr key={l.id} className="border-t border-border/50">
                <td className="px-3 py-2">
                  <div className="text-white">{l.description || l.material_name}</div>
                  <div className="text-xs text-textSecondary font-mono">{l.material_code}</div>
                </td>
                <td className="px-3 py-2 text-right text-primary">{fmtQty(l.outstanding_quantity)} {l.uom || ''}</td>
                <td className="px-3 py-2">
                  <input
                    type="number" step="any" min="0" max={num(l.outstanding_quantity)}
                    value={qty[l.id] ?? ''}
                    onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                    className={`${inputCls} text-right`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-textSecondary">Returned goods move from &quot;Goods on Approval&quot; back to the default stock location.</p>
      <div className="flex justify-end">
        <button type="submit" disabled={submitting} className="flex items-center gap-2 px-5 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 disabled:opacity-50">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Record return
        </button>
      </div>
    </form>
  );
}

// ─── Convert form ────────────────────────────────────────────────────────────

interface ConvertRow { quantity: string; material_value: string; making_charges: string; discount_pct: string }

function ConvertForm({ memo, onDone }: { memo: MemoDetail; onDone: (invoiceNo: string, memoStatus: MemoStatus) => void }) {
  const { showToast } = useToast();
  const open = memo.lines.filter((l) => num(l.outstanding_quantity) > 0);
  const [rows, setRows] = useState<Record<string, ConvertRow>>(() =>
    Object.fromEntries(open.map((l) => [l.id, {
      quantity: String(num(l.outstanding_quantity)),
      // Default the sale value to the memo rate for the quantity kept.
      material_value: (num(l.outstanding_quantity) * num(l.rate)).toFixed(2),
      making_charges: '0',
      discount_pct: '0',
    }]))
  );
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const patch = (id: string, p: Partial<ConvertRow>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...p } }));

  const onQty = (l: MemoLine, q: string) => {
    // Re-price material at the memo rate when the quantity changes.
    patch(l.id, { quantity: q, material_value: (num(q) * num(l.rate)).toFixed(2) });
  };

  const totals = open.reduce((acc, l) => {
    const r = rows[l.id];
    if (!r || num(r.quantity) <= 0) return acc;
    const disc = 1 - num(r.discount_pct) / 100;
    acc.material += num(r.material_value) * disc;
    acc.making += num(r.making_charges) * disc;
    return acc;
  }, { material: 0, making: 0 });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = open
      .map((l) => ({ line_id: l.id, ...rows[l.id] }))
      .filter((x) => num(x.quantity) > 0);
    if (lines.length === 0) { showToast('warning', 'Enter a quantity on at least one line'); return; }
    const over = open.find((l) => num(rows[l.id]?.quantity) > num(l.outstanding_quantity));
    if (over) { showToast('warning', `Line ${over.sequence_no}: only ${fmtQty(over.outstanding_quantity)} is out`); return; }
    setSubmitting(true);
    try {
      const res = await approvalMemosApi.convert(memo.id, {
        lines: lines.map((x) => ({
          line_id: x.line_id,
          quantity: x.quantity,
          material_value: x.material_value || '0',
          making_charges: x.making_charges || '0',
          discount_pct: x.discount_pct || '0',
        })),
        invoice_date: invoiceDate,
        place_of_supply: placeOfSupply || null,
        reason: `Approval memo ${memo.memo_no} converted to sales invoice`,
      });
      onDone(res.data?.invoice_no || '', res.data?.memo_status || 'Open');
    } catch (err: any) {
      showToast('error', 'Invoice not raised', errorText(err, 'Request failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-white focus:border-primary outline-none text-right';

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Invoice date *</label>
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Place of supply (state code, optional)</label>
          <input type="text" maxLength={2} value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} placeholder="Party's registered state if blank" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none" />
        </div>
      </div>
      <div className="border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-textSecondary uppercase bg-background">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-right">Out</th>
              <th className="px-3 py-2 text-right w-24">Keep qty</th>
              <th className="px-3 py-2 text-right w-32">Material ₹</th>
              <th className="px-3 py-2 text-right w-28">Making ₹</th>
              <th className="px-3 py-2 text-right w-20">Disc %</th>
            </tr>
          </thead>
          <tbody>
            {open.map((l) => {
              const r = rows[l.id];
              return (
                <tr key={l.id} className="border-t border-border/50">
                  <td className="px-3 py-2">
                    <div className="text-white">{l.description || l.material_name}</div>
                    <div className="text-xs text-textSecondary font-mono">{l.material_code} · memo rate {formatCurrency(num(l.rate))}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-primary">{fmtQty(l.outstanding_quantity)}</td>
                  <td className="px-2 py-2"><input type="number" step="any" min="0" max={num(l.outstanding_quantity)} value={r.quantity} onChange={(e) => onQty(l, e.target.value)} className={inputCls} /></td>
                  <td className="px-2 py-2"><input type="number" step="any" min="0" value={r.material_value} onChange={(e) => patch(l.id, { material_value: e.target.value })} className={inputCls} /></td>
                  <td className="px-2 py-2"><input type="number" step="any" min="0" value={r.making_charges} onChange={(e) => patch(l.id, { making_charges: e.target.value })} className={inputCls} /></td>
                  <td className="px-2 py-2"><input type="number" step="any" min="0" max="100" value={r.discount_pct} onChange={(e) => patch(l.id, { discount_pct: e.target.value })} className={inputCls} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-8 text-sm">
        <div className="text-textSecondary">Taxable material: <span className="text-white font-medium">{formatCurrency(totals.material)}</span></div>
        <div className="text-textSecondary">Taxable making: <span className="text-white font-medium">{formatCurrency(totals.making)}</span></div>
      </div>
      <p className="text-xs text-textSecondary">
        The kept quantity moves back to the default location and a tax invoice is raised through the sales register: GST at the item&apos;s rate on material and 5% on making, COGS and the journal all post as for a counter sale. The rest stays out on approval.
      </p>
      <div className="flex justify-end">
        <button type="submit" disabled={submitting} className="flex items-center gap-2 px-5 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 disabled:opacity-50">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Raise tax invoice
        </button>
      </div>
    </form>
  );
}
