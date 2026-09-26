"use client";

/**
 * Stock locations and transfers.
 *
 * The vault, the showroom, the production floor, the karigar's workshop:
 * each is a location, each has its own balance per material, and stock moves
 * between them by a transfer that writes an outward and an inward entry of
 * the same quantity and cost. This screen lists the locations with what they
 * hold, edits them, and records transfers.
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, ArrowLeftRight, Edit, X, Loader2, Warehouse, Star, Trash2, RefreshCw } from 'lucide-react';

import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ItemSelect, { StockItem } from '@/components/ui/ItemSelect';
import { locationsApi, StockLocation } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { today } from '@/lib/fiscal';

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '0');
  return Number.isFinite(n) ? n : 0;
};
const qty = (v: any, uom?: string | null) => `${num(v).toLocaleString('en-IN', { maximumFractionDigits: 4 })} ${uom || ''}`.trim();

const errText = (err: any, fallback: string) => {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: any) => x.msg || JSON.stringify(x)).join('\n');
  return fallback;
};

const fieldCls = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none';

const typeLabel = (t: string) => t.replace('_', ' ');

interface TransferLineForm { key: number; material_id: string; code: string; name: string; unit: string; quantity: string; }

export default function LocationsPage() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [balances, setBalances] = useState<any[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [transferDetail, setTransferDetail] = useState<any | null>(null);

  const [editing, setEditing] = useState<StockLocation | null | 'new'>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await locationsApi.list(showInactive);
      const list: StockLocation[] = res.data?.locations || [];
      setLocations(list);
      setTypes(res.data?.location_types || []);
      if (!selectedId && list.length) setSelectedId(list[0].id);
    } catch (err) {
      console.error('Locations fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [showInactive, selectedId]);

  const loadBalances = useCallback(async () => {
    if (!selectedId) { setBalances([]); return; }
    setBalancesLoading(true);
    try {
      const res = await locationsApi.balances({ location_id: selectedId });
      setBalances(res.data?.balances || []);
    } catch (err) {
      console.error('Balances fetch failed', err);
    } finally {
      setBalancesLoading(false);
    }
  }, [selectedId]);

  const loadTransfers = useCallback(async () => {
    try {
      const res = await locationsApi.transfers({ limit: 50 });
      setTransfers(res.data?.transfers || []);
    } catch (err) {
      console.error('Transfers fetch failed', err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadBalances(); }, [loadBalances]);
  useEffect(() => { loadTransfers(); }, [loadTransfers]);

  const selected = locations.find((l) => l.id === selectedId);
  const locName = (id: string | null) => {
    const l = locations.find((x) => x.id === id);
    return l ? l.code : '—';
  };

  const openTransfer = async (no: string) => {
    try {
      const res = await locationsApi.getTransfer(no);
      setTransferDetail(res.data);
    } catch (err) {
      alert(errText(err, 'Could not load the transfer'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Stock Locations & Transfers</h1>
          <p className="text-textSecondary mt-1">[CGST Rule 56(2)] Where the stock is, per material, and every move between places.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setTransferOpen(true)} disabled={locations.filter((l) => l.is_active).length < 2} className="flex items-center gap-2 px-4 py-2 border border-primary/40 text-primary rounded-lg hover:bg-primary/10 disabled:opacity-40">
            <ArrowLeftRight className="w-4 h-4" /> Transfer stock
          </button>
          <button type="button" onClick={() => setEditing('new')} className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90">
            <Plus className="w-4 h-4" /> New location
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Locations */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2"><Warehouse className="w-4 h-4 text-primary" /> Locations</h2>
            <label className="text-[11px] text-textSecondary flex items-center gap-1">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-primary" /> show inactive
            </label>
          </div>
          {loading ? (
            <div className="py-10 text-center text-textSecondary"><Loader2 className="w-5 h-5 animate-spin inline text-primary" /></div>
          ) : (
            <ul className="space-y-1">
              {locations.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(l.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedId === l.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'} ${!l.is_active ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-primary text-sm font-semibold flex items-center gap-1">{l.code}{l.is_default && <Star className="w-3 h-3 fill-primary" />}</span>
                      <Badge variant="default">{typeLabel(l.location_type)}</Badge>
                    </div>
                    <div className="text-white text-sm">{l.name}</div>
                    <div className="text-[11px] text-textSecondary flex justify-between">
                      <span>{l.materials_moved || 0} material(s)</span>
                      <span className="font-mono">{formatCurrency(num(l.stock_value))}</span>
                    </div>
                  </button>
                </li>
              ))}
              {locations.length === 0 && <li className="text-xs text-textSecondary text-center py-6">No locations.</li>}
            </ul>
          )}
        </div>

        {/* Balances at the selected location */}
        <div className="glass-card p-4 lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">{selected ? `${selected.code} — ${selected.name}` : 'Select a location'}</h2>
              {selected?.address && <p className="text-[11px] text-textSecondary">{selected.address}</p>}
            </div>
            {selected && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={loadBalances} className="p-1.5 text-textSecondary hover:text-white" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
                <button type="button" onClick={() => setEditing(selected)} className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-xs text-textSecondary hover:text-white"><Edit className="w-3.5 h-3.5" /> Edit</button>
              </div>
            )}
          </div>
          {balancesLoading ? (
            <div className="py-10 text-center text-textSecondary"><Loader2 className="w-5 h-5 animate-spin inline text-primary" /></div>
          ) : balances.length === 0 ? (
            <div className="py-10 text-center text-textSecondary text-xs">Nothing on hand here.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-textSecondary text-xs uppercase">
                  <th className="pb-2 text-left font-medium">Material</th>
                  <th className="pb-2 text-left font-medium">Category</th>
                  <th className="pb-2 text-right font-medium">Quantity</th>
                  <th className="pb-2 text-right font-medium">Net wt</th>
                  <th className="pb-2 text-right font-medium">Value at cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {balances.map((b) => (
                  <tr key={b.material_id} className="hover:bg-white/5">
                    <td className="py-2 text-white">{b.material_name}<span className="block text-[10px] font-mono text-textSecondary">{b.material_code}</span></td>
                    <td className="py-2"><Badge variant="default">{b.category || '—'}</Badge></td>
                    <td className="py-2 text-right font-mono text-white font-semibold">{qty(b.quantity, b.uom)}</td>
                    <td className="py-2 text-right font-mono text-textSecondary">{num(b.net_weight) ? qty(b.net_weight, 'gm') : '—'}</td>
                    <td className="py-2 text-right font-mono text-primary">{formatCurrency(num(b.value))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Transfers */}
      <div className="glass-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-primary" /> Recent transfers</h2>
        {transfers.length === 0 ? (
          <p className="text-xs text-textSecondary py-4 text-center">No transfers recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-textSecondary text-xs uppercase">
                <th className="pb-2 text-left font-medium">Transfer</th>
                <th className="pb-2 text-left font-medium">Date</th>
                <th className="pb-2 text-left font-medium">From</th>
                <th className="pb-2 text-left font-medium">To</th>
                <th className="pb-2 text-right font-medium">Lines</th>
                <th className="pb-2 text-right font-medium">Value</th>
                <th className="pb-2 text-left font-medium">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transfers.map((t) => (
                <tr key={t.transfer_no} className="hover:bg-white/5 cursor-pointer" onClick={() => openTransfer(t.transfer_no)}>
                  <td className="py-2 font-mono text-primary">{t.transfer_no}</td>
                  <td className="py-2 text-white">{t.transfer_date}</td>
                  <td className="py-2 font-mono text-textSecondary">{t.from_location_code || locName(t.from_location_id)}</td>
                  <td className="py-2 font-mono text-textSecondary">{t.to_location_code || locName(t.to_location_id)}</td>
                  <td className="py-2 text-right font-mono text-white">{t.line_count}</td>
                  <td className="py-2 text-right font-mono text-primary">{formatCurrency(num(t.total_value))}</td>
                  <td className="py-2 text-textSecondary text-xs">{t.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <LocationModal
          location={editing === 'new' ? null : editing}
          types={types}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); load(); }}
        />
      )}

      {transferOpen && (
        <TransferModal
          locations={locations.filter((l) => l.is_active)}
          defaultFrom={selectedId}
          onClose={() => setTransferOpen(false)}
          onDone={() => { setTransferOpen(false); load(); loadBalances(); loadTransfers(); }}
        />
      )}

      {transferDetail && (
        <Modal isOpen onClose={() => setTransferDetail(null)} title={`Transfer ${transferDetail.transfer_no}`}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-textSecondary uppercase border-b border-border">
                <th className="pb-1 text-left">Date</th><th className="pb-1 text-left">Leg</th><th className="pb-1 text-left">Location</th><th className="pb-1 text-left">Material</th><th className="pb-1 text-right">Qty</th><th className="pb-1 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {(transferDetail.entries || []).map((e: any) => (
                <tr key={e.id}>
                  <td className="py-1.5 text-white">{e.entry_date}</td>
                  <td className="py-1.5"><Badge variant={e.direction === 'O' ? 'danger' : 'success'}>{e.direction === 'O' ? 'OUT' : 'IN'}</Badge></td>
                  <td className="py-1.5 text-textSecondary">{e.location_code}</td>
                  <td className="py-1.5 text-white">{e.material_code}</td>
                  <td className="py-1.5 text-right text-white">{qty(e.quantity, e.uom)}</td>
                  <td className="py-1.5 text-right text-primary">{formatCurrency(num(e.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

// ─── Create / edit ───────────────────────────────────────────────────────────

function LocationModal({ location, types, onClose, onDone }: { location: StockLocation | null; types: string[]; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: location?.code || '',
    name: location?.name || '',
    location_type: location?.location_type || 'Godown',
    address: location?.address || '',
    is_default: location?.is_default || false,
    is_active: location?.is_active ?? true,
  });
  const set = (k: keyof typeof form, v: any) => setForm({ ...form, [k]: v });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (location) {
        await locationsApi.update(location.id, {
          name: form.name,
          location_type: form.location_type,
          address: form.address || null,
          is_active: form.is_active,
          is_default: form.is_default && !location.is_default ? true : undefined,
          reason: 'Stock location updated',
        });
      } else {
        await locationsApi.create({
          code: form.code, name: form.name, location_type: form.location_type,
          address: form.address || undefined, is_default: form.is_default, reason: 'Stock location created',
        });
      }
      onDone();
    } catch (err) {
      alert(errText(err, 'Could not save the location'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={location ? `Edit ${location.code}` : 'New stock location'}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Code *</label>
            <input value={form.code} disabled={!!location} onChange={(e) => set('code', e.target.value.toUpperCase())} className={`${fieldCls} font-mono disabled:opacity-50`} required maxLength={20} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Type *</label>
            <select value={form.location_type} onChange={(e) => set('location_type', e.target.value)} className={fieldCls}>
              {(types.length ? types : ['Vault', 'Production_Floor', 'Showroom', 'Transit', 'Godown', 'Other']).map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Name *</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className={fieldCls} required maxLength={100} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Address</label>
          <input value={form.address} onChange={(e) => set('address', e.target.value)} className={fieldCls} />
        </div>
        <div className="flex items-center gap-6 text-xs text-textSecondary">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_default} disabled={!!location?.is_default} onChange={(e) => set('is_default', e.target.checked)} className="accent-primary" /> Default location (receipts and sales post here)</label>
          {location && <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} disabled={!!location.is_default} onChange={(e) => set('is_active', e.target.checked)} className="accent-primary" /> Active</label>}
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-textSecondary hover:text-white">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Transfer ────────────────────────────────────────────────────────────────

function TransferModal({ locations, defaultFrom, onClose, onDone }: { locations: StockLocation[]; defaultFrom: string; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState(defaultFrom || locations[0]?.id || '');
  const [to, setTo] = useState(locations.find((l) => l.id !== (defaultFrom || locations[0]?.id))?.id || '');
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('Stock transfer');
  const [lines, setLines] = useState<TransferLineForm[]>([{ key: 1, material_id: '', code: '', name: '', unit: '', quantity: '' }]);
  const [available, setAvailable] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!from) return;
    locationsApi.balances({ location_id: from }).then((res) => {
      const map: Record<string, number> = {};
      (res.data?.balances || []).forEach((b: any) => { map[b.material_id] = num(b.quantity); });
      setAvailable(map);
    }).catch(() => setAvailable({}));
  }, [from]);

  const update = (key: number, patch: Partial<TransferLineForm>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const valid = from && to && from !== to && lines.some((l) => l.material_id && num(l.quantity) > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const res = await locationsApi.transfer({
        from_location_id: from,
        to_location_id: to,
        transfer_date: date,
        reason,
        lines: lines.filter((l) => l.material_id && num(l.quantity) > 0).map((l) => ({ material_id: l.material_id, quantity: l.quantity })),
      });
      alert(`Transfer ${res.data?.transfer_no} recorded.`);
      onDone();
    } catch (err) {
      alert(errText(err, 'Transfer failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Transfer stock between locations">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">From *</label>
            <select value={from} onChange={(e) => setFrom(e.target.value)} className={fieldCls}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">To *</label>
            <select value={to} onChange={(e) => setTo(e.target.value)} className={fieldCls}>
              {locations.filter((l) => l.id !== from).map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
          </div>
        </div>
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.key} className="flex gap-2 items-start">
              <div className="flex-1">
                <ItemSelect value={l.material_id} onChange={(id, item) => update(l.key, { material_id: id, code: item?.code || '', name: item?.name || '', unit: item?.unit || '' })} placeholder="Material…" />
                {l.material_id && <p className="text-[10px] text-textSecondary mt-1">At source: {qty(available[l.material_id] || 0, l.unit)}</p>}
              </div>
              <div className="w-32">
                <input type="number" step="any" min="0" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} className={`${fieldCls} font-mono`} placeholder={`Qty ${l.unit || ''}`} />
                {l.material_id && num(l.quantity) > (available[l.material_id] || 0) && <p className="text-[10px] text-red-400 mt-1">More than on hand</p>}
              </div>
              <button type="button" disabled={lines.length <= 1} onClick={() => setLines(lines.filter((x) => x.key !== l.key))} className="p-2 text-textSecondary hover:text-danger disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setLines([...lines, { key: Date.now(), material_id: '', code: '', name: '', unit: '', quantity: '' }])} className="text-xs text-primary flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add line</button>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Reason *</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={fieldCls} required />
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-textSecondary hover:text-white">Cancel</button>
          <button type="submit" disabled={!valid || saving} className="px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg disabled:opacity-50">{saving ? 'Recording…' : 'Record transfer'}</button>
        </div>
      </form>
    </Modal>
  );
}
