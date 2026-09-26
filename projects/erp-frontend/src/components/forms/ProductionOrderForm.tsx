"use client";

/**
 * Release a production order, from a bill of materials or ad hoc.
 *
 * With a BOM the order takes the BOM's product and the response carries the
 * consumption plan scaled to the output quantity; the completion form starts
 * from that plan instead of a blank line.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, ClipboardList } from 'lucide-react';
import { productionApi } from '@/lib/api';
import { today } from '@/lib/fiscal';

interface ProductionOrderFormProps {
  onSuccess?: (order?: any) => void;
  onCancel?: () => void;
  /** Pre-select a BOM (from the BOM tab's "Raise order" action). */
  initialBomId?: string;
}

const num = (v: any) => { const n = parseFloat(v ?? '0'); return Number.isFinite(n) ? n : 0; };
const fmtQty = (v: any) => num(v).toLocaleString('en-IN', { maximumFractionDigits: 4 });

export default function ProductionOrderForm({ onSuccess, onCancel, initialBomId }: ProductionOrderFormProps) {
  const [boms, setBoms] = useState<any[]>([]);
  const [bomId, setBomId] = useState(initialBomId || '');
  const [bomDetail, setBomDetail] = useState<any | null>(null);
  const [productName, setProductName] = useState('');
  const [orderDate, setOrderDate] = useState(today());
  const [outputQty, setOutputQty] = useState('1');
  const [allowedWastage, setAllowedWastage] = useState('2.5');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    productionApi.listBoms({ active_only: true, limit: 200 })
      .then((res) => setBoms(res.data?.boms || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!bomId) { setBomDetail(null); return; }
    let active = true;
    productionApi.getBom(bomId, num(outputQty) > 0 ? outputQty : undefined)
      .then((res) => { if (active) setBomDetail(res.data); })
      .catch(console.error);
    return () => { active = false; };
  }, [bomId, outputQty]);

  const plan: any[] = useMemo(() => bomDetail?.plan || [], [bomDetail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!bomId && !productName.trim()) {
      setError('Pick a bill of materials or enter a product name.');
      return;
    }
    if (num(outputQty) <= 0) {
      setError('Output quantity must be greater than zero.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await productionApi.createOrder({
        bom_id: bomId || null,
        product_name: bomId ? (bomDetail?.product_name || 'Production') : productName.trim(),
        order_date: orderDate,
        output_quantity: num(outputQty),
        planned_qty: num(outputQty),
        allowed_wastage_pct: num(allowedWastage || '2.5'),
        remarks: remarks || null,
        reason: 'Production order release',
      });
      if (onSuccess) onSuccess(res.data);
    } catch (err: any) {
      const d = err?.response?.data?.detail;
      setError(typeof d === 'string' ? d : Array.isArray(d) ? d.map((x: any) => x.msg).join('; ') : 'Failed to release order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-5 text-sm" onSubmit={handleSubmit}>
      {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs text-textSecondary mb-1">Bill of materials</label>
          <select value={bomId} onChange={(e) => setBomId(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white focus:border-primary outline-none">
            <option value="">— No BOM (ad hoc order) —</option>
            {boms.map((b) => (
              <option key={b.id} value={b.id}>{b.name || b.product_name} · v{b.bom_version} · {b.line_count} line(s){b.output_material_code ? ` → ${b.output_material_code}` : ''}</option>
            ))}
          </select>
          {boms.length === 0 && <p className="text-[11px] text-textSecondary mt-1">No BOMs yet. Create one under the &quot;Bills of materials&quot; tab to pre-fill consumption.</p>}
        </div>
        {!bomId && (
          <div className="col-span-2">
            <label className="block text-xs text-textSecondary mb-1">Product name / design *</label>
            <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. 22K Gold Bridal Necklace" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white focus:border-primary outline-none" />
          </div>
        )}
        <div>
          <label className="block text-xs text-textSecondary mb-1">Order date</label>
          <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white focus:border-primary outline-none" />
        </div>
        <div>
          <label className="block text-xs text-textSecondary mb-1">Output quantity{bomDetail?.output_material_code ? ` (${bomDetail.output_material_code})` : ''} *</label>
          <input type="number" min="0.0001" step="0.0001" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white font-mono focus:border-primary outline-none" />
        </div>
        <div>
          <label className="block text-xs text-textSecondary mb-1">Allowed wastage / melting loss (%)</label>
          <input type="number" step="0.1" min="0" max="100" value={allowedWastage} onChange={(e) => setAllowedWastage(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white font-mono focus:border-primary outline-none" />
        </div>
      </div>

      {bomId && (
        <div className="bg-surface/60 border border-border rounded-lg p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-white mb-2"><ClipboardList className="w-4 h-4 text-primary" /> Consumption plan for {fmtQty(outputQty)} {bomDetail?.output_material_name ? `× ${bomDetail.output_material_name}` : 'unit(s)'}</div>
          {plan.length === 0 ? (
            <p className="text-xs text-textSecondary">Loading the plan...</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-textSecondary uppercase"><tr><th className="text-left py-1">Material</th><th className="text-right py-1">Per unit</th><th className="text-right py-1">Net needed</th><th className="text-right py-1">Loss %</th><th className="text-right py-1">Issue</th></tr></thead>
              <tbody>
                {plan.map((l: any) => (
                  <tr key={l.id} className="border-t border-border/40">
                    <td className="py-1 text-white">{l.material_code} — {l.material_name}</td>
                    <td className="py-1 text-right font-mono">{fmtQty(l.quantity_per_unit)} {l.uom || ''}</td>
                    <td className="py-1 text-right font-mono">{fmtQty(l.net_required)}</td>
                    <td className="py-1 text-right font-mono text-textSecondary">{fmtQty(l.loss_pct)}</td>
                    <td className="py-1 text-right font-mono text-primary">{fmtQty(l.qty_issued)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs text-textSecondary mb-1">Order notes & instructions</label>
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} placeholder="Hallmarking standard: 916 BIS, net weight tolerance +/- 0.05 g" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white focus:border-primary outline-none text-sm" />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <button type="button" onClick={onCancel} className="px-5 py-2 rounded-lg border border-border text-white hover:bg-surface transition-colors">Cancel</button>
        <button type="submit" disabled={submitting} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gold-gradient text-background font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Release order
        </button>
      </div>
    </form>
  );
}
