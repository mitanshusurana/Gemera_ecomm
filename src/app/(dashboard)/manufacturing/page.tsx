"use client";

import { useState, useEffect } from 'react';
import { Plus, CheckCircle, Clock, PlayCircle, CheckSquare, Loader2 } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ProductionOrderForm from '@/components/forms/ProductionOrderForm';

import { apiClient } from '@/lib/api';

export default function ManufacturingPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productionData, setProductionData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Complete Order Modal State
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [goldMaterialId, setGoldMaterialId] = useState('');
  const [materialRate, setMaterialRate] = useState('7200.00');
  const [issuedWeight, setIssuedWeight] = useState('');
  const [producedWeight, setProducedWeight] = useState('');
  const [hallmarkNo, setHallmarkNo] = useState('');
  const [wastageQty, setWastageQty] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');

  const fetchProductionData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/production/orders');
      const list = Array.isArray(res.data) ? res.data : res.data?.orders || res.data?.data || [];
      setProductionData(list);
    } catch (error) {
      console.error('Error fetching production data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductionData();
    // Fetch materials for completion dropdown
    apiClient.get('/inventory/materials')
      .then(res => {
        const mats = Array.isArray(res.data) ? res.data : res.data?.materials || [];
        setMaterials(mats);
        const gold = mats.find((m: any) => m.category === 'Gold' || m.name?.toLowerCase().includes('gold'));
        if (gold) {
          setGoldMaterialId(gold.id);
          if (gold.standard_rate) setMaterialRate(String(gold.standard_rate));
        } else if (mats.length > 0) {
          setGoldMaterialId(mats[0].id);
        }
      })
      .catch(console.error);
  }, []);

  const openCompleteModal = (order: any) => {
    setSelectedOrder(order);
    const planned = Number(order.planned_qty || 1);
    setIssuedWeight(String(planned));
    setProducedWeight(String((planned * 0.975).toFixed(3)));
    setWastageQty(String((planned * 0.025).toFixed(3)));
    setHallmarkNo(`BIS-HM-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setIsCompleteModalOpen(true);
  };

  const handleIssuedChange = (val: string) => {
    setIssuedWeight(val);
    const issued = parseFloat(val) || 0;
    const produced = parseFloat(producedWeight) || 0;
    if (issued > produced && produced > 0) {
      setWastageQty((issued - produced).toFixed(3));
    }
  };

  const handleProducedChange = (val: string) => {
    setProducedWeight(val);
    const issued = parseFloat(issuedWeight) || 0;
    const produced = parseFloat(val) || 0;
    if (issued >= produced) {
      setWastageQty((issued - produced).toFixed(3));
    }
  };

  const handleCompleteOrder = async () => {
    if (!selectedOrder || !goldMaterialId) return;
    const issued = parseFloat(issuedWeight);
    const produced = parseFloat(producedWeight);
    const wastage = parseFloat(wastageQty) || 0;
    const rate = parseFloat(materialRate) || 7200.0;

    if (!issued || issued <= 0) {
      setCompleteError('Please enter valid issued raw material weight');
      return;
    }
    if (!produced || produced <= 0) {
      setCompleteError('Please enter valid produced finished goods weight');
      return;
    }

    setCompleting(true);
    setCompleteError('');

    try {
      const payload = {
        completion_date: new Date().toISOString().split('T')[0],
        consumption_lines: [
          {
            material_id: goldMaterialId,
            qty_issued: issued,
            gross_weight: issued,
            net_weight: issued,
            purity: 0.916,
            rate: rate,
            remarks: 'Raw gold/gem material issued to karigar'
          }
        ],
        output_lines: [
          {
            material_id: goldMaterialId,
            qty_produced: Number(selectedOrder.planned_qty || 1),
            gross_weight: produced,
            net_weight: produced,
            hallmark_no: hallmarkNo || `BIS-${Date.now()}`,
            quality_grade: 'A+',
            valuation_rate: rate * produced
          }
        ],
        wastage_lines: [
          {
            material_id: goldMaterialId,
            wastage_type: 'Melting_Loss',
            qty_lost: wastage,
            loss_pct: issued > 0 ? (wastage / issued) * 100 : 0,
            rate: rate,
            remarks: 'Standard bench melting & polishing loss'
          }
        ],
        reason: 'Production Order Completion [CGST-R56-12]'
      };

      await apiClient.post(`/production/orders/${selectedOrder.id}/complete`, payload);
      setIsCompleteModalOpen(false);
      fetchProductionData();
    } catch (err: any) {
      console.error('Failed to complete production order:', err);
      setCompleteError(err.response?.data?.detail || 'Failed to complete production order');
    } finally {
      setCompleting(false);
    }
  };


  const columns = [
    { header: 'Order No', accessorKey: 'order_no', cell: (item: any) => <span className="font-medium text-white font-mono">{item.order_no || item.id}</span> },
    { header: 'Product', accessorKey: 'product_name', cell: (item: any) => item.product_name || item.product },
    { header: 'Planned Qty', accessorKey: 'planned_qty', cell: (item: any) => `${item.planned_qty || 1} pcs` },
    { header: 'Date', accessorKey: 'order_date', cell: (item: any) => new Date(item.order_date || item.date || item.created_at).toLocaleDateString('en-IN') },
    { header: 'Status', accessorKey: 'status', cell: (item: any) => {
      const status = item.status || 'Draft';
      return (
        <Badge variant={status === 'Completed' ? 'success' : status === 'In_Progress' || status === 'In Progress' ? 'warning' : 'default'}>
          {status}
        </Badge>
      );
    }},
    { header: 'Actions', accessorKey: 'actions', cell: (item: any) => (
      item.status !== 'Completed' ? (
        <button
          onClick={() => openCompleteModal(item)}
          className="flex items-center gap-1.5 px-3 py-1 bg-primary text-black font-semibold rounded text-xs hover:bg-primary/90 transition-colors shadow-sm"
        >
          <CheckSquare className="w-3.5 h-3.5" /> Complete & Post Journal
        </button>
      ) : (
        <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
          <CheckCircle className="w-3.5 h-3.5" /> Journal Posted
        </span>
      )
    )}
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Production & Manufacturing [CGST-R56-12]</h1>
          <p className="text-textSecondary mt-1">Manage manufacturing orders, artisan accounts, and statutory 4-leg manufacturing journals.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(212,168,67,0.3)]"
        >
          <Plus className="w-4 h-4" /> New Order
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 border-l-4 border-l-warning">
          <h3 className="text-sm font-medium text-textSecondary uppercase">Active Orders</h3>
          <p className="text-3xl font-playfair font-bold text-white mt-2">{productionData.filter(o => o.status === 'In_Progress' || o.status === 'In Progress').length || 0}</p>
        </div>
        <div className="glass-card p-6 border-l-4 border-l-primary">
          <h3 className="text-sm font-medium text-textSecondary uppercase">Completed Orders</h3>
          <p className="text-3xl font-playfair font-bold text-white mt-2">
            {productionData.filter(o => o.status === 'Completed').length || 0}
          </p>
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

      {/* New Order Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Create & Release Production Order"
      >
        <ProductionOrderForm 
          onSuccess={() => {
            setIsModalOpen(false);
            fetchProductionData();
          }}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      {/* Complete Order Modal */}
      {isCompleteModalOpen && selectedOrder && (
        <Modal
          isOpen={isCompleteModalOpen}
          onClose={() => setIsCompleteModalOpen(false)}
          title={`Complete Order: ${selectedOrder.order_no} (${selectedOrder.product_name})`}
        >
          <div className="space-y-4 text-sm">
            {completeError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs">
                {completeError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">Raw Material Issued (Gold / Gem)</label>
                <select
                  value={goldMaterialId}
                  onChange={(e) => setGoldMaterialId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white"
                >
                  {materials.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.code} — {m.name} ({m.category})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">Gold Valuation Rate (₹/gm)</label>
                <input
                  type="number"
                  step="0.01"
                  value={materialRate}
                  onChange={(e) => setMaterialRate(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white font-mono"
                  placeholder="7200.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">Issued Gold Weight (gm)</label>
                <input
                  type="number"
                  step="0.001"
                  value={issuedWeight}
                  onChange={(e) => handleIssuedChange(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white font-mono"
                  placeholder="e.g. 50.000"
                />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">Produced Finished Weight (gm)</label>
                <input
                  type="number"
                  step="0.001"
                  value={producedWeight}
                  onChange={(e) => handleProducedChange(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white font-mono"
                  placeholder="e.g. 48.750"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">Melting & Polishing Loss / Wastage (gm)</label>
                <input
                  type="number"
                  step="0.001"
                  value={wastageQty}
                  onChange={(e) => setWastageQty(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white font-mono"
                  placeholder="Auto-calculated (e.g. 1.250)"
                />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1 font-medium">BIS Hallmark Certificate No</label>
                <input
                  type="text"
                  value={hallmarkNo}
                  onChange={(e) => setHallmarkNo(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white font-mono uppercase"
                  placeholder="BIS-HM-2026-XXXX"
                />
              </div>
            </div>

            <div className="p-3 bg-surface border border-border rounded-lg text-xs text-textSecondary space-y-1">
              <strong className="text-white block font-medium">Statutory Compliance Action [CGST Rule 56(12) & Section 44AA]:</strong>
              <p>• Dr. WIP Account & Cr. Raw Material Stock (Gold)</p>
              <p>• Dr. Finished Goods Stock & Cr. WIP Account</p>
              <p>• Dr. Manufacturing Wastage Loss Account & Cr. Raw Material Stock</p>
              <p>• Updates Stock Register with Inward Finished Goods and Outward Raw Materials</p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                onClick={() => setIsCompleteModalOpen(false)}
                className="px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteOrder}
                disabled={completing}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {completing && <Loader2 className="w-4 h-4 animate-spin" />}
                Post Manufacturing Journal
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
