"use client";

import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Loader2, X, Edit, History, ArrowUpRight, ArrowDownLeft, Package, ExternalLink } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { apiClient, locationsApi, StockLocation } from '@/lib/api';

export default function InventoryPage() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Balances for one stock location, or every location when blank.
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationId, setLocationId] = useState('');

  // Item Ledger Modal State
  const [selectedLedger, setSelectedLedger] = useState<any | null>(null);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: 'Other',
    uom: 'gm',
    hsn_code: '71131910',
    gst_tax_rate: 3.00,
    opening_qty: 0,
    purity_standard: ''
  });

  const fetchInventoryData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/inventory/materials', { params: locationId ? { location_id: locationId } : {} });
      const list = Array.isArray(res.data) ? res.data : res.data?.materials || res.data?.data || [];
      setInventoryData(list);
    } catch (error) {
      console.error('Error fetching inventory data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventoryData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  useEffect(() => {
    locationsApi.list().then((res) => setLocations(res.data?.locations || [])).catch(() => setLocations([]));
  }, []);

  const selectedLocation = locations.find((l) => l.id === locationId);

  const openItemLedger = async (itemId: string) => {
    setLoadingLedger(true);
    setIsLedgerModalOpen(true);
    try {
      const res = await apiClient.get(`/inventory/items/${itemId}/ledger`);
      setSelectedLedger(res.data);
    } catch (err) {
      console.error('Error fetching item ledger:', err);
    } finally {
      setLoadingLedger(false);
    }
  };

  const handleVoucherClick = (entry: any) => {
    const docType = entry.source_document_type || entry.type || '';
    const docId = entry.source_document_id || entry.reference_id || '';

    if (docType === 'PurchaseInvoice' || docType.toLowerCase().includes('purchase')) {
      window.location.href = docId ? `/purchases?view_id=${docId}` : '/purchases';
    } else if (docType === 'SalesInvoice' || docType.toLowerCase().includes('sale')) {
      window.location.href = docId ? `/sales?view_id=${docId}` : '/sales';
    } else if (docType === 'ProductionOrder' || docType.toLowerCase().includes('production')) {
      window.location.href = docId ? `/manufacturing?order_id=${docId}` : '/manufacturing';
    } else {
      window.location.href = '/purchases';
    }
  };

  const handleOpenNewItem = () => {
    setEditingItem(null);
    setFormData({
      code: `ITEM-${Math.floor(1000 + Math.random() * 9000)}`,
      name: '',
      category: 'Other',
      uom: 'gm',
      hsn_code: '71131910',
      gst_tax_rate: 3.00,
      opening_qty: 0,
      purity_standard: ''
    });
    setIsDrawerOpen(true);
  };

  const handleEditItem = (item: any) => {
    setEditingItem(item);
    setFormData({
      code: item.code || '',
      name: item.name || '',
      category: item.category || 'General',
      uom: item.uom || 'gm',
      hsn_code: item.hsn_code || '71131910',
      gst_tax_rate: Number(item.gst_tax_rate ?? item.material_gst_rate ?? 3.0),
      opening_qty: Number(item.current_stock || 0),
      purity_standard: item.purity_standard || ''
    });
    setIsDrawerOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingItem) {
        await apiClient.patch(`/inventory/items/${editingItem.id}`, {
          name: formData.name,
          hsn_code: formData.hsn_code,
          gst_tax_rate: Number(formData.gst_tax_rate),
          reason: 'Item master edit'
        });
      } else {
        await apiClient.post('/inventory/items', {
          code: formData.code,
          name: formData.name,
          category: formData.category,
          uom: formData.uom,
          hsn_code: formData.hsn_code,
          gst_tax_rate: Number(formData.gst_tax_rate),
          opening_qty: Number(formData.opening_qty),
          purity_standard: formData.purity_standard,
          reason: 'Item master creation'
        });
      }
      setIsDrawerOpen(false);
      fetchInventoryData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save stock item');
    } finally {
      setSaving(false);
    }
  };

  const formatBalanceDisplay = (stock: number, uom: string) => {
    return `${Number(stock || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${uom || 'gm'}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Stock Items Master</h1>
          <p className="text-textSecondary mt-1">[CGST Rule 56(2)] Stock Register & Inward/Outward Ledger</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-textSecondary font-medium flex items-center gap-1">
              <Filter className="w-3 h-3 text-primary" /> Stock location
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none min-w-[200px]"
            >
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.code} — {l.name}{l.is_default ? ' (default)' : ''}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleOpenNewItem}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity self-end"
          >
            <Plus className="w-4 h-4" /> Add Stock Item
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-textSecondary flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-primary" /> Loading stock register...
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl p-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-textSecondary text-xs uppercase">
                  <th className="pb-3 font-medium">Code</th>
                  <th className="pb-3 font-medium">Material Name</th>
                  <th className="pb-3 font-medium">Category</th>
                  <th className="pb-3 font-medium">HSN Code</th>
                  <th className="pb-3 font-medium text-right">GST Rate</th>
                  <th className="pb-3 font-medium text-right">{selectedLocation ? `Stock at ${selectedLocation.code}` : 'Current Stock'}</th>
                  <th className="pb-3 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inventoryData.map((item) => (
                  <tr key={item.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 font-mono text-primary font-medium">{item.code}</td>
                    <td className="py-3 text-white font-medium">{item.name}</td>
                    <td className="py-3">
                      <Badge variant="default">{item.category || 'General'}</Badge>
                    </td>
                    <td className="py-3 font-mono text-textSecondary">{item.hsn_code || '—'}</td>
                    <td className="py-3 text-right font-mono text-white">
                      {Number(item.gst_tax_rate ?? item.material_gst_rate ?? 3.0)}%
                    </td>
                    <td className="py-3 text-right font-mono font-bold text-white">
                      {formatBalanceDisplay(item.current_stock, item.uom)}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => openItemLedger(item.id)}
                          className="px-2.5 py-1 text-xs border border-primary/30 text-primary hover:bg-primary/10 rounded-md transition-colors flex items-center gap-1"
                        >
                          <History className="w-3 h-3" /> Ledger
                        </button>
                        <button 
                          onClick={() => handleEditItem(item)}
                          className="p-1 text-textSecondary hover:text-white hover:bg-white/10 rounded-md transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Item Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface border-l border-border h-full p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h2 className="text-xl font-playfair font-bold text-white">
                {editingItem ? 'Edit Stock Item Master' : 'Create New Stock Item'}
              </h2>
              <button onClick={() => setIsDrawerOpen(false)} className="text-textSecondary hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4">
              <div>
                <label className="block text-sm text-textSecondary mb-1">Material Code *</label>
                <input 
                  type="text" 
                  disabled={Boolean(editingItem)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-white font-mono"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-textSecondary mb-1">Item Name *</label>
                <input 
                  type="text" 
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-white"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. 22K Gold Bullion / Emerald 5ct"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-textSecondary mb-1">Category</label>
                  <select 
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="Gold">Gold</option>
                    <option value="Silver">Silver</option>
                    <option value="Diamond">Diamond</option>
                    <option value="Ruby">Ruby</option>
                    <option value="Emerald">Emerald</option>
                    <option value="Sapphire">Sapphire</option>
                    <option value="Other_Gem">Other Gemstone</option>
                    <option value="Consumable">Consumable</option>
                    <option value="Finished_Good">Finished Good</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-textSecondary mb-1">Unit of Measure (UOM)</label>
                  <select 
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white"
                    value={formData.uom}
                    onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                  >
                    <option value="gm">Grams (gm)</option>
                    <option value="ct">Carats (ct)</option>
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="tola">Tola</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-textSecondary mb-1">HSN Code *</label>
                  <input 
                    type="text" 
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white font-mono"
                    value={formData.hsn_code}
                    onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-textSecondary mb-1">Material GST Rate (%) *</label>
                  <div className="flex gap-1">
                    {[0.25, 3.0, 5.0, 12.0, 18.0].map((rate) => (
                      <button 
                        key={rate}
                        type="button"
                        onClick={() => setFormData({ ...formData, gst_tax_rate: rate })}
                        className={`px-1.5 py-0.5 rounded border text-xs ${
                          Number(formData.gst_tax_rate) === rate 
                            ? 'bg-primary text-black border-primary font-bold' 
                            : 'border-border text-textSecondary hover:text-white'
                        }`}
                      >
                        {rate}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {!editingItem && (
                <div>
                  <label className="block text-sm text-textSecondary mb-1">Opening Stock Quantity</label>
                  <input 
                    type="number" 
                    step="any"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white font-mono"
                    value={formData.opening_qty}
                    onChange={(e) => setFormData({ ...formData, opening_qty: Number(e.target.value) })}
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button 
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="px-4 py-2 border border-border rounded-md text-textSecondary hover:text-white"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-gold-gradient text-background font-semibold rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Stock Master'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Ledger History Modal */}
      {isLedgerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl bg-surface border border-border rounded-xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-playfair font-bold text-white">Stock Movement Ledger</h3>
                <p className="text-xs text-textSecondary">[CGST Rule 56(2)] Immutable stock inward/outward trail. Click any reference to view voucher.</p>
              </div>
              <button onClick={() => setIsLedgerModalOpen(false)} className="text-textSecondary hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingLedger ? (
              <div className="py-12 text-center text-textSecondary">Loading stock movements...</div>
            ) : !selectedLedger || !selectedLedger.entries || selectedLedger.entries.length === 0 ? (
              <div className="py-12 text-center text-textSecondary">No movement entries recorded for this item.</div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-background border border-border rounded-lg flex justify-between text-xs text-textSecondary">
                  <span>Item: <strong className="text-white">{selectedLedger.material_name || selectedLedger.item?.name}</strong></span>
                  <span>Code: <strong className="text-primary font-mono">{selectedLedger.material_code || selectedLedger.item?.code}</strong></span>
                  <span>Current Stock: <strong className="text-emerald-400 font-mono">{formatBalanceDisplay(selectedLedger.closing_stock ?? selectedLedger.current_stock, selectedLedger.uom_code || selectedLedger.uom)}</strong></span>
                </div>

                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-textSecondary uppercase">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Transaction Type</th>
                      <th className="pb-2 font-medium">Direction</th>
                      <th className="pb-2 font-medium text-right">Quantity</th>
                      <th className="pb-2 font-medium text-right">Balance</th>
                      <th className="pb-2 font-medium">Voucher Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {selectedLedger.entries.map((entry: any, i: number) => (
                      <tr key={i} className="hover:bg-white/5">
                        <td className="py-2.5 text-white">{entry.entry_date || entry.date}</td>
                        <td className="py-2.5 text-textSecondary">{entry.transaction_type || entry.type}</td>
                        <td className="py-2.5">
                          <Badge variant={entry.direction === 'IN' || entry.direction === 'I' ? 'success' : 'danger'}>
                            {entry.direction === 'IN' || entry.direction === 'I' ? 'INWARD' : 'OUTWARD'}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-right text-white font-bold">{entry.quantity}</td>
                        <td className="py-2.5 text-right text-emerald-400 font-semibold">{entry.running_balance ?? '—'}</td>
                        <td className="py-2.5">
                          <button 
                            type="button" 
                            onClick={() => handleVoucherClick(entry)}
                            className="text-primary hover:underline hover:text-white flex items-center gap-1 font-semibold"
                          >
                            <span>{entry.source_document_no || entry.reference || entry.voucher_no || 'View Voucher'}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
