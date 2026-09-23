'use client';

import { useState, useEffect } from 'react';
import { Plus, Download, FileText, Trash2, X, Printer, Eye, Edit3, MapPin, Calculator, Upload, CheckCircle2, FileImage, AlertCircle, Search, Calendar } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import PartySelect from '@/components/ui/PartySelect';
import ItemSelect, { StockItem } from '@/components/ui/ItemSelect';
import { formatCurrency } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { financialYearStart } from '@/lib/fiscal';
import { useCompany, stateLabel, addressLine } from '@/lib/company';

interface LineItem {
  id: number;
  material_id: string;
  description: string;
  hsn_code: string;
  unit: string;
  gst_rate: number;
  quantity: number;
  gross_weight: number;
  net_weight: number;
  purity: number;
  rate: number;
  making_charges: number;
}

const INDIAN_STATES = [
  { code: '01', name: '01 - Jammu & Kashmir' },
  { code: '02', name: '02 - Himachal Pradesh' },
  { code: '03', name: '03 - Punjab' },
  { code: '04', name: '04 - Chandigarh' },
  { code: '05', name: '05 - Uttarakhand' },
  { code: '06', name: '06 - Haryana' },
  { code: '07', name: '07 - Delhi' },
  { code: '08', name: '08 - Rajasthan' },
  { code: '09', name: '09 - Uttar Pradesh' },
  { code: '10', name: '10 - Bihar' },
  { code: '11', name: '11 - Sikkim' },
  { code: '12', name: '12 - Arunachal Pradesh' },
  { code: '13', name: '13 - Nagaland' },
  { code: '14', name: '14 - Manipur' },
  { code: '15', name: '15 - Mizoram' },
  { code: '16', name: '16 - Tripura' },
  { code: '17', name: '17 - Meghalaya' },
  { code: '18', name: '18 - Assam' },
  { code: '19', name: '19 - West Bengal' },
  { code: '20', name: '20 - Jharkhand' },
  { code: '21', name: '21 - Odisha' },
  { code: '22', name: '22 - Chhattisgarh' },
  { code: '23', name: '23 - Madhya Pradesh' },
  { code: '24', name: '24 - Gujarat' },
  { code: '25', name: '25 - Daman & Diu' },
  { code: '26', name: '26 - Dadra & Nagar Haveli' },
  { code: '27', name: '27 - Maharashtra' },
  { code: '29', name: '29 - Karnataka' },
  { code: '30', name: '30 - Goa' },
  { code: '31', name: '31 - Lakshadweep' },
  { code: '32', name: '32 - Kerala' },
  { code: '33', name: '33 - Tamil Nadu' },
  { code: '34', name: '34 - Puducherry' },
  { code: '35', name: '35 - Andaman & Nicobar Islands' },
  { code: '36', name: '36 - Telangana' },
  { code: '37', name: '37 - Andhra Pradesh' },
  { code: '38', name: '38 - Ladakh' }
];

export default function PurchasesPage() {
  // Seller identity for the printed voucher, from the company master.
  const { company } = useCompany();
  const [fromDate, setFromDate] = useState(financialYearStart());
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Detailed Print View Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [selectedSupplierObj, setSelectedSupplierObj] = useState<any>(null);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [vendorInvoiceDate, setVendorInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRcm, setIsRcm] = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState('08');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [items, setItems] = useState<LineItem[]>([
    { id: 1, material_id: '', description: '', hsn_code: '71131910', unit: 'gm', gst_rate: 0, quantity: 1, gross_weight: 0, net_weight: 0, purity: 1.0, rate: 0, making_charges: 0 }
  ]);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      let url = `/purchases/invoices?from_date=${fromDate}&to_date=${toDate}`;
      if (selectedSupplierId) url += `&supplier_id=${selectedSupplierId}`;
      const res = await apiClient.get(url);
      let list = Array.isArray(res.data) ? res.data : [];

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        list = list.filter((inv: any) =>
          (inv.bill_no && inv.bill_no.toLowerCase().includes(q)) ||
          (inv.vendor_inv_no && inv.vendor_inv_no.toLowerCase().includes(q)) ||
          (inv.vendor_name && inv.vendor_name.toLowerCase().includes(q))
        );
      }

      setInvoices(list);
    } catch (err) {
      console.error('Failed to fetch purchases:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [fromDate, toDate, selectedSupplierId, searchQuery]);

  useEffect(() => {
    const init = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const viewId = searchParams.get('view_id');
      if (viewId) {
        try {
          const res = await apiClient.get(`/purchases/invoices/${viewId}`);
          if (res.data) {
            setSelectedInvoice(res.data);
            setIsViewModalOpen(true);
          }
        } catch (e) {
          console.error('Failed to open voucher by view_id:', e);
        }
      }
    };
    init();
  }, []);

  const resetForm = () => {
    setEditingInvoiceId(null);
    setSupplierId('');
    setSelectedSupplierObj(null);
    setSupplierInvoiceNo('');
    setVendorInvoiceDate(new Date().toISOString().split('T')[0]);
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setIsRcm(false);
    setPlaceOfSupply('08');
    setAttachmentUrl('');
    setItems([
      { id: 1, material_id: '', description: '', hsn_code: '71131910', unit: 'gm', gst_rate: 0, quantity: 1, gross_weight: 0, net_weight: 0, purity: 1.0, rate: 0, making_charges: 0 }
    ]);
  };

  // Sync selectedSupplierObj whenever supplierId changes
  useEffect(() => {
    if (!supplierId) {
      setSelectedSupplierObj(null);
      return;
    }
    let active = true;
    apiClient.get(`/parties/${supplierId}`)
      .then(res => {
        if (active && res.data) {
          const party = res.data;
          setSelectedSupplierObj(party);

          const suppG = (party.gstin || '').trim().toUpperCase();
          const isU = !suppG || suppG === 'UNREGISTERED' || suppG === 'N/A' || suppG === 'NONE';

          if (!isU) {
            setItems(prevItems => {
              prevItems.forEach(item => {
                if ((!item.gst_rate || item.gst_rate === 0) && item.material_id) {
                  apiClient.get(`/inventory/items/${item.material_id}`)
                    .then(mRes => {
                      if (mRes.data) {
                        const rVal = Number(mRes.data.gst_tax_rate ?? mRes.data.material_gst_rate ?? 0);
                        setItems(cur => cur.map(c => c.id === item.id ? { ...c, gst_rate: rVal } : c));
                      }
                    })
                    .catch(() => {});
                }
              });
              return prevItems;
            });
          }
        }
      })
      .catch(err => console.error('Failed to load party info by supplierId:', err));

    return () => { active = false; };
  }, [supplierId]);

  const openNewDrawer = () => {
    resetForm();
    setIsDrawerOpen(true);
  };

  const openEditDrawer = async (id: string) => {
    try {
      let inv: any = null;
      try {
        const res = await apiClient.get(`/purchases/invoices/${id}`);
        inv = res.data;
      } catch (e) {
        inv = invoices.find(i => i.id === id);
      }
      if (!inv) return;

      setEditingInvoiceId(inv.id);
      setSupplierId(inv.vendor_id || '');
      setSelectedSupplierObj({
        id: inv.vendor_id,
        name: inv.vendor_name,
        gstin: inv.vendor_gstin || 'Unregistered',
        state_code: inv.place_of_supply || '08'
      });
      setSupplierInvoiceNo(inv.vendor_inv_no || '');
      setVendorInvoiceDate(inv.vendor_invoice_date || inv.bill_date);
      setInvoiceDate(inv.bill_date);
      setIsRcm(Boolean(inv.is_rcm_applicable));
      setPlaceOfSupply(inv.place_of_supply || '08');
      setAttachmentUrl(inv.attachment_url || '');
      
      if (inv.items && inv.items.length > 0) {
        const loadedItems = await Promise.all(inv.items.map(async (i: any, idx: number) => {
          let rate = Number(i.gst_rate);
          if ((!rate || rate === 0) && i.material_id) {
            try {
              const mRes = await apiClient.get(`/inventory/items/${i.material_id}`);
              if (mRes.data) {
                rate = Number(mRes.data.gst_tax_rate ?? mRes.data.material_gst_rate ?? 0);
              }
            } catch (e) {}
          }
          return {
            id: idx + 1,
            material_id: i.material_id || '',
            description: i.material_name || i.description || '',
            hsn_code: i.hsn_sac_code || '71131910',
            unit: i.unit || 'gm',
            gst_rate: rate || 0,
            quantity: Number(i.quantity) || 1,
            gross_weight: Number(i.gross_weight) || 0,
            net_weight: Number(i.net_weight) || 0,
            purity: Number(i.purity) || 1.0,
            rate: Number(i.rate) || 0,
            making_charges: Number(i.making_charges) || 0
          };
        }));
        setItems(loadedItems);
      }
      setIsDrawerOpen(true);
    } catch (err) {
      console.error('Failed to load purchase voucher for edit:', err);
    }
  };

  const openDetailedView = async (id: string) => {
    try {
      const res = await apiClient.get(`/purchases/invoices/${id}`);
      if (res.data) {
        setSelectedInvoice(res.data);
        setIsViewModalOpen(true);
        return;
      }
    } catch (e) {
      console.warn('API get purchase detail fallback to local item array:', e);
    }
    const found = invoices.find(i => i.id === id);
    if (found) {
      setSelectedInvoice(found);
      setIsViewModalOpen(true);
    }
  };

  const addItem = () => {
    setItems([
      ...items,
      { id: Date.now(), material_id: '', description: '', hsn_code: '71131910', unit: 'gm', gst_rate: 0, quantity: 1, gross_weight: 0, net_weight: 0, purity: 1.0, rate: 0, making_charges: 0 }
    ]);
  };

  const removeItem = (id: number) => {
    if (items.length > 1) {
      setItems(items.filter(i => i.id !== id));
    }
  };

  const handleItemSelect = (id: number, stockItem?: StockItem) => {
    setItems(items.map(item => {
      if (item.id === id) {
        if (!stockItem) return item;
        const rateVal = Number(stockItem.material_gst_rate ?? stockItem.gst_tax_rate ?? 0);
        return {
          ...item,
          material_id: stockItem.id,
          description: stockItem.name,
          hsn_code: stockItem.hsn_code,
          unit: stockItem.unit || 'gm',
          gst_rate: rateVal
        };
      }
      return item;
    }));
  };

  const updateItemField = (id: number, field: keyof LineItem, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleBillScanUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const fakeUrl = `/uploads/${Date.now()}_${file.name}`;
      setAttachmentUrl(fakeUrl);
    }
  };

  // Multi-Rate GST Grouping Engine
  const isIntraState = placeOfSupply === '08';
  
  const suppGstin = (selectedSupplierObj?.gstin || '').trim().toUpperCase();
  const isUnregisteredSupplier = Boolean(
    selectedSupplierObj && (!suppGstin || suppGstin === 'UNREGISTERED' || suppGstin === 'N/A' || suppGstin === 'NONE')
  );

  // Calculations
  let totalTaxableSubtotal = 0;
  let totalTaxAmount = 0;
  const rateBuckets: Record<number, { taxable: number; taxAmount: number }> = {};

  items.forEach(item => {
    const qty = Number(item.quantity) || 1;
    const netWt = Number(item.net_weight) || 0;
    const rate = Number(item.rate) || 0;
    const making = Number(item.making_charges) || 0;

    const matVal = netWt > 0 ? (netWt * rate) : (qty * rate);
    const taxable = matVal + making;
    
    // Effective GST rate: 0% for URD, otherwise exact rate from Item Master
    const effectiveGstRate = (isUnregisteredSupplier && !isRcm)
      ? 0
      : Number(item.gst_rate ?? 0);

    const tax = taxable * (effectiveGstRate / 100.0);

    totalTaxableSubtotal += taxable;
    totalTaxAmount += tax;

    if (!rateBuckets[effectiveGstRate]) {
      rateBuckets[effectiveGstRate] = { taxable: 0, taxAmount: 0 };
    }
    rateBuckets[effectiveGstRate].taxable += taxable;
    rateBuckets[effectiveGstRate].taxAmount += tax;
  });

  const grandTotal = totalTaxableSubtotal + totalTaxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      alert('Please select a supplier from master records');
      return;
    }
    if (!isUnregisteredSupplier && !supplierInvoiceNo) {
      alert('Please enter supplier invoice number');
      return;
    }
    const validItems = items.filter(i => i.rate > 0);
    if (validItems.length === 0) {
      alert('Please enter rate and quantity for at least one purchase item');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        supplier_id: supplierId,
        invoice_date: invoiceDate,
        supplier_invoice_no: supplierInvoiceNo || `URD-${invoiceDate.replace(/-/g, '')}`,
        vendor_invoice_date: vendorInvoiceDate || invoiceDate,
        place_of_supply: placeOfSupply,
        attachment_url: attachmentUrl,
        is_rcm: isRcm,
        items: validItems.map(i => ({
          material_id: i.material_id,
          description: i.description,
          hsn_code: i.hsn_code,
          gst_rate: Number(i.gst_rate) || 0,
          quantity: Number(i.quantity) || 1.0,
          gross_weight: Number(i.gross_weight) || 0.0,
          net_weight: Number(i.net_weight) || 0.0,
          purity: Number(i.purity) || 1.0,
          rate: Number(i.rate) || 0.0,
          making_charges: Number(i.making_charges) || 0.0
        })),
        reason: editingInvoiceId ? 'Purchase voucher update' : 'Purchase voucher entry'
      };

      if (editingInvoiceId) {
        await apiClient.put(`/purchases/invoices/${editingInvoiceId}`, payload);
        alert('Purchase invoice updated successfully!');
      } else {
        await apiClient.post('/purchases/invoices', payload);
        alert('Purchase invoice recorded successfully!');
      }

      setIsDrawerOpen(false);
      resetForm();
      fetchInvoices();
    } catch (err: any) {
      console.error('Purchase post error:', err);
      alert(err.response?.data?.detail || 'Failed to record purchase invoice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Purchase Register & Inward ITC</h1>
          <p className="text-textSecondary mt-1">[CGST Rule 56(4)] Edit purchase bills, vendor dates, vendor bill scans & ITC tax register.</p>
        </div>
        <button 
          onClick={openNewDrawer}
          className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(212,168,67,0.3)]"
        >
          <Plus className="w-4 h-4" /> Record Purchase Invoice
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="glass-card p-4 flex flex-wrap items-center gap-4 border border-border">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary" />
          <input
            type="text"
            placeholder="Search by Bill No, Vendor Inv No, Supplier Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-textSecondary focus:outline-none focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
          />
          <span className="text-textSecondary text-xs">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
          />
        </div>

        <div className="w-[220px]">
          <PartySelect
            partyType="Supplier"
            value={selectedSupplierId}
            onChange={(partyId) => setSelectedSupplierId(partyId)}
            placeholder="Filter Supplier"
          />
        </div>

        {(searchQuery || selectedSupplierId || fromDate !== financialYearStart()) && (
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedSupplierId('');
              setFromDate(financialYearStart());
              setToDate(new Date().toISOString().split('T')[0]);
            }}
            className="px-3 py-2 bg-surface border border-border text-textSecondary hover:text-white rounded-lg text-xs font-semibold"
          >
            Reset Filters
          </button>
        )}
      </div>

      <div className="glass-card">
        <div className="p-4">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="animate-pulse space-y-4 py-4">
                <div className="h-8 bg-white/10 rounded w-full"></div>
                <div className="h-8 bg-white/10 rounded w-full"></div>
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-12 text-textSecondary">
                No purchase invoices recorded yet. Click 'Record Purchase Invoice' to enter your first inward bill.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-textSecondary border-b border-border">
                  <tr>
                    <th className="pb-3 font-medium">Bill No</th>
                    <th className="pb-3 font-medium">Vendor Inv Date</th>
                    <th className="pb-3 font-medium">Vendor Inv No</th>
                    <th className="pb-3 font-medium">Supplier / Vendor</th>
                    <th className="pb-3 font-medium">Place of Supply</th>
                    <th className="pb-3 font-medium text-right">Taxable Value</th>
                    <th className="pb-3 font-medium text-right">ITC Tax</th>
                    <th className="pb-3 font-medium text-right">Total Amount</th>
                    <th className="pb-3 font-medium">Scan</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv) => {
                    const itcTax = Number(inv.total_gst) || (Number(inv.cgst_amount || 0) + Number(inv.sgst_amount || 0) + Number(inv.igst_amount || 0));
                    return (
                      <tr key={inv.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-4 font-mono font-medium text-white">{inv.bill_no}</td>
                        <td className="py-4 text-textSecondary">{inv.vendor_invoice_date || inv.bill_date}</td>
                        <td className="py-4 font-mono text-textSecondary">{inv.vendor_inv_no}</td>
                        <td className="py-4 font-medium text-white">{inv.vendor_name}</td>
                        <td className="py-4 text-textSecondary text-xs">{inv.place_of_supply || '08 - Rajasthan'}</td>
                        <td className="py-4 text-right text-textSecondary">{formatCurrency(inv.subtotal_value || 0)}</td>
                        <td className="py-4 text-right text-emerald-400 font-mono font-semibold">{formatCurrency(itcTax)}</td>
                        <td className="py-4 text-right font-medium text-primary">{formatCurrency(inv.grand_total || 0)}</td>
                        <td className="py-4">
                          {inv.attachment_url ? (
                            <span className="text-emerald-400 flex items-center gap-1 text-xs font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Attached
                            </span>
                          ) : (
                            <span className="text-textSecondary text-xs">No scan</span>
                          )}
                        </td>
                        <td className="py-4 flex items-center gap-2">
                          <button 
                            onClick={() => openEditDrawer(inv.id)}
                            className="px-2 py-1 bg-white/10 text-white border border-border rounded hover:bg-white/20 text-xs font-medium flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-primary" /> Edit
                          </button>
                          <button 
                            onClick={() => openDetailedView(inv.id)}
                            className="px-2 py-1 bg-primary/20 text-primary border border-primary/30 rounded hover:bg-primary/30 text-xs font-medium flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" /> View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Record / Edit Purchase Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
          <div className="w-[660px] h-full bg-surface border-l border-border p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-2xl font-playfair font-bold text-white">
                  {editingInvoiceId ? 'Edit Purchase Voucher' : 'Record Purchase Voucher'}
                </h2>
                <p className="text-xs text-textSecondary mt-0.5">Inward commodity bill, vendor bill date & Input Tax Credit (ITC)</p>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="text-textSecondary hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs text-textSecondary font-medium">Select Supplier (Sundry Creditors) *</label>
                <PartySelect 
                  partyType="Supplier" 
                  value={supplierId}
                  onChange={(id, partyObj) => {
                    setSupplierId(id);
                    setSelectedSupplierObj(partyObj || null);
                    if (partyObj?.state_code) {
                      setPlaceOfSupply(partyObj.state_code);
                    }
                  }} 
                  placeholder="Search supplier name..." 
                />
                {selectedSupplierObj && ((selectedSupplierObj.gstin || '').trim().toUpperCase() === 'UNREGISTERED' || !selectedSupplierObj.gstin) && (
                  <div className="mt-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between text-xs text-amber-400 font-medium">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>Unregistered Supplier (URD): Forward GST Tax = ₹0.00 & ITC Ineligible [CGST Sec 9(4)]</span>
                    </div>
                    <Badge variant="warning">URD Purchase</Badge>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-textSecondary font-medium">
                    Vendor Invoice No {isUnregisteredSupplier ? '(Optional for URD)' : '*'}
                  </label>
                  <input 
                    type="text" 
                    value={supplierInvoiceNo}
                    onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                    required={!isUnregisteredSupplier}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none font-mono"
                    placeholder={isUnregisteredSupplier ? 'Optional for URD' : 'INV/2026/001'}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-textSecondary font-medium">
                    Vendor Invoice Date {isUnregisteredSupplier ? '(Optional for URD)' : '*'}
                  </label>
                  <input 
                    type="date" 
                    value={vendorInvoiceDate}
                    onChange={(e) => setVendorInvoiceDate(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-textSecondary font-medium">Posting Date *</label>
                  <input 
                    type="date" 
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-textSecondary font-medium flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-primary" /> Place of Supply (Supplier State) *
                </label>
                <select
                  value={placeOfSupply}
                  onChange={(e) => setPlaceOfSupply(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none font-medium"
                >
                  {INDIAN_STATES.map(s => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Vendor Invoice Scan Upload */}
              <div className="p-3 bg-background border border-border rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <FileImage className="w-4 h-4 text-primary" /> Attach Original Vendor Bill Image / Scan (Optional)
                  </label>
                  {attachmentUrl && (
                    <span className="text-emerald-400 flex items-center gap-1 text-[11px] font-medium">
                      <CheckCircle2 className="w-3 h-3" /> Attached
                    </span>
                  )}
                </div>
                <input 
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleBillScanUpload}
                  className="text-xs text-textSecondary file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:bg-white/10 file:text-white hover:file:bg-white/20"
                />
                {attachmentUrl && (
                  <img src={attachmentUrl} alt="Vendor Bill Scan Preview" className="h-24 w-full object-cover rounded border border-border" />
                )}
              </div>

              <div className="p-3 bg-white/5 border border-border rounded-lg flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={isRcm}
                    onChange={(e) => setIsRcm(e.target.checked)}
                    className="rounded border-border bg-surface text-primary focus:ring-primary/20 w-4 h-4"
                  />
                  <span className="text-xs text-white font-medium">Old Gold / RCM Purchase (Reverse Charge Mechanism - Notif 13/2017)</span>
                </label>
              </div>

              {/* Items Section */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-playfair font-semibold text-white">Purchased Line Items</h4>
                  <button type="button" onClick={addItem} className="text-xs text-primary flex items-center gap-1 hover:text-white font-medium">
                    <Plus className="w-4 h-4" /> Add Line
                  </button>
                </div>

                <div className="space-y-3">
                  {items.map((item, idx) => {
                    const qty = Number(item.quantity) || 1;
                    const netWt = Number(item.net_weight) || 0;
                    const rate = Number(item.rate) || 0;
                    const making = Number(item.making_charges) || 0;
                    const lineMatValue = netWt > 0 ? (netWt * rate) : (qty * rate);

                    return (
                      <div key={item.id} className="p-4 bg-surface/50 border border-border rounded-xl space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-primary font-semibold">Item #{idx + 1}</span>
                          {items.length > 1 && (
                            <button type="button" onClick={() => removeItem(item.id)} className="text-textSecondary hover:text-danger">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs text-textSecondary">Select Stock Item Master *</label>
                          <ItemSelect
                            value={item.material_id}
                            onChange={(id, stockItem) => handleItemSelect(item.id, stockItem)}
                            placeholder="Search gold, gems, silver master..."
                          />
                        </div>

                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <label className="text-[11px] text-textSecondary">Qty ({item.unit || 'Pcs'})</label>
                            <input 
                              type="number" 
                              value={item.quantity || ''}
                              onChange={(e) => updateItemField(item.id, 'quantity', Number(e.target.value))}
                              className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-white focus:border-primary outline-none"
                              placeholder="1.0"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-textSecondary">Gross Wt ({item.unit || 'gm'})</label>
                            <input 
                              type="number" 
                              value={item.gross_weight || ''}
                              onChange={(e) => updateItemField(item.id, 'gross_weight', Number(e.target.value))}
                              className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-white focus:border-primary outline-none"
                              placeholder="Optional"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-textSecondary">Net Wt ({item.unit || 'gm'})</label>
                            <input 
                              type="number" 
                              value={item.net_weight || ''}
                              onChange={(e) => updateItemField(item.id, 'net_weight', Number(e.target.value))}
                              className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-white focus:border-primary outline-none"
                              placeholder="Optional"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-textSecondary">Rate / {netWt > 0 ? (item.unit || 'gm') : (item.unit || 'Pcs')} (₹) *</label>
                            <input 
                              type="number" 
                              value={item.rate || ''}
                              onChange={(e) => updateItemField(item.id, 'rate', Number(e.target.value))}
                              className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-white focus:border-primary outline-none font-mono"
                              placeholder="0.00"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-[11px] text-primary font-medium">GST Rate (Item Master 🔒)</label>
                            <input 
                              type="text" 
                              readOnly
                              disabled
                              value={isUnregisteredSupplier && !isRcm ? '0% (URD)' : `${Number(item.gst_rate ?? 0)}%`}
                              className="w-full bg-white/5 border border-primary/30 rounded px-2 py-1 text-xs text-primary font-mono font-bold cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-textSecondary">Making Charges (₹ Optional)</label>
                            <input 
                              type="number" 
                              value={item.making_charges || ''}
                              onChange={(e) => updateItemField(item.id, 'making_charges', Number(e.target.value))}
                              className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-white focus:border-primary outline-none"
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-textSecondary">HSN Code (Item Master 🔒)</label>
                            <input 
                              type="text" 
                              readOnly
                              disabled
                              value={item.hsn_code}
                              className="w-full bg-white/5 border border-border rounded px-2 py-1 text-xs text-textSecondary font-mono cursor-not-allowed"
                            />
                          </div>
                        </div>

                        {/* Live Calculation Formula Hint */}
                        <div className="text-[11px] text-textSecondary bg-white/5 p-2 rounded flex justify-between items-center font-mono">
                          <span>
                            Formula: {netWt > 0 ? `${netWt} ${item.unit || 'gm'} Net Wt × ${formatCurrency(rate)}` : `${qty} ${item.unit || 'Pcs'} Qty × ${formatCurrency(rate)}`}
                          </span>
                          <span className="text-primary font-semibold">Line Value: {formatCurrency(lineMatValue + making)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Multi-Rate State GST Breakdown Box */}
              <div className="p-4 bg-background border border-primary/30 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-white">Multi-Rate Itemized GST Breakdown</span>
                  </div>
                  <Badge variant={isIntraState ? 'success' : 'warning'}>
                    {isIntraState ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}
                  </Badge>
                </div>

                <div className="space-y-2 text-xs text-textSecondary">
                  <div className="flex justify-between text-white font-medium">
                    <span>Taxable Material Subtotal:</span>
                    <span className="font-mono">{formatCurrency(totalTaxableSubtotal)}</span>
                  </div>

                  {isUnregisteredSupplier && !isRcm ? (
                    <div className="p-3 bg-surface/80 border border-amber-500/30 rounded-lg space-y-1">
                      <div className="flex justify-between text-white font-medium text-xs">
                        <span>Forward Charge GST Tax (URD):</span>
                        <span className="font-mono text-emerald-400 font-bold">₹0.00</span>
                      </div>
                      <p className="text-[11px] text-textSecondary">
                        Supplier is Unregistered — No GST is charged on bill and 0 ITC is credited under CGST Section 9(4).
                      </p>
                    </div>
                  ) : (
                    Object.entries(rateBuckets).map(([rateStr, bucket]) => {
                      const rate = Number(rateStr);
                      const halfRate = rate / 2;
                      return (
                        <div key={rateStr} className="p-2 bg-surface/50 border border-border/50 rounded-lg space-y-1">
                          <div className="flex justify-between text-textSecondary font-medium">
                            <span>Items @ {rate}% Tax Rate:</span>
                            <span className="font-mono text-white">Taxable: {formatCurrency(bucket.taxable)}</span>
                          </div>
                          {isIntraState ? (
                            <div className="flex justify-between text-emerald-400 text-[11px]">
                              <span>CGST ({halfRate}%): {formatCurrency(bucket.taxAmount / 2)}</span>
                              <span>SGST ({halfRate}%): {formatCurrency(bucket.taxAmount / 2)}</span>
                            </div>
                          ) : (
                            <div className="flex justify-between text-amber-400 text-[11px]">
                              <span>IGST ({rate}%):</span>
                              <span>{formatCurrency(bucket.taxAmount)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  <div className="flex justify-between text-white border-t border-border pt-2 text-sm font-bold">
                    <span>Grand Total Invoice Amount:</span>
                    <span className="text-primary font-mono">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button type="button" onClick={() => setIsDrawerOpen(false)} className="px-4 py-2 border border-border text-white text-sm rounded-lg hover:bg-surface">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-6 py-2 bg-gold-gradient text-background font-semibold text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
                  {submitting ? 'Saving...' : (editingInvoiceId ? 'Update Purchase Invoice' : 'Record Purchase Invoice')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detailed Purchase Voucher Print Modal */}
      {isViewModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div id="printable-voucher" className="printable-area bg-white text-black rounded-xl max-w-4xl w-full p-8 space-y-6 shadow-2xl relative">
            <div className="flex justify-between items-center border-b border-gray-200 pb-4 print:hidden">
              <div>
                <h3 className="text-xl font-bold text-gray-900 uppercase tracking-wide">STATUTORY PURCHASE VOUCHER / INWARD BILL</h3>
                <p className="text-xs text-gray-500">Issued under CGST Rule 56(4) — Commodity Inward & ITC Register</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const { generatePurchaseVoucherPDF } = require('@/lib/vectorPdfEngine');
                    generatePurchaseVoucherPDF(selectedInvoice, 'download', company);
                  }}
                  className="px-4 py-2 bg-[#D4A843] text-black font-bold text-xs uppercase rounded hover:bg-[#b88f34] transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Printer className="w-4 h-4" /> Download Vector PDF
                </button>
                <button onClick={() => setIsViewModalOpen(false)} className="text-gray-400 hover:text-black">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Header Voucher Box */}
            <div className="grid grid-cols-2 gap-6 border border-gray-300 p-4 rounded-lg bg-gray-50 text-xs">
              <div className="space-y-1">
                {/* The buyer named here is the person claiming the input tax
                    credit on this document. It was a hardcoded literal -- a
                    different legal entity, an address in Sitapura, state 08 --
                    regardless of which company was signed in. */}
                <p className="font-bold text-gray-900 text-sm">
                  {company?.legal_name || company?.name || '— COMPANY NOT CONFIGURED —'}
                </p>
                {addressLine(company) && <p className="text-gray-600">{addressLine(company)}</p>}
                <p className="text-gray-700">
                  {company?.gstin && (<><strong>GSTIN:</strong> <span className="font-mono">{company.gstin}</span> | </>)}
                  <strong>State Code:</strong> {stateLabel(company) || '—'} | <strong>HSN Chapter:</strong> 71 (Precious Metals & Gems)
                </p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-gray-800"><strong>Bill No:</strong> <span className="font-mono font-bold text-gray-900">{selectedInvoice.bill_no}</span></p>
                <p className="text-gray-800"><strong>Vendor Inv No:</strong> <span className="font-mono text-gray-900">{selectedInvoice.vendor_inv_no}</span></p>
                <p className="text-gray-800"><strong>Vendor Inv Date:</strong> <span className="font-mono text-gray-900">{selectedInvoice.vendor_invoice_date || selectedInvoice.bill_date}</span></p>
                <p className="text-gray-800"><strong>Posting Date:</strong> {selectedInvoice.bill_date}</p>
                <p className="text-gray-800"><strong>Place of Supply:</strong> {selectedInvoice.place_of_supply || '—'}</p>
              </div>
            </div>

            {/* Vendor Box */}
            <div className="border border-gray-300 p-4 rounded-lg bg-gray-50 text-xs space-y-1">
              <p className="font-bold text-gray-700 uppercase tracking-wider text-[10px]">VENDOR / SUPPLIER (SUNDRY CREDITORS)</p>
              <p className="font-bold text-gray-900 text-sm">{selectedInvoice.vendor_name || '—'}</p>
              {/* No invented address: "Main Bazaar, Jaipur, Rajasthan" was printed for any supplier without one on file. */}
              <p className="text-gray-600">{[selectedInvoice.address_line1, selectedInvoice.city].filter(Boolean).join(', ') || '—'}</p>
              <p className="text-gray-800"><strong>GSTIN:</strong> {selectedInvoice.vendor_gstin || 'Unregistered / Exempt'}</p>
            </div>

            {/* Vendor Bill Scan Attachment Display */}
            {selectedInvoice.attachment_url && (
              <div className="border border-gray-300 p-4 rounded-lg bg-gray-50 space-y-2">
                <p className="font-bold text-gray-800 text-xs flex items-center gap-1.5">
                  <FileImage className="w-4 h-4 text-[#D4A843]" /> Attached Vendor Bill Scan Image
                </p>
                <img src={selectedInvoice.attachment_url} alt="Vendor Bill Scan" className="max-h-56 rounded border border-gray-300 object-contain" />
              </div>
            )}

            {/* Itemized Table */}
            <table className="w-full text-left text-xs border border-gray-300">
              <thead className="bg-gray-100 text-gray-800 border-b border-gray-300">
                <tr>
                  <th className="p-2 border-r border-gray-300">#</th>
                  <th className="p-2 border-r border-gray-300">Item Description</th>
                  <th className="p-2 border-r border-gray-300 text-center">HSN/SAC</th>
                  <th className="p-2 border-r border-gray-300 text-center">GST Rate</th>
                  <th className="p-2 border-r border-gray-300 text-right">Qty / Wt</th>
                  <th className="p-2 border-r border-gray-300 text-right">Rate (₹)</th>
                  <th className="p-2 text-right">Taxable Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {(selectedInvoice.items || []).map((item: any, idx: number) => (
                  <tr key={idx}>
                    <td className="p-2 border-r border-gray-300 text-center">{idx + 1}</td>
                    <td className="p-2 border-r border-gray-300 font-medium text-gray-900">{item.material_name || item.description || 'Stock Material Item'}</td>
                    <td className="p-2 border-r border-gray-300 text-center font-mono">{item.hsn_sac_code || '71131910'}</td>
                    <td className="p-2 border-r border-gray-300 text-center font-mono font-bold">{item.gst_rate || 3}%</td>
                    <td className="p-2 border-r border-gray-300 text-right">{item.net_weight > 0 ? `${item.net_weight} ${item.unit || 'gm'}` : `${item.quantity || 1.0} ${item.unit || 'pcs'}`}</td>
                    <td className="p-2 border-r border-gray-300 text-right">{formatCurrency(item.rate || 0)}</td>
                    <td className="p-2 text-right font-medium text-gray-900">{formatCurrency(item.material_value || item.amount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals & Tax Summary */}
            <div className="flex justify-end text-xs">
              <div className="w-80 border border-gray-300 rounded-lg p-4 space-y-2 bg-gray-50">
                <div className="flex justify-between text-gray-700">
                  <span>Subtotal Value:</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(selectedInvoice.subtotal_value || 0)}</span>
                </div>
                {selectedInvoice.place_of_supply && selectedInvoice.place_of_supply !== '08' ? (
                  <div className="flex justify-between text-gray-700">
                    <span>IGST Input Tax:</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(selectedInvoice.igst_amount || selectedInvoice.total_gst || 0)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-gray-700">
                      <span>CGST Input Tax:</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(selectedInvoice.cgst_amount || (selectedInvoice.total_gst ? selectedInvoice.total_gst / 2 : 0))}</span>
                    </div>
                    <div className="flex justify-between text-gray-700">
                      <span>SGST Input Tax:</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(selectedInvoice.sgst_amount || (selectedInvoice.total_gst ? selectedInvoice.total_gst / 2 : 0))}</span>
                    </div>
                  </>
                )}
                <div className="border-t border-gray-300 pt-2 flex justify-between font-bold text-sm text-gray-900">
                  <span>Grand Total Payable:</span>
                  <span className="text-[#D4A843]">{formatCurrency(selectedInvoice.grand_total || 0)}</span>
                </div>
              </div>
            </div>

            {/* Footer Signatory */}
            <div className="border-t border-gray-300 pt-6 flex justify-between items-end text-xs text-gray-600">
              <div>
                <p>1. Inward stock verified against physical weighment & assay.</p>
                <p>2. ITC claimed under CGST Section 16(2).</p>
              </div>
              <div className="text-center">
                <div className="h-12"></div>
                <p className="font-bold text-gray-900">Authorized Signatory</p>
                <p className="text-[10px] text-gray-500">For {company?.legal_name || company?.name || "—"}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
