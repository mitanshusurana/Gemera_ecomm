"use client";

/**
 * Production and manufacturing [CGST Rule 56(12)].
 *
 * Orders are raised from a bill of materials (or ad hoc) and completed with
 * as many consumption, output and wastage lines as the job needs; the
 * completion posts the stock movements and the four-leg manufacturing
 * journal. The BOM tab manages the recipes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, CheckCircle, CheckSquare, Loader2, X, ClipboardList, Factory, Pencil, RefreshCw } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ProductionOrderForm from '@/components/forms/ProductionOrderForm';
import { useToast } from '@/components/ui/Toast';
import { apiClient, productionApi, BomPayload } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { today } from '@/lib/fiscal';

interface Material {
  id: string;
  code: string;
  name: string;
  category: string;
  uom?: string;
  current_stock?: number | string;
}

interface ConsumptionLine {
  key: number;
  material_id: string;
  qty_issued: string;
  gross_weight: string;
  net_weight: string;
  purity_pct: string;
  rate: string;
  remarks: string;
}
interface OutputRow {
  key: number;
  material_id: string;
  qty_produced: string;
  gross_weight: string;
  net_weight: string;
  hallmark_no: string;
  quality_grade: string;
  valuation_rate: string;
}
interface WastageRow {
  key: number;
  material_id: string;
  wastage_type: string;
  qty_lost: string;
  recoverable_qty: string;
  rate: string;
  remarks: string;
}
interface BomLineForm {
  key: number;
  material_id: string;
  quantity_per_unit: string;
  standard_loss_pct: string;
  loss_type: string;
  notes: string;
}

const WASTAGE_TYPES = ['Melting_Loss', 'Polishing_Loss', 'Cutting_Loss', 'Setting_Loss', 'Other'];

const num = (v: any) => { const n = typeof v === 'number' ? v : parseFloat(v ?? '0'); return Number.isFinite(n) ? n : 0; };
const fmtQty = (v: any) => num(v).toLocaleString('en-IN', { maximumFractionDigits: 4 });
const errorText = (err: any, fallback: string): string => {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: any) => x.msg || JSON.stringify(x)).join('; ');
  return err?.message || fallback;
};

const cellCls = 'w-full bg-background border border-border rounded px-2 py-1 text-white text-xs font-mono focus:border-primary outline-none';
const selectCls = 'w-full bg-background border border-border rounded px-2 py-1 text-white text-xs focus:border-primary outline-none';

let keySeq = 1;
const nextKey = () => keySeq++;

type Tab = 'orders' | 'boms';

export default function ManufacturingPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('orders');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newOrderBomId, setNewOrderBomId] = useState<string | undefined>(undefined);
  const [productionData, setProductionData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);

  // Completion
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [completionDate, setCompletionDate] = useState(today());
  const [consumption, setConsumption] = useState<ConsumptionLine[]>([]);
  const [outputs, setOutputs] = useState<OutputRow[]>([]);
  const [wastage, setWastage] = useState<WastageRow[]>([]);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');
  const [planLoading, setPlanLoading] = useState(false);

  // BOMs
  const [boms, setBoms] = useState<any[]>([]);
  const [bomsLoading, setBomsLoading] = useState(false);
  const [bomEditor, setBomEditor] = useState<{ id?: string } | null>(null);
  const [bomName, setBomName] = useState('');
  const [bomOutputMaterial, setBomOutputMaterial] = useState('');
  const [bomOutputQty, setBomOutputQty] = useState('1');
  const [bomVersion, setBomVersion] = useState('1.0');
  const [bomActive, setBomActive] = useState(true);
  const [bomRemarks, setBomRemarks] = useState('');
  const [bomLines, setBomLines] = useState<BomLineForm[]>([]);
  const [bomSaving, setBomSaving] = useState(false);
  const [bomError, setBomError] = useState('');

  const fetchProductionData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productionApi.listOrders({ limit: 200 });
      const list = Array.isArray(res.data) ? res.data : res.data?.orders || res.data?.data || [];
      setProductionData(list);
    } catch (error) {
      console.error('Error fetching production data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBoms = useCallback(async () => {
    setBomsLoading(true);
    try {
      const res = await productionApi.listBoms({ active_only: false, limit: 200 });
      setBoms(res.data?.boms || []);
    } catch (err) {
      showToast('error', 'Could not load BOMs', errorText(err, ''));
    } finally {
      setBomsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchProductionData();
    apiClient.get('/inventory/materials', { params: { limit: 500 } })
      .then((res) => {
        const mats = Array.isArray(res.data) ? res.data : res.data?.materials || res.data?.items || [];
        setMaterials(mats);
      })
      .catch(console.error);
  }, [fetchProductionData]);

  useEffect(() => { if (tab === 'boms') fetchBoms(); }, [tab, fetchBoms]);

  const materialLabel = (id: string) => {
    const m = materials.find((x) => x.id === id);
    return m ? `${m.code} — ${m.name}` : id;
  };
  const materialOptions = useMemo(() => materials.map((m) => (
    <option key={m.id} value={m.id}>{m.code} — {m.name} ({m.category}{m.uom ? `, ${m.uom}` : ''})</option>
  )), [materials]);

  // ─── Completion ───────────────────────────────────────────────────────────

  const goldDefault = () => materials.find((m) => m.category === 'Gold')?.id || materials[0]?.id || '';

  const openCompleteModal = async (order: any) => {
    setSelectedOrder(order);
    setCompleteError('');
    setCompletionDate(today());
    setPlanLoading(true);
    try {
      const res = await productionApi.getOrder(order.id);
      const detail = res.data;
      const plan: any[] = detail?.plan || [];
      if (plan.length > 0) {
        setConsumption(plan.map((l) => ({
          key: nextKey(), material_id: l.material_id, qty_issued: String(num(l.qty_issued)),
          gross_weight: '', net_weight: '', purity_pct: l.category === 'Gold' ? '91.6' : '', rate: '', remarks: l.notes || '',
        })));
        setWastage(plan.filter((l) => num(l.expected_loss) > 0).map((l) => ({
          key: nextKey(), material_id: l.material_id, wastage_type: l.loss_type || 'Melting_Loss',
          qty_lost: String(num(l.expected_loss)), recoverable_qty: '', rate: '', remarks: 'Standard loss per BOM',
        })));
      } else {
        setConsumption([{ key: nextKey(), material_id: goldDefault(), qty_issued: '', gross_weight: '', net_weight: '', purity_pct: '91.6', rate: '', remarks: '' }]);
        setWastage([]);
      }
      const outMat = detail?.bom?.output_material_id || goldDefault();
      setOutputs([{ key: nextKey(), material_id: outMat, qty_produced: String(num(order.planned_qty || 1)), gross_weight: '', net_weight: '', hallmark_no: '', quality_grade: 'A', valuation_rate: '' }]);
    } catch (err) {
      setConsumption([{ key: nextKey(), material_id: goldDefault(), qty_issued: '', gross_weight: '', net_weight: '', purity_pct: '91.6', rate: '', remarks: '' }]);
      setOutputs([{ key: nextKey(), material_id: goldDefault(), qty_produced: String(num(order.planned_qty || 1)), gross_weight: '', net_weight: '', hallmark_no: '', quality_grade: 'A', valuation_rate: '' }]);
      setWastage([]);
    } finally {
      setPlanLoading(false);
    }
  };

  const consumptionValue = consumption.reduce((s, l) => s + num(l.qty_issued) * num(l.rate), 0);
  const outputValue = outputs.reduce((s, l) => s + num(l.qty_produced) * num(l.valuation_rate), 0);
  const wastageValue = wastage.reduce((s, l) => s + num(l.qty_lost) * num(l.rate), 0);
  const consumedQty = consumption.reduce((s, l) => s + num(l.qty_issued), 0);
  const lostQty = wastage.reduce((s, l) => s + num(l.qty_lost), 0);
  const lossPct = consumedQty > 0 ? (lostQty / consumedQty) * 100 : 0;

  const handleCompleteOrder = async () => {
    if (!selectedOrder) return;
    const cons = consumption.filter((l) => l.material_id && num(l.qty_issued) > 0);
    const outs = outputs.filter((l) => l.material_id && num(l.qty_produced) > 0);
    const waste = wastage.filter((l) => l.material_id && num(l.qty_lost) > 0);
    if (cons.length === 0) { setCompleteError('Add at least one consumption line with a quantity.'); return; }
    if (outs.length === 0) { setCompleteError('Add at least one output line with a quantity.'); return; }
    if (num(selectedOrder.allowed_wastage_pct) >= 0 && lossPct > num(selectedOrder.allowed_wastage_pct ?? 100) + 1e-9) {
      setCompleteError(`Wastage ${lossPct.toFixed(2)}% exceeds the ${num(selectedOrder.allowed_wastage_pct)}% allowed on this order.`); return;
    }
    setCompleting(true);
    setCompleteError('');
    try {
      const payload = {
        completion_date: completionDate,
        consumption_lines: cons.map((l) => ({
          material_id: l.material_id,
          qty_issued: num(l.qty_issued),
          gross_weight: l.gross_weight ? num(l.gross_weight) : null,
          net_weight: l.net_weight ? num(l.net_weight) : null,
          purity: l.purity_pct ? Math.min(1, num(l.purity_pct) / 100) : null,
          rate: num(l.rate),
          remarks: l.remarks || null,
        })),
        output_lines: outs.map((l) => ({
          material_id: l.material_id,
          qty_produced: num(l.qty_produced),
          gross_weight: l.gross_weight ? num(l.gross_weight) : null,
          net_weight: l.net_weight ? num(l.net_weight) : null,
          hallmark_no: l.hallmark_no || null,
          quality_grade: l.quality_grade || null,
          valuation_rate: num(l.valuation_rate),
        })),
        wastage_lines: waste.map((l) => ({
          material_id: l.material_id,
          wastage_type: l.wastage_type,
          qty_lost: num(l.qty_lost),
          loss_pct: consumedQty > 0 ? (num(l.qty_lost) / consumedQty) * 100 : 0,
          recoverable_qty: l.recoverable_qty ? num(l.recoverable_qty) : 0,
          rate: num(l.rate),
          remarks: l.remarks || null,
        })),
        reason: 'Production Order Completion [CGST-R56-12]',
      };
      const res = await productionApi.completeOrder(selectedOrder.id, payload);
      showToast('success', `Order ${selectedOrder.order_no} completed`, `Journal ${res.data?.journal_entry_no || ''} posted.`);
      setSelectedOrder(null);
      fetchProductionData();
    } catch (err: any) {
      setCompleteError(errorText(err, 'Failed to complete production order'));
    } finally {
      setCompleting(false);
    }
  };

  const updateCons = (key: number, patch: Partial<ConsumptionLine>) => setConsumption((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const updateOut = (key: number, patch: Partial<OutputRow>) => setOutputs((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const updateWaste = (key: number, patch: Partial<WastageRow>) => setWastage((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // ─── BOM editor ───────────────────────────────────────────────────────────

  const openBomEditor = async (bom?: any) => {
    setBomError('');
    if (!bom) {
      setBomEditor({});
      setBomName(''); setBomOutputMaterial(materials.find((m) => m.category === 'Gold')?.id || ''); setBomOutputQty('1');
      setBomVersion('1.0'); setBomActive(true); setBomRemarks('');
      setBomLines([{ key: nextKey(), material_id: '', quantity_per_unit: '', standard_loss_pct: '0', loss_type: 'Melting_Loss', notes: '' }]);
      return;
    }
    try {
      const res = await productionApi.getBom(bom.id);
      const d = res.data;
      setBomEditor({ id: d.id });
      setBomName(d.name || d.product_name || ''); setBomOutputMaterial(d.output_material_id || ''); setBomOutputQty(String(num(d.output_quantity || 1)));
      setBomVersion(d.bom_version || '1.0'); setBomActive(Boolean(d.is_active)); setBomRemarks(d.remarks || '');
      setBomLines((d.lines || []).map((l: any) => ({
        key: nextKey(), material_id: l.material_id, quantity_per_unit: String(num(l.quantity_per_unit)),
        standard_loss_pct: String(num(l.standard_loss_pct)), loss_type: l.loss_type || 'Melting_Loss', notes: l.notes || '',
      })));
    } catch (err) {
      showToast('error', 'Could not open BOM', errorText(err, ''));
    }
  };

  const saveBom = async () => {
    setBomError('');
    if (!bomName.trim()) { setBomError('Give the BOM a name.'); return; }
    if (!bomOutputMaterial) { setBomError('Choose the finished material the BOM produces.'); return; }
    const lines = bomLines.filter((l) => l.material_id && num(l.quantity_per_unit) > 0);
    if (lines.length === 0) { setBomError('Add at least one material line with a quantity.'); return; }
    const payload: BomPayload = {
      name: bomName.trim(),
      output_material_id: bomOutputMaterial,
      output_quantity: num(bomOutputQty) || 1,
      bom_version: bomVersion || '1.0',
      is_active: bomActive,
      remarks: bomRemarks || null,
      lines: lines.map((l) => ({
        material_id: l.material_id,
        quantity_per_unit: num(l.quantity_per_unit),
        standard_loss_pct: num(l.standard_loss_pct),
        loss_type: l.loss_type || null,
        notes: l.notes || null,
      })),
      reason: bomEditor?.id ? 'Bill of materials updated' : 'Bill of materials created',
    };
    setBomSaving(true);
    try {
      if (bomEditor?.id) await productionApi.updateBom(bomEditor.id, payload);
      else await productionApi.createBom(payload);
      showToast('success', 'Bill of materials saved');
      setBomEditor(null);
      fetchBoms();
    } catch (err) {
      setBomError(errorText(err, 'Could not save the BOM'));
    } finally {
      setBomSaving(false);
    }
  };
  const updateBomLine = (key: number, patch: Partial<BomLineForm>) => setBomLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // ─── Table ────────────────────────────────────────────────────────────────

  const columns = [
    { header: 'Order No', accessorKey: 'order_no', cell: (item: any) => <span className="font-medium text-white font-mono">{item.order_no || item.id}</span> },
    { header: 'Product', accessorKey: 'product_name', cell: (item: any) => <span>{item.product_name || item.product}{item.bom_name && <span className="block text-[10px] text-textSecondary">BOM: {item.bom_name}</span>}</span> },
    { header: 'Planned Qty', accessorKey: 'planned_qty', cell: (item: any) => `${fmtQty(item.planned_qty || 1)}${item.actual_qty ? ` / ${fmtQty(item.actual_qty)} made` : ''}` },
    { header: 'Date', accessorKey: 'order_date', cell: (item: any) => new Date(item.order_date || item.date || item.created_at).toLocaleDateString('en-IN') },
    { header: 'Status', accessorKey: 'status', cell: (item: any) => {
      const status = item.status || 'Draft';
      return (
        <Badge variant={status === 'Completed' ? 'success' : status === 'In_Progress' || status === 'In Progress' ? 'warning' : 'default'}>
          {String(status).replace('_', ' ')}
        </Badge>
      );
    }},
    { header: 'Actions', accessorKey: 'actions', cell: (item: any) => (
      item.status !== 'Completed' && item.status !== 'Cancelled' ? (
        <button
          onClick={() => openCompleteModal(item)}
          className="flex items-center gap-1.5 px-3 py-1 bg-primary text-black font-semibold rounded text-xs hover:bg-primary/90 transition-colors shadow-sm"
        >
          <CheckSquare className="w-3.5 h-3.5" /> Complete & Post Journal
        </button>
      ) : (
        <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
          <CheckCircle className="w-3.5 h-3.5" /> {item.status === 'Cancelled' ? 'Cancelled' : 'Journal Posted'}
        </span>
      )
    )}
  ];

  const tabBtn = (t: Tab, label: string, icon: React.ReactNode) => (
    <button type="button" onClick={() => setTab(t)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-primary/15 text-primary border border-primary/30' : 'text-textSecondary hover:text-white hover:bg-white/5 border border-transparent'}`}>
      {icon} {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Production & Manufacturing [CGST-R56-12]</h1>
          <p className="text-textSecondary mt-1">Orders from bills of materials; completion posts every consumption, output and wastage line and the four-leg manufacturing journal.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => (tab === 'boms' ? fetchBoms() : fetchProductionData())} className="p-2 rounded-lg border border-border text-textSecondary hover:text-white hover:bg-white/5" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
          {tab === 'orders' ? (
            <button onClick={() => { setNewOrderBomId(undefined); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(212,168,67,0.3)]">
              <Plus className="w-4 h-4" /> New Order
            </button>
          ) : (
            <button onClick={() => openBomEditor()} className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(212,168,67,0.3)]">
              <Plus className="w-4 h-4" /> New BOM
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {tabBtn('orders', 'Production orders', <Factory className="w-4 h-4" />)}
        {tabBtn('boms', 'Bills of materials', <ClipboardList className="w-4 h-4" />)}
      </div>

      {tab === 'orders' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card p-6 border-l-4 border-l-warning">
              <h3 className="text-sm font-medium text-textSecondary uppercase">Active Orders</h3>
              <p className="text-3xl font-playfair font-bold text-white mt-2">{productionData.filter(o => o.status === 'In_Progress' || o.status === 'In Progress' || o.status === 'Released').length || 0}</p>
            </div>
            <div className="glass-card p-6 border-l-4 border-l-primary">
              <h3 className="text-sm font-medium text-textSecondary uppercase">Completed Orders</h3>
              <p className="text-3xl font-playfair font-bold text-white mt-2">{productionData.filter(o => o.status === 'Completed').length || 0}</p>
            </div>
            <div className="glass-card p-6 border-l-4 border-l-success">
              <h3 className="text-sm font-medium text-textSecondary uppercase">CGST Rule 56(12) Status</h3>
              <p className="text-lg font-semibold text-emerald-400 mt-2">WIP & Loss Journals Active</p>
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-playfair font-semibold text-white">Production Orders & Work Orders</h2>
            </div>
            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : productionData.length === 0 ? (
              <div className="text-center py-8 text-textSecondary">No production orders found</div>
            ) : (
              <DataTable columns={columns} data={productionData} />
            )}
          </div>
        </>
      )}

      {tab === 'boms' && (
        <div className="glass-card p-6">
          <h2 className="text-xl font-playfair font-semibold text-white mb-4">Bills of materials</h2>
          {bomsLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
          ) : boms.length === 0 ? (
            <div className="text-center py-8 text-textSecondary">No BOMs yet. A BOM is the recipe for one finished item: what goes in per unit and the standard loss.</div>
          ) : (
            <div className="w-full glass rounded-xl overflow-x-auto border border-border">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-textSecondary uppercase bg-surface"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Produces</th><th className="px-4 py-3">Version</th><th className="px-4 py-3 text-right">Batch</th><th className="px-4 py-3 text-right">Lines</th><th className="px-4 py-3 text-right">Orders</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead>
                <tbody>
                  {boms.map((b) => (
                    <tr key={b.id} className="bg-background hover:bg-white/5 border-b border-border/50 last:border-0">
                      <td className="px-4 py-3 text-white">{b.name || b.product_name}<span className="block text-[10px] text-textSecondary">product: {b.product_name}</span></td>
                      <td className="px-4 py-3">{b.output_material_code ? `${b.output_material_code} — ${b.output_material_name}` : <span className="text-textSecondary">—</span>}</td>
                      <td className="px-4 py-3 font-mono">{b.bom_version}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmtQty(b.output_quantity)}</td>
                      <td className="px-4 py-3 text-right font-mono">{b.line_count}</td>
                      <td className="px-4 py-3 text-right font-mono">{b.orders_count}</td>
                      <td className="px-4 py-3"><Badge variant={b.is_active ? 'success' : 'default'}>{b.is_active ? 'Active' : 'Inactive'}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => openBomEditor(b)} className="flex items-center gap-1 px-2 py-1 border border-border rounded text-xs text-white hover:bg-white/5"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                          {b.is_active && <button type="button" onClick={() => { setNewOrderBomId(b.id); setIsModalOpen(true); }} className="flex items-center gap-1 px-2 py-1 bg-primary text-black font-semibold rounded text-xs hover:bg-primary/90"><Factory className="w-3.5 h-3.5" /> Raise order</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* New Order Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create & Release Production Order">
        <ProductionOrderForm
          initialBomId={newOrderBomId}
          onSuccess={(order) => {
            setIsModalOpen(false);
            showToast('success', `Order ${order?.order_no || ''} released`, order?.plan?.length ? `${order.plan.length} consumption line(s) planned from the BOM.` : undefined);
            setTab('orders');
            fetchProductionData();
          }}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      {/* Complete Order Modal */}
      {selectedOrder && (
        <Modal isOpen onClose={() => setSelectedOrder(null)} title={`Complete Order: ${selectedOrder.order_no} (${selectedOrder.product_name})`}>
          <div className="space-y-5 text-sm">
            {completeError && <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs">{completeError}</div>}
            {planLoading && <div className="text-xs text-textSecondary flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading the BOM plan...</div>}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-textSecondary mb-1">Completion date</label>
                <input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm" />
              </div>
              <div className="col-span-2 text-xs text-textSecondary self-end pb-2">
                Planned {fmtQty(selectedOrder.planned_qty)} · allowed wastage {fmtQty(selectedOrder.allowed_wastage_pct ?? 0)}% · this entry {lossPct.toFixed(2)}%
                {lossPct > num(selectedOrder.allowed_wastage_pct ?? 100) && <span className="text-danger"> (over the allowance)</span>}
              </div>
            </div>

            {/* Consumption */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-white uppercase">Raw material consumed → WIP</h4>
                <button type="button" onClick={() => setConsumption((p) => [...p, { key: nextKey(), material_id: goldDefault(), qty_issued: '', gross_weight: '', net_weight: '', purity_pct: '', rate: '', remarks: '' }])} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add line</button>
              </div>
              <div className="w-full glass rounded-xl overflow-x-auto border border-border">
                <table className="w-full text-xs">
                  <thead className="text-textSecondary uppercase bg-surface"><tr><th className="px-2 py-2 text-left">Material</th><th className="px-2 py-2 w-24">Qty</th><th className="px-2 py-2 w-20">Gross g</th><th className="px-2 py-2 w-20">Net g</th><th className="px-2 py-2 w-16">Purity %</th><th className="px-2 py-2 w-24">Rate</th><th className="px-2 py-2 w-24 text-right">Value</th><th className="w-8"></th></tr></thead>
                  <tbody>
                    {consumption.map((l) => (
                      <tr key={l.key} className="border-t border-border/40">
                        <td className="px-2 py-1"><select value={l.material_id} onChange={(e) => updateCons(l.key, { material_id: e.target.value })} className={selectCls}><option value="">— choose —</option>{materialOptions}</select></td>
                        <td className="px-2 py-1"><input type="number" step="0.001" min="0" value={l.qty_issued} onChange={(e) => updateCons(l.key, { qty_issued: e.target.value })} className={cellCls} /></td>
                        <td className="px-2 py-1"><input type="number" step="0.001" min="0" value={l.gross_weight} onChange={(e) => updateCons(l.key, { gross_weight: e.target.value })} className={cellCls} /></td>
                        <td className="px-2 py-1"><input type="number" step="0.001" min="0" value={l.net_weight} onChange={(e) => updateCons(l.key, { net_weight: e.target.value })} className={cellCls} /></td>
                        <td className="px-2 py-1"><input type="number" step="0.1" min="0" max="100" value={l.purity_pct} onChange={(e) => updateCons(l.key, { purity_pct: e.target.value })} className={cellCls} /></td>
                        <td className="px-2 py-1"><input type="number" step="0.01" min="0" value={l.rate} onChange={(e) => updateCons(l.key, { rate: e.target.value })} className={cellCls} placeholder="Rs/unit" /></td>
                        <td className="px-2 py-1 text-right font-mono">{formatCurrency(num(l.qty_issued) * num(l.rate))}</td>
                        <td className="px-1 py-1"><button type="button" onClick={() => setConsumption((p) => p.filter((x) => x.key !== l.key))} className="text-textSecondary hover:text-danger"><X className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Output */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-white uppercase">Finished goods produced ← WIP</h4>
                <button type="button" onClick={() => setOutputs((p) => [...p, { key: nextKey(), material_id: goldDefault(), qty_produced: '', gross_weight: '', net_weight: '', hallmark_no: '', quality_grade: 'A', valuation_rate: '' }])} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add line</button>
              </div>
              <div className="w-full glass rounded-xl overflow-x-auto border border-border">
                <table className="w-full text-xs">
                  <thead className="text-textSecondary uppercase bg-surface"><tr><th className="px-2 py-2 text-left">Material</th><th className="px-2 py-2 w-20">Qty</th><th className="px-2 py-2 w-20">Gross g</th><th className="px-2 py-2 w-20">Net g</th><th className="px-2 py-2 w-28">Hallmark</th><th className="px-2 py-2 w-14">Grade</th><th className="px-2 py-2 w-24">Rate</th><th className="px-2 py-2 w-24 text-right">Value</th><th className="w-8"></th></tr></thead>
                  <tbody>
                    {outputs.map((l) => (
                      <tr key={l.key} className="border-t border-border/40">
                        <td className="px-2 py-1"><select value={l.material_id} onChange={(e) => updateOut(l.key, { material_id: e.target.value })} className={selectCls}><option value="">— choose —</option>{materialOptions}</select></td>
                        <td className="px-2 py-1"><input type="number" step="0.001" min="0" value={l.qty_produced} onChange={(e) => updateOut(l.key, { qty_produced: e.target.value })} className={cellCls} /></td>
                        <td className="px-2 py-1"><input type="number" step="0.001" min="0" value={l.gross_weight} onChange={(e) => updateOut(l.key, { gross_weight: e.target.value })} className={cellCls} /></td>
                        <td className="px-2 py-1"><input type="number" step="0.001" min="0" value={l.net_weight} onChange={(e) => updateOut(l.key, { net_weight: e.target.value })} className={cellCls} /></td>
                        <td className="px-2 py-1"><input type="text" value={l.hallmark_no} onChange={(e) => updateOut(l.key, { hallmark_no: e.target.value })} className={cellCls} placeholder="BIS HUID" /></td>
                        <td className="px-2 py-1"><input type="text" value={l.quality_grade} onChange={(e) => updateOut(l.key, { quality_grade: e.target.value })} className={cellCls} /></td>
                        <td className="px-2 py-1"><input type="number" step="0.01" min="0" value={l.valuation_rate} onChange={(e) => updateOut(l.key, { valuation_rate: e.target.value })} className={cellCls} placeholder="Rs/unit" /></td>
                        <td className="px-2 py-1 text-right font-mono">{formatCurrency(num(l.qty_produced) * num(l.valuation_rate))}</td>
                        <td className="px-1 py-1"><button type="button" onClick={() => setOutputs((p) => p.filter((x) => x.key !== l.key))} className="text-textSecondary hover:text-danger"><X className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Wastage */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-white uppercase">Wastage / melting & polishing loss</h4>
                <button type="button" onClick={() => setWastage((p) => [...p, { key: nextKey(), material_id: goldDefault(), wastage_type: 'Melting_Loss', qty_lost: '', recoverable_qty: '', rate: '', remarks: '' }])} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add line</button>
              </div>
              <div className="w-full glass rounded-xl overflow-x-auto border border-border">
                <table className="w-full text-xs">
                  <thead className="text-textSecondary uppercase bg-surface"><tr><th className="px-2 py-2 text-left">Material</th><th className="px-2 py-2 w-32">Type</th><th className="px-2 py-2 w-20">Qty lost</th><th className="px-2 py-2 w-20">Recoverable</th><th className="px-2 py-2 w-24">Rate</th><th className="px-2 py-2 w-24 text-right">Value</th><th className="w-8"></th></tr></thead>
                  <tbody>
                    {wastage.length === 0 && <tr><td colSpan={7} className="px-2 py-3 text-center text-textSecondary">No wastage recorded.</td></tr>}
                    {wastage.map((l) => (
                      <tr key={l.key} className="border-t border-border/40">
                        <td className="px-2 py-1"><select value={l.material_id} onChange={(e) => updateWaste(l.key, { material_id: e.target.value })} className={selectCls}><option value="">— choose —</option>{materialOptions}</select></td>
                        <td className="px-2 py-1"><select value={l.wastage_type} onChange={(e) => updateWaste(l.key, { wastage_type: e.target.value })} className={selectCls}>{WASTAGE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select></td>
                        <td className="px-2 py-1"><input type="number" step="0.001" min="0" value={l.qty_lost} onChange={(e) => updateWaste(l.key, { qty_lost: e.target.value })} className={cellCls} /></td>
                        <td className="px-2 py-1"><input type="number" step="0.001" min="0" value={l.recoverable_qty} onChange={(e) => updateWaste(l.key, { recoverable_qty: e.target.value })} className={cellCls} /></td>
                        <td className="px-2 py-1"><input type="number" step="0.01" min="0" value={l.rate} onChange={(e) => updateWaste(l.key, { rate: e.target.value })} className={cellCls} placeholder="Rs/unit" /></td>
                        <td className="px-2 py-1 text-right font-mono">{formatCurrency(num(l.qty_lost) * num(l.rate))}</td>
                        <td className="px-1 py-1"><button type="button" onClick={() => setWastage((p) => p.filter((x) => x.key !== l.key))} className="text-textSecondary hover:text-danger"><X className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 bg-surface border border-border rounded-lg text-xs text-textSecondary space-y-1">
              <strong className="text-white block font-medium">Journal to be posted [CGST Rule 56(12) & s.44AA]:</strong>
              <p>• Dr WIP {formatCurrency(consumptionValue)} / Cr raw material stock — {consumption.filter((l) => l.material_id).length} line(s), {fmtQty(consumedQty)} consumed</p>
              <p>• Dr finished goods stock {formatCurrency(outputValue)} / Cr WIP — {outputs.filter((l) => l.material_id).length} line(s)</p>
              <p>• Dr manufacturing loss {formatCurrency(wastageValue)} / Cr WIP — {fmtQty(lostQty)} lost ({lossPct.toFixed(2)}%)</p>
              <p>• Stock register: outward per consumption line, inward per output line</p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button onClick={() => setSelectedOrder(null)} className="px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5">Cancel</button>
              <button onClick={handleCompleteOrder} disabled={completing || planLoading} className="flex items-center gap-2 px-5 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
                {completing && <Loader2 className="w-4 h-4 animate-spin" />} Post Manufacturing Journal
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* BOM editor */}
      {bomEditor && (
        <Modal isOpen onClose={() => setBomEditor(null)} title={bomEditor.id ? 'Edit bill of materials' : 'New bill of materials'}>
          <div className="space-y-4 text-sm">
            {bomError && <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs">{bomError}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs text-textSecondary mb-1">Name *</label>
                <input type="text" value={bomName} onChange={(e) => setBomName(e.target.value)} placeholder="e.g. 22K plain bangle, 20 g" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-textSecondary mb-1">Produces (finished material) *</label>
                <select value={bomOutputMaterial} onChange={(e) => setBomOutputMaterial(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm"><option value="">— choose —</option>{materialOptions}</select>
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Batch size (lines are per this many)</label>
                <input type="number" min="0.0001" step="0.0001" value={bomOutputQty} onChange={(e) => setBomOutputQty(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Version</label>
                <input type="text" value={bomVersion} onChange={(e) => setBomVersion(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm font-mono" />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input id="bom-active" type="checkbox" checked={bomActive} onChange={(e) => setBomActive(e.target.checked)} />
                <label htmlFor="bom-active" className="text-xs text-textSecondary">Active (available for new orders)</label>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-white uppercase">Materials per batch</h4>
                <button type="button" onClick={() => setBomLines((p) => [...p, { key: nextKey(), material_id: '', quantity_per_unit: '', standard_loss_pct: '0', loss_type: 'Melting_Loss', notes: '' }])} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add line</button>
              </div>
              <div className="w-full glass rounded-xl overflow-x-auto border border-border">
                <table className="w-full text-xs">
                  <thead className="text-textSecondary uppercase bg-surface"><tr><th className="px-2 py-2 text-left">Material</th><th className="px-2 py-2 w-24">Qty</th><th className="px-2 py-2 w-20">Loss %</th><th className="px-2 py-2 w-32">Loss type</th><th className="px-2 py-2">Notes</th><th className="w-8"></th></tr></thead>
                  <tbody>
                    {bomLines.map((l) => (
                      <tr key={l.key} className="border-t border-border/40">
                        <td className="px-2 py-1"><select value={l.material_id} onChange={(e) => updateBomLine(l.key, { material_id: e.target.value })} className={selectCls}><option value="">— choose —</option>{materialOptions}</select></td>
                        <td className="px-2 py-1"><input type="number" step="0.0001" min="0" value={l.quantity_per_unit} onChange={(e) => updateBomLine(l.key, { quantity_per_unit: e.target.value })} className={cellCls} /></td>
                        <td className="px-2 py-1"><input type="number" step="0.01" min="0" max="100" value={l.standard_loss_pct} onChange={(e) => updateBomLine(l.key, { standard_loss_pct: e.target.value })} className={cellCls} /></td>
                        <td className="px-2 py-1"><select value={l.loss_type} onChange={(e) => updateBomLine(l.key, { loss_type: e.target.value })} className={selectCls}>{WASTAGE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select></td>
                        <td className="px-2 py-1"><input type="text" value={l.notes} onChange={(e) => updateBomLine(l.key, { notes: e.target.value })} className={cellCls} /></td>
                        <td className="px-1 py-1"><button type="button" onClick={() => setBomLines((p) => p.filter((x) => x.key !== l.key))} className="text-textSecondary hover:text-danger"><X className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-textSecondary mt-1">Loss % grosses up the issue: 98 g needed at 2% loss means 100 g goes to the bench.</p>
            </div>

            <div>
              <label className="block text-xs text-textSecondary mb-1">Remarks</label>
              <input type="text" value={bomRemarks} onChange={(e) => setBomRemarks(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm" />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button type="button" onClick={() => setBomEditor(null)} className="px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5">Cancel</button>
              <button type="button" onClick={saveBom} disabled={bomSaving} className="flex items-center gap-2 px-5 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50">
                {bomSaving && <Loader2 className="w-4 h-4 animate-spin" />} Save BOM
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
