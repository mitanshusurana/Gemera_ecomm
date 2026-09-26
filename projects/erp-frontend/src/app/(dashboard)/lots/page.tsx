"use client";

/**
 * Loose gemstone lots and parcels.
 *
 * A lot is so many carats of one material with a sieve size, shape, colour
 * and clarity, bought at a price per carat. It is split into parcels for a
 * setting job or a sale, parcels are merged back, and a re-weighing books the
 * loss. Carats move through the stock ledger tagged with the lot, so the
 * balance shown here is the ledger's, not a stored figure.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Scissors, Merge, Scale, Printer, X, Loader2, ChevronRight, ChevronDown, Package, RefreshCw, Filter,
} from 'lucide-react';

import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ItemSelect, { StockItem } from '@/components/ui/ItemSelect';
import { lotsApi, locationsApi, LotRow, StockLocation } from '@/lib/api';
import { useCompany } from '@/lib/company';
import { formatCurrency } from '@/lib/utils';

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '0');
  return Number.isFinite(n) ? n : 0;
};
const ct = (v: any) => `${num(v).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ct`;

const statusVariant = (s: LotRow['status']): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
  switch (s) {
    case 'Open': return 'success';
    case 'Split': return 'info';
    case 'Merged': return 'info';
    case 'Sold': return 'warning';
    case 'Closed': return 'default';
    default: return 'default';
  }
};

const errText = (err: any, fallback: string) => {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: any) => x.msg || JSON.stringify(x)).join('\n');
  return fallback;
};

const fieldCls = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none';

interface SplitChildForm { key: number; carat_weight: string; piece_count: string; sieve_size: string; }

export default function LotsPage() {
  const { company } = useCompany();
  const [lots, setLots] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [materialFilter, setMaterialFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [locations, setLocations] = useState<StockLocation[]>([]);

  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [splitFor, setSplitFor] = useState<LotRow | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [adjustFor, setAdjustFor] = useState<LotRow | null>(null);
  const [labelFor, setLabelFor] = useState<LotRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await lotsApi.list({
        material_id: materialFilter || undefined,
        status: statusFilter || undefined,
        q: query || undefined,
        limit: 500,
      });
      setLots(res.data?.lots || []);
    } catch (err) {
      console.error('Lots fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [materialFilter, statusFilter, query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    locationsApi.list().then((r) => setLocations(r.data?.locations || [])).catch(() => setLocations([]));
  }, []);

  // Tree: roots are lots with no parent in the loaded set; children under them.
  const byParent = useMemo(() => {
    const m: Record<string, LotRow[]> = {};
    const ids = new Set(lots.map((l) => l.id));
    lots.forEach((l) => {
      const key = l.parent_lot_id && ids.has(l.parent_lot_id) ? l.parent_lot_id : '';
      (m[key] ||= []).push(l);
    });
    return m;
  }, [lots]);
  const roots = byParent[''] || [];

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail({ id });
    try {
      const res = await lotsApi.getById(id);
      setDetail(res.data);
    } catch (err) {
      setDetail(null);
      alert(errText(err, 'Could not load the lot'));
    } finally {
      setDetailLoading(false);
    }
  };

  const selectedLots = lots.filter((l) => selected[l.id]);
  const mergeable = selectedLots.length >= 2
    && selectedLots.every((l) => l.status === 'Open')
    && new Set(selectedLots.map((l) => l.material_id)).size === 1;

  const totals = useMemo(() => {
    const open = lots.filter((l) => l.status === 'Open');
    return {
      open: open.length,
      carats: open.reduce((s, l) => s + num(l.balance_carats), 0),
      value: open.reduce((s, l) => s + num(l.balance_carats) * num(l.cost_per_carat), 0),
    };
  }, [lots]);

  // ─── Row ─────────────────────────────────────────────────────────────────
  const renderRow = (lot: LotRow, depth: number): JSX.Element => {
    const kids = byParent[lot.id] || [];
    const isOpen = expanded[lot.id] ?? depth === 0;
    return (
      <>
        <tr key={lot.id} className="hover:bg-white/5 transition-colors">
          <td className="py-2.5 pl-2">
            <input
              type="checkbox"
              disabled={lot.status !== 'Open'}
              checked={!!selected[lot.id]}
              onChange={(e) => setSelected({ ...selected, [lot.id]: e.target.checked })}
              className="accent-primary disabled:opacity-30"
            />
          </td>
          <td className="py-2.5 font-mono text-primary font-medium" style={{ paddingLeft: `${depth * 18}px` }}>
            <span className="inline-flex items-center gap-1">
              {kids.length > 0 ? (
                <button type="button" onClick={() => setExpanded({ ...expanded, [lot.id]: !isOpen })} className="text-textSecondary hover:text-white">
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              ) : <span className="w-3.5 inline-block" />}
              <button type="button" onClick={() => openDetail(lot.id)} className="hover:underline">{lot.lot_no || '—'}</button>
            </span>
          </td>
          <td className="py-2.5 text-white">{lot.material_name}<span className="block text-[10px] text-textSecondary font-mono">{lot.material_code}</span></td>
          <td className="py-2.5 text-textSecondary text-xs">
            {[lot.sieve_size, lot.shape, lot.colour, lot.clarity].filter(Boolean).join(' · ') || '—'}
            {(lot.origin || lot.treatment) && <span className="block text-[10px]">{[lot.origin, lot.treatment].filter(Boolean).join(' · ')}</span>}
          </td>
          <td className="py-2.5 text-right font-mono text-white">{ct(lot.balance_carats)}</td>
          <td className="py-2.5 text-right font-mono text-textSecondary">{lot.piece_count ?? '—'}</td>
          <td className="py-2.5 text-right font-mono text-textSecondary">{lot.cost_per_carat != null ? formatCurrency(num(lot.cost_per_carat)) : '—'}</td>
          <td className="py-2.5 text-center"><Badge variant={statusVariant(lot.status)}>{lot.status}</Badge></td>
          <td className="py-2.5">
            <div className="flex items-center justify-end gap-1">
              {lot.status === 'Open' && (
                <>
                  <button type="button" title="Split into parcels" onClick={() => setSplitFor(lot)} className="p-1 text-textSecondary hover:text-primary"><Scissors className="w-4 h-4" /></button>
                  <button type="button" title="Re-weigh / record loss" onClick={() => setAdjustFor(lot)} className="p-1 text-textSecondary hover:text-primary"><Scale className="w-4 h-4" /></button>
                </>
              )}
              <button type="button" title="Print lot label" onClick={() => setLabelFor(lot)} className="p-1 text-textSecondary hover:text-white"><Printer className="w-4 h-4" /></button>
            </div>
          </td>
        </tr>
        {isOpen && kids.map((k) => renderRow(k, depth + 1))}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Gemstone Lots</h1>
          <p className="text-textSecondary mt-1">[CGST Rule 56(2)] Carat lots and parcels: split, merge, re-weigh. Balances come from the stock ledger.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!mergeable}
            onClick={() => setMergeOpen(true)}
            className="flex items-center gap-2 px-4 py-2 border border-primary/40 text-primary rounded-lg hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
            title={mergeable ? 'Merge the selected lots' : 'Select two or more open lots of one material'}
          >
            <Merge className="w-4 h-4" /> Merge {selectedLots.length > 0 ? `(${selectedLots.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> New Lot
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4"><p className="text-xs text-textSecondary">Open lots</p><p className="text-2xl font-bold text-white">{totals.open}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-textSecondary">Carats on hand (open lots)</p><p className="text-2xl font-bold text-white font-mono">{ct(totals.carats)}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-textSecondary">Value at cost</p><p className="text-2xl font-bold text-primary font-mono">{formatCurrency(totals.value)}</p></div>
      </div>

      <div className="glass-card p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs text-textSecondary font-medium flex items-center gap-1"><Filter className="w-3.5 h-3.5 text-primary" /> Material</label>
          <ItemSelect value={materialFilter} onChange={(id) => setMaterialFilter(id)} placeholder="All materials" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary font-medium">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={fieldCls}>
            <option value="">All</option>
            {['Open', 'Split', 'Merged', 'Sold', 'Closed'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary font-medium">Search</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} className={fieldCls} placeholder="Lot no, sieve, material…" />
        </div>
      </div>

      <div className="glass-card p-4 overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-textSecondary flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin text-primary" /> Loading lots…</div>
        ) : lots.length === 0 ? (
          <div className="py-16 text-center text-textSecondary space-y-2">
            <Package className="w-8 h-8 mx-auto text-primary/60" />
            <p className="text-white font-semibold">No lots yet</p>
            <p className="text-xs">Open one from opening stock or tag carats already received on a purchase.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-textSecondary text-xs uppercase">
                <th className="pb-3 pl-2 w-8"></th>
                <th className="pb-3 font-medium">Lot</th>
                <th className="pb-3 font-medium">Material</th>
                <th className="pb-3 font-medium">Stone</th>
                <th className="pb-3 font-medium text-right">Balance</th>
                <th className="pb-3 font-medium text-right">Pcs</th>
                <th className="pb-3 font-medium text-right">Cost / ct</th>
                <th className="pb-3 font-medium text-center">Status</th>
                <th className="pb-3 font-medium text-right pr-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roots.map((r) => renderRow(r, 0))}
            </tbody>
          </table>
        )}
      </div>

      {createOpen && (
        <CreateLotModal
          locations={locations}
          onClose={() => setCreateOpen(false)}
          onDone={() => { setCreateOpen(false); load(); }}
        />
      )}

      {splitFor && (
        <SplitLotModal
          lot={splitFor}
          busy={busy}
          onClose={() => setSplitFor(null)}
          onSubmit={async (children, reason) => {
            setBusy(true);
            try {
              const res = await lotsApi.split(splitFor.id, { children, reason });
              const loss = num(res.data?.loss_carats);
              alert(`Split ${splitFor.lot_no} into ${res.data?.children?.length} parcel(s)${loss > 0 ? `; ${ct(loss)} lost` : ''}.`);
              setSplitFor(null);
              setExpanded({ ...expanded, [splitFor.id]: true });
              load();
            } catch (err) {
              alert(errText(err, 'Split failed'));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {mergeOpen && (
        <MergeLotsModal
          lots={selectedLots}
          busy={busy}
          onClose={() => setMergeOpen(false)}
          onSubmit={async (lot_no, reason) => {
            setBusy(true);
            try {
              const res = await lotsApi.merge({ lot_ids: selectedLots.map((l) => l.id), lot_no: lot_no || undefined, reason });
              alert(`Merged into ${res.data?.lot_no}: ${ct(res.data?.carat_weight)}.`);
              setMergeOpen(false);
              setSelected({});
              load();
            } catch (err) {
              alert(errText(err, 'Merge failed'));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {adjustFor && (
        <AdjustLotModal
          lot={adjustFor}
          busy={busy}
          onClose={() => setAdjustFor(null)}
          onSubmit={async (carat_weight, reason) => {
            setBusy(true);
            try {
              const res = await lotsApi.adjust(adjustFor.id, { carat_weight, reason });
              alert(res.data?.status === 'unchanged' ? 'No change in weight.' : `${adjustFor.lot_no}: ${ct(res.data?.previous_carats)} → ${ct(res.data?.carat_weight)} (${num(res.data?.delta_carats) > 0 ? '+' : ''}${num(res.data?.delta_carats).toFixed(3)} ct).`);
              setAdjustFor(null);
              load();
            } catch (err) {
              alert(errText(err, 'Adjustment failed'));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {labelFor && <LotLabel lot={labelFor} companyName={company?.legal_name || company?.trade_name || company?.name || ''} onClose={() => setLabelFor(null)} />}

      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-surface border-l border-border h-full p-6 overflow-y-auto space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-xl font-playfair font-bold text-white font-mono">{detail.lot_no || 'Lot'}</h2>
                {detail.material_name && <p className="text-xs text-textSecondary">{detail.material_name} · {detail.material_code}</p>}
              </div>
              <button onClick={() => setDetail(null)} className="text-textSecondary hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            {detailLoading ? (
              <div className="py-12 text-center text-textSecondary">Loading…</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    ['Status', detail.status],
                    ['Balance', ct(detail.balance_carats)],
                    ['Opened with', ct(detail.carat_weight)],
                    ['Pieces', detail.piece_count ?? '—'],
                    ['Sieve', detail.sieve_size || '—'],
                    ['Shape', detail.shape || '—'],
                    ['Colour', detail.colour || '—'],
                    ['Clarity', detail.clarity || '—'],
                    ['Origin', detail.origin || '—'],
                    ['Treatment', detail.treatment || '—'],
                    ['Cost / ct', detail.cost_per_carat != null ? formatCurrency(num(detail.cost_per_carat)) : '—'],
                    ['Location', detail.location_code ? `${detail.location_code} — ${detail.location_name}` : '—'],
                    ['Parent lot', detail.parent_lot_no || '—'],
                    ['Certificate', detail.certificate_no || '—'],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="p-2 bg-background border border-border rounded-lg">
                      <p className="text-textSecondary">{k}</p>
                      <p className="text-white font-medium">{String(v)}</p>
                    </div>
                  ))}
                </div>
                {detail.children?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-2">Parcels split from this lot</h3>
                    <ul className="space-y-1 text-xs">
                      {detail.children.map((c: any) => (
                        <li key={c.id} className="flex justify-between p-2 bg-background border border-border rounded-lg">
                          <button type="button" onClick={() => openDetail(c.id)} className="font-mono text-primary hover:underline">{c.lot_no}</button>
                          <span className="text-white font-mono">{ct(c.balance_carats)}</span>
                          <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">Carat movements</h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-textSecondary uppercase border-b border-border">
                        <th className="pb-1 text-left">Date</th><th className="pb-1 text-left">Type</th><th className="pb-1 text-left">Ref</th>
                        <th className="pb-1 text-right">In</th><th className="pb-1 text-right">Out</th><th className="pb-1 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono">
                      {(detail.movements || []).map((m: any) => (
                        <tr key={m.id}>
                          <td className="py-1.5 text-white">{m.entry_date}</td>
                          <td className="py-1.5 text-textSecondary">{m.transaction_type}</td>
                          <td className="py-1.5 text-textSecondary">{m.source_document_no || '—'}{m.remarks ? <span className="block text-[10px]">{m.remarks}</span> : null}</td>
                          <td className="py-1.5 text-right text-emerald-400">{m.direction === 'I' ? num(m.quantity).toFixed(3) : ''}</td>
                          <td className="py-1.5 text-right text-red-400">{m.direction === 'O' ? num(m.quantity).toFixed(3) : ''}</td>
                          <td className="py-1.5 text-right text-white">{num(m.running_balance).toFixed(3)}</td>
                        </tr>
                      ))}
                      {(detail.movements || []).length === 0 && <tr><td colSpan={6} className="py-4 text-center text-textSecondary">No movements.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create ──────────────────────────────────────────────────────────────────

function CreateLotModal({ locations, onClose, onDone }: { locations: StockLocation[]; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const [material, setMaterial] = useState<StockItem | null>(null);
  const [form, setForm] = useState({
    carat_weight: '', piece_count: '', sieve_size: '', shape: '', colour: '', clarity: '', origin: '', treatment: '',
    cost_per_carat: '', certificate_no: '', lot_no: '', location_id: '', source: 'opening', remarks: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!material) { alert('Select the material'); return; }
    if (!(num(form.carat_weight) > 0)) { alert('Enter the carat weight'); return; }
    setSaving(true);
    try {
      await lotsApi.create({
        material_id: material.id,
        carat_weight: form.carat_weight,
        piece_count: form.piece_count ? Number(form.piece_count) : undefined,
        sieve_size: form.sieve_size || undefined,
        shape: form.shape || undefined,
        colour: form.colour || undefined,
        clarity: form.clarity || undefined,
        origin: form.origin || undefined,
        treatment: form.treatment || undefined,
        cost_per_carat: form.cost_per_carat || undefined,
        certificate_no: form.certificate_no || undefined,
        lot_no: form.lot_no || undefined,
        location_id: form.location_id || undefined,
        source: form.source,
        remarks: form.remarks || undefined,
        reason: form.source === 'purchase' ? 'Lot tagged from purchased carats' : 'Lot opened from opening stock',
      });
      onDone();
    } catch (err) {
      alert(errText(err, 'Could not create the lot'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="New gemstone lot">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Material (carat item) *</label>
          <ItemSelect onChange={(_, item) => setMaterial(item || null)} placeholder="Emerald, ruby, sapphire, diamond…" />
          {material && material.unit !== 'ct' && <p className="text-[11px] text-amber-400">This item is kept in {material.unit}; lots are counted in carats.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Carats *</label>
            <input type="number" step="0.001" min="0" value={form.carat_weight} onChange={(e) => set('carat_weight', e.target.value)} className={`${fieldCls} font-mono`} required />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Pieces</label>
            <input type="number" min="1" value={form.piece_count} onChange={(e) => set('piece_count', e.target.value)} className={`${fieldCls} font-mono`} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Sieve size</label>
            <input value={form.sieve_size} onChange={(e) => set('sieve_size', e.target.value)} className={fieldCls} placeholder="e.g. +2 -2.5, 3 mm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Shape</label>
            <input value={form.shape} onChange={(e) => set('shape', e.target.value)} className={fieldCls} placeholder="Oval, round, cabochon…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Colour</label>
            <input value={form.colour} onChange={(e) => set('colour', e.target.value)} className={fieldCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Clarity</label>
            <input value={form.clarity} onChange={(e) => set('clarity', e.target.value)} className={fieldCls} placeholder="Eye-clean, SI, VS…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Origin</label>
            <input value={form.origin} onChange={(e) => set('origin', e.target.value)} className={fieldCls} placeholder="Zambia, Burma, Ceylon…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Treatment</label>
            <input value={form.treatment} onChange={(e) => set('treatment', e.target.value)} className={fieldCls} placeholder="None, oiled, heated…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Cost per carat (₹)</label>
            <input type="number" step="0.01" min="0" value={form.cost_per_carat} onChange={(e) => set('cost_per_carat', e.target.value)} className={`${fieldCls} font-mono`} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Certificate no.</label>
            <input value={form.certificate_no} onChange={(e) => set('certificate_no', e.target.value)} className={`${fieldCls} font-mono`} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Lot no. (blank = LOT/FY/n)</label>
            <input value={form.lot_no} onChange={(e) => set('lot_no', e.target.value)} className={`${fieldCls} font-mono`} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Location</label>
            <select value={form.location_id} onChange={(e) => set('location_id', e.target.value)} className={fieldCls}>
              <option value="">Default location</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Where do the carats come from?</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['opening', 'Opening stock', 'New to the books: an inward entry is written.'],
              ['purchase', 'Already received', 'Tags carats a purchase already put in stock; the material total does not change.'],
            ].map(([v, label, hint]) => (
              <button key={v} type="button" onClick={() => set('source', v)} className={`text-left p-2 rounded-lg border ${form.source === v ? 'border-primary bg-primary/10' : 'border-border'}`}>
                <div className={`text-xs font-semibold ${form.source === v ? 'text-primary' : 'text-white'}`}>{label}</div>
                <div className="text-[10px] text-textSecondary">{hint}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Remarks</label>
          <input value={form.remarks} onChange={(e) => set('remarks', e.target.value)} className={fieldCls} />
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-textSecondary hover:text-white">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg disabled:opacity-50">{saving ? 'Saving…' : 'Open lot'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Split ───────────────────────────────────────────────────────────────────

function SplitLotModal({ lot, busy, onClose, onSubmit }: { lot: LotRow; busy: boolean; onClose: () => void; onSubmit: (children: any[], reason: string) => void }) {
  const balance = num(lot.balance_carats);
  const [children, setChildren] = useState<SplitChildForm[]>([
    { key: 1, carat_weight: '', piece_count: '', sieve_size: lot.sieve_size || '' },
    { key: 2, carat_weight: '', piece_count: '', sieve_size: lot.sieve_size || '' },
  ]);
  const [reason, setReason] = useState('Gemstone lot split');
  const total = children.reduce((s, c) => s + num(c.carat_weight), 0);
  const diff = balance - total;
  const tolerance = Math.max(0.01, balance * 0.005);
  const ok = children.length > 0 && children.every((c) => num(c.carat_weight) > 0) && diff >= -1e-9 && diff <= tolerance + 1e-9;

  const update = (key: number, field: keyof SplitChildForm, value: string) =>
    setChildren(children.map((c) => (c.key === key ? { ...c, [field]: value } : c)));

  return (
    <Modal isOpen onClose={onClose} title={`Split ${lot.lot_no}`}>
      <div className="space-y-4">
        <div className="p-3 bg-background border border-border rounded-lg text-xs flex justify-between">
          <span className="text-textSecondary">{lot.material_name} · {[lot.sieve_size, lot.shape, lot.colour].filter(Boolean).join(' · ')}</span>
          <span className="text-white font-mono">Parent holds {ct(balance)}{lot.piece_count ? ` · ${lot.piece_count} pcs` : ''}</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-textSecondary uppercase">
              <th className="text-left pb-1">Parcel</th><th className="text-left pb-1">Carats *</th><th className="text-left pb-1">Pieces</th><th className="text-left pb-1">Sieve</th><th></th>
            </tr>
          </thead>
          <tbody>
            {children.map((c, i) => (
              <tr key={c.key}>
                <td className="py-1 pr-2 font-mono text-primary">{lot.lot_no}-{i + 1}</td>
                <td className="py-1 pr-2"><input type="number" step="0.001" min="0" value={c.carat_weight} onChange={(e) => update(c.key, 'carat_weight', e.target.value)} className={`${fieldCls} font-mono`} /></td>
                <td className="py-1 pr-2"><input type="number" min="1" value={c.piece_count} onChange={(e) => update(c.key, 'piece_count', e.target.value)} className={`${fieldCls} font-mono`} /></td>
                <td className="py-1 pr-2"><input value={c.sieve_size} onChange={(e) => update(c.key, 'sieve_size', e.target.value)} className={fieldCls} /></td>
                <td className="py-1"><button type="button" disabled={children.length <= 1} onClick={() => setChildren(children.filter((x) => x.key !== c.key))} className="text-textSecondary hover:text-danger disabled:opacity-30"><X className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={() => setChildren([...children, { key: Date.now(), carat_weight: '', piece_count: '', sieve_size: lot.sieve_size || '' }])} className="text-xs text-primary flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add parcel</button>
        <div className={`p-3 rounded-lg border text-xs flex justify-between ${ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-300'}`}>
          <span>Parcels total {ct(total)}</span>
          <span>
            {diff < -1e-9 ? `exceeds the parent by ${ct(-diff)}` : diff > tolerance + 1e-9 ? `${ct(diff)} short — beyond the ${ct(tolerance)} tolerance; re-weigh first` : diff > 1e-9 ? `${ct(diff)} booked as cutting loss` : 'balances exactly'}
          </span>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={fieldCls} />
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-textSecondary hover:text-white">Cancel</button>
          <button
            type="button"
            disabled={!ok || busy}
            onClick={() => onSubmit(children.map((c) => ({ carat_weight: c.carat_weight, piece_count: c.piece_count ? Number(c.piece_count) : undefined, sieve_size: c.sieve_size || undefined })), reason)}
            className="px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg disabled:opacity-50"
          >
            {busy ? 'Splitting…' : 'Split lot'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Merge ───────────────────────────────────────────────────────────────────

function MergeLotsModal({ lots, busy, onClose, onSubmit }: { lots: LotRow[]; busy: boolean; onClose: () => void; onSubmit: (lot_no: string, reason: string) => void }) {
  const [lotNo, setLotNo] = useState('');
  const [reason, setReason] = useState('Gemstone lots merged');
  const carats = lots.reduce((s, l) => s + num(l.balance_carats), 0);
  const value = lots.reduce((s, l) => s + num(l.balance_carats) * num(l.cost_per_carat), 0);
  const anyCost = lots.some((l) => l.cost_per_carat != null);
  return (
    <Modal isOpen onClose={onClose} title="Merge lots">
      <div className="space-y-4">
        <ul className="space-y-1 text-xs">
          {lots.map((l) => (
            <li key={l.id} className="flex justify-between p-2 bg-background border border-border rounded-lg">
              <span className="font-mono text-primary">{l.lot_no}</span>
              <span className="text-textSecondary">{[l.sieve_size, l.colour].filter(Boolean).join(' · ')}</span>
              <span className="font-mono text-white">{ct(l.balance_carats)}</span>
            </li>
          ))}
        </ul>
        <div className="p-3 bg-background border border-primary/30 rounded-lg text-xs flex justify-between">
          <span className="text-white font-mono">New lot: {ct(carats)}</span>
          <span className="text-textSecondary">{anyCost ? `avg ${formatCurrency(carats > 0 ? value / carats : 0)} / ct` : 'no cost on record'}</span>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">New lot no. (blank = LOT/FY/n)</label>
          <input value={lotNo} onChange={(e) => setLotNo(e.target.value)} className={`${fieldCls} font-mono`} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={fieldCls} />
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-textSecondary hover:text-white">Cancel</button>
          <button type="button" disabled={busy} onClick={() => onSubmit(lotNo, reason)} className="px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg disabled:opacity-50">{busy ? 'Merging…' : 'Merge'}</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Adjust ──────────────────────────────────────────────────────────────────

function AdjustLotModal({ lot, busy, onClose, onSubmit }: { lot: LotRow; busy: boolean; onClose: () => void; onSubmit: (carat_weight: string, reason: string) => void }) {
  const balance = num(lot.balance_carats);
  const [weight, setWeight] = useState(balance.toFixed(3));
  const [reason, setReason] = useState('Loss on cutting');
  const delta = num(weight) - balance;
  return (
    <Modal isOpen onClose={onClose} title={`Re-weigh ${lot.lot_no}`}>
      <div className="space-y-4">
        <p className="text-xs text-textSecondary">Ledger balance {ct(balance)}. Enter the weight on the balance now; the difference is booked as a loss (or gain) against the lot.</p>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">New weight (ct) *</label>
          <input type="number" step="0.001" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} className={`${fieldCls} font-mono`} />
        </div>
        <div className={`p-3 rounded-lg border text-xs ${delta < 0 ? 'border-red-500/40 bg-red-500/10 text-red-300' : delta > 0 ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-border text-textSecondary'}`}>
          {delta < 0 ? `Loss of ${ct(-delta)}` : delta > 0 ? `Gain of ${ct(delta)}` : 'No change'}{num(weight) <= 0 ? ' — the lot will be closed' : ''}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Reason *</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={fieldCls} placeholder="Cutting loss, polishing dust, re-weighed…" />
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-textSecondary hover:text-white">Cancel</button>
          <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => onSubmit(weight, reason.trim())} className="px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg disabled:opacity-50">{busy ? 'Saving…' : 'Record'}</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Label ───────────────────────────────────────────────────────────────────

function LotLabel({ lot, companyName, onClose }: { lot: LotRow; companyName: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="bg-white text-black rounded-lg shadow-2xl p-6 space-y-4 print:p-0 print:shadow-none">
        <div className="flex justify-between items-center border-b pb-3 print:hidden">
          <span className="font-bold text-gray-800">Lot label</span>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white rounded-md text-sm"><Printer className="w-4 h-4" /> Print</button>
            <button onClick={onClose} className="p-1.5 border rounded-md text-gray-600"><X className="w-4 h-4" /></button>
          </div>
        </div>
        {/* 70 x 40 mm parcel label */}
        <div id="printable-voucher" className="printable-area border border-black p-3 font-sans" style={{ width: '70mm', minHeight: '40mm' }}>
          <div className="flex justify-between items-baseline">
            <span className="text-[9px] uppercase tracking-wide text-gray-700">{companyName || 'Lot'}</span>
            <span className="text-[9px] text-gray-700">{lot.status}</span>
          </div>
          <div className="text-lg font-bold font-mono leading-tight">{lot.lot_no}</div>
          <div className="text-[11px] font-semibold">{lot.material_name}</div>
          <div className="text-[10px] text-gray-800">{[lot.sieve_size, lot.shape, lot.colour, lot.clarity].filter(Boolean).join(' · ')}</div>
          <div className="text-[10px] text-gray-800">{[lot.origin, lot.treatment].filter(Boolean).join(' · ')}</div>
          <div className="flex justify-between mt-1 text-[12px] font-mono font-bold">
            <span>{ct(lot.balance_carats)}</span>
            <span>{lot.piece_count != null ? `${lot.piece_count} pcs` : ''}</span>
          </div>
          {lot.certificate_no && <div className="text-[9px] font-mono text-gray-700">Cert {lot.certificate_no}</div>}
        </div>
      </div>
    </div>
  );
}
