"use client";

import { useState } from 'react';
import { Plus, Trash2, MapPin, Calculator } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import Badge from '@/components/ui/Badge';
import PartySelect from '@/components/ui/PartySelect';
import ItemSelect, { StockItem } from '@/components/ui/ItemSelect';
import { apiClient } from '@/lib/api';

interface LineItem {
  id: number;
  material_id: string;
  name: string;
  code: string;
  hsn_code: string;
  material_gst_rate: number;
  materialValue: number;
  makingCharges: number;
}

const INDIAN_STATES = [
  { code: '08', name: '08 - Rajasthan (Home State)' },
  { code: '33', name: '33 - Tamil Nadu (Inter-State)' },
  { code: '27', name: '27 - Maharashtra (Inter-State)' },
  { code: '07', name: '07 - Delhi (Inter-State)' },
  { code: '24', name: '24 - Gujarat (Inter-State)' },
  { code: '09', name: '09 - Uttar Pradesh (Inter-State)' },
  { code: '19', name: '19 - West Bengal (Inter-State)' },
  { code: '06', name: '06 - Haryana (Inter-State)' },
  { code: '23', name: '23 - Madhya Pradesh (Inter-State)' },
];

interface SalesInvoiceFormProps {
  /** Called after a successful create so the caller can close and refresh. */
  onSuccess?: () => void;
}

export default function SalesInvoiceForm({ onSuccess }: SalesInvoiceFormProps) {
  const [customerId, setCustomerId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState('08');
  const [isInterState, setIsInterState] = useState(false);
  const [items, setItems] = useState<LineItem[]>([
    { id: 1, material_id: '', name: '', code: '', hsn_code: '71131910', material_gst_rate: 3.0, materialValue: 0, makingCharges: 0 }
  ]);

  const handlePlaceOfSupplyChange = (code: string) => {
    setPlaceOfSupply(code);
    setIsInterState(code !== '08');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      alert('Please select a customer from master');
      return;
    }
    const validLines = items.filter(i => i.material_id && (i.materialValue > 0 || i.makingCharges > 0));
    if (validLines.length === 0) {
      alert('Please select at least one inventory item and enter material value or making charges');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/sales/invoices', {
        customer_id: customerId,
        invoice_date: new Date().toISOString().split('T')[0],
        place_of_supply: placeOfSupply,
        lines: validLines.map(i => ({
          material_id: i.material_id,
          description: i.name,
          hsn_sac_code: i.hsn_code,
          material_value: Number(i.materialValue) || 0,
          making_charges: Number(i.makingCharges) || 0,
          quantity: 1.0
        })),
        reason: 'Sales invoice creation'
      });
      if (onSuccess) {
        onSuccess();
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      console.error('Invoice create error:', err);
      alert(err.response?.data?.detail || 'Failed to create sales invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const addItem = () => {
    setItems([
      ...items,
      { id: Date.now(), material_id: '', name: '', code: '', hsn_code: '71131910', material_gst_rate: 3.0, materialValue: 0, makingCharges: 0 }
    ]);
  };

  const removeItem = (id: number) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const handleItemSelect = (id: number, stockItem?: StockItem) => {
    setItems(items.map(item => {
      if (item.id === id) {
        if (!stockItem) {
          return { ...item, material_id: '', name: '', code: '', hsn_code: '71131910', material_gst_rate: 3.0 };
        }
        return {
          ...item,
          material_id: stockItem.id,
          name: stockItem.name,
          code: stockItem.code,
          hsn_code: stockItem.hsn_code,
          material_gst_rate: stockItem.material_gst_rate
        };
      }
      return item;
    }));
  };

  const updateItemField = (id: number, field: 'materialValue' | 'makingCharges', value: number) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  // Multi-Rate GST Grouping Engine
  const rateBuckets: { [rate: number]: { taxable: number; taxAmount: number } } = {};
  let totalMaterialVal = 0;
  let totalMakingVal = 0;
  let totalTaxableVal = 0;
  let totalTaxVal = 0;

  items.forEach(item => {
    const matVal = Number(item.materialValue) || 0;
    const makVal = Number(item.makingCharges) || 0;
    const lineTaxable = matVal + makVal;
    const matGstRate = Number(item.material_gst_rate) ?? 3.0;
    const makGstRate = 5.0;

    const lineTax = (matVal * (matGstRate / 100.0)) + (makVal * (makGstRate / 100.0));

    totalMaterialVal += matVal;
    totalMakingVal += makVal;
    totalTaxableVal += lineTaxable;
    totalTaxVal += lineTax;

    if (!rateBuckets[matGstRate]) {
      rateBuckets[matGstRate] = { taxable: 0, taxAmount: 0 };
    }
    rateBuckets[matGstRate].taxable += matVal;
    rateBuckets[matGstRate].taxAmount += matVal * (matGstRate / 100.0);
  });

  const grandTotal = totalTaxableVal + totalTaxVal;

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {/* Header Info */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm text-textSecondary font-medium">Customer *</label>
          <PartySelect 
            partyType="Customer" 
            onChange={(id, partyObj) => {
              setCustomerId(id);
              if (partyObj?.state_code) {
                handlePlaceOfSupplyChange(partyObj.state_code);
              }
            }} 
            placeholder="Search customer from master..." 
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-textSecondary font-medium flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-primary" /> Place of Supply (Customer State) *
          </label>
          <select
            value={placeOfSupply}
            onChange={(e) => handlePlaceOfSupplyChange(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-white focus:border-primary outline-none font-medium"
          >
            {INDIAN_STATES.map(s => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-playfair font-medium text-white">Line Items (Strict Master Selection)</h4>
          <button type="button" onClick={addItem} className="text-xs text-primary flex items-center gap-1 hover:text-white transition-colors">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
        
        <div className="bg-surface/50 border border-border rounded-xl overflow-hidden">
          {items.map((item, index) => (
            <div key={item.id} className={`p-4 space-y-3 ${index !== items.length - 1 ? 'border-b border-border' : ''}`}>
              <div className="flex gap-4 items-start">
                <div className="flex-1 space-y-2">
                  <label className="text-xs text-textSecondary">Select Inventory Item *</label>
                  <ItemSelect
                    value={item.material_id}
                    onChange={(itemId, stockItem) => handleItemSelect(item.id, stockItem)}
                    placeholder="Type code or name (e.g. Gold, Emerald, Ruby, Diamond)..."
                  />
                </div>
                <div className="w-28 space-y-2">
                  <label className="text-[11px] text-textSecondary">HSN Code 🔒</label>
                  <input 
                    type="text"
                    readOnly
                    disabled
                    value={item.hsn_code}
                    className="w-full bg-white/5 border border-border rounded-lg px-2.5 py-2 text-xs text-textSecondary font-mono cursor-not-allowed h-[38px]"
                  />
                </div>
                <div className="w-28 space-y-2">
                  <label className="text-[11px] text-primary font-medium">GST Rate 🔒</label>
                  <input 
                    type="text"
                    readOnly
                    disabled
                    value={`${item.material_gst_rate}%`}
                    className="w-full bg-white/5 border border-primary/30 rounded-lg px-2.5 py-2 text-xs text-primary font-mono font-bold cursor-not-allowed h-[38px]"
                  />
                </div>
                <div className="w-32 space-y-2">
                  <label className="text-xs text-textSecondary">Material Rate (₹) *</label>
                  <input 
                    type="number" 
                    value={item.materialValue || ''}
                    onChange={(e) => updateItemField(item.id, 'materialValue', Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none h-[38px]" 
                    placeholder="0.00"
                  />
                </div>
                <div className="w-32 space-y-2">
                  <label className="text-xs text-textSecondary">Making (₹ Optional)</label>
                  <input 
                    type="number" 
                    value={item.makingCharges || ''}
                    onChange={(e) => updateItemField(item.id, 'makingCharges', Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none h-[38px]" 
                    placeholder="0.00"
                  />
                </div>
                <div className="pt-8">
                  <button 
                    type="button" 
                    onClick={() => removeItem(item.id)}
                    className="text-textSecondary hover:text-danger transition-colors p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic Multi-Rate State GST Summary Box */}
      <div className="p-4 bg-background border border-primary/30 rounded-xl space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-white">Multi-Rate Itemized GST Tax Breakdown</span>
          </div>
          <Badge variant={!isInterState ? 'success' : 'warning'}>
            {!isInterState ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}
          </Badge>
        </div>

        <div className="space-y-2 text-xs text-textSecondary">
          <div className="flex justify-between text-white font-medium">
            <span>Total Material Value:</span>
            <span className="font-mono">{formatCurrency(totalMaterialVal)}</span>
          </div>
          {totalMakingVal > 0 && (
            <div className="flex justify-between text-white font-medium">
              <span>Total Making Charges:</span>
              <span className="font-mono">{formatCurrency(totalMakingVal)}</span>
            </div>
          )}

          {/* Grouped GST Rate Buckets */}
          {Object.entries(rateBuckets).map(([rateStr, bucket]) => {
            const rate = Number(rateStr);
            const halfRate = rate / 2;
            return (
              <div key={rateStr} className="p-2 bg-surface/50 border border-border/50 rounded-lg space-y-1">
                <div className="flex justify-between text-textSecondary font-medium">
                  <span>Items @ {rate}% Tax Rate:</span>
                  <span className="font-mono text-white">Taxable: {formatCurrency(bucket.taxable)}</span>
                </div>
                {!isInterState ? (
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
          })}

          <div className="flex justify-between text-white border-t border-border pt-2 text-sm font-bold">
            <span>Grand Total Invoice Amount:</span>
            <span className="text-primary font-mono">{formatCurrency(grandTotal)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <button 
          type="submit" 
          disabled={submitting}
          className="px-6 py-2 rounded-lg bg-gold-gradient text-background font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? 'Generating...' : 'Generate Invoice'}
        </button>
      </div>
    </form>
  );
}
