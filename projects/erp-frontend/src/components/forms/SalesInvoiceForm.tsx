"use client";

import { useEffect, useState } from 'react';
import { Plus, Trash2, MapPin, Calculator, Globe, FileText } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import Badge from '@/components/ui/Badge';
import PartySelect from '@/components/ui/PartySelect';
import ItemSelect, { StockItem } from '@/components/ui/ItemSelect';
import { apiClient, lotsApi, LotRow } from '@/lib/api';
import { useCompany } from '@/lib/company';

interface LineItem {
  id: number;
  material_id: string;
  name: string;
  code: string;
  hsn_code: string;
  material_gst_rate: number;
  materialValue: number;
  makingCharges: number;
  quantity: number;
  lot_id: string;
  lot_no: string;
}

// Every GST state code, in the order and with the names of the backend's
// app/tax/gstin.py STATE_NAMES. The nine-state list this replaced could not
// record a supply to most of the country. 99 (Centre Jurisdiction) is a
// registration jurisdiction, not a place of supply, so it is left out.
const GST_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu & Kashmir' }, { code: '02', name: 'Himachal Pradesh' }, { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' }, { code: '05', name: 'Uttarakhand' }, { code: '06', name: 'Haryana' }, { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' }, { code: '09', name: 'Uttar Pradesh' }, { code: '10', name: 'Bihar' }, { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' }, { code: '13', name: 'Nagaland' }, { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' }, { code: '16', name: 'Tripura' }, { code: '17', name: 'Meghalaya' }, { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' }, { code: '20', name: 'Jharkhand' }, { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' }, { code: '23', name: 'Madhya Pradesh' }, { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' }, { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' }, { code: '30', name: 'Goa' }, { code: '31', name: 'Lakshadweep' }, { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' }, { code: '34', name: 'Puducherry' }, { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '36', name: 'Telangana' }, { code: '37', name: 'Andhra Pradesh' }, { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
];

type InvoiceType = 'Tax_Invoice' | 'Export_Invoice' | 'Bill_of_Supply';
type ExportType = 'LUT_without_tax' | 'With_IGST';

// Currencies a Jaipur exporter invoices in. Any ISO code is accepted by the
// API; these are the ones offered.
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'HKD', 'JPY', 'CHF', 'AUD', 'SGD'];

const normaliseStateCode = (code?: string | null) => {
  const c = (code || '').trim();
  return c ? c.padStart(2, '0') : '';
};

const newLine = (id: number): LineItem => ({
  id, material_id: '', name: '', code: '', hsn_code: '71131910', material_gst_rate: 3.0,
  materialValue: 0, makingCharges: 0, quantity: 1, lot_id: '', lot_no: '',
});

interface SalesInvoiceFormProps {
  /** Called after a successful create so the caller can close and refresh. */
  onSuccess?: () => void;
}

export default function SalesInvoiceForm({ onSuccess }: SalesInvoiceFormProps) {
  const { company } = useCompany();
  const homeState = normaliseStateCode(company?.state_code);
  const [customerId, setCustomerId] = useState('');
  const [customerHasIdentity, setCustomerHasIdentity] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Home state from /auth/me, not a hard-coded '08'; until the company has
  // loaded, and until a customer is chosen, the field is blank.
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [posTouched, setPosTouched] = useState(false);
  useEffect(() => {
    if (!posTouched && homeState && !placeOfSupply) setPlaceOfSupply(homeState);
  }, [homeState, posTouched, placeOfSupply]);

  // Kind of document and, for an export, its particulars.
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('Tax_Invoice');
  const [exportType, setExportType] = useState<ExportType>('LUT_without_tax');
  const [currency, setCurrency] = useState('INR');
  const [exchangeRate, setExchangeRate] = useState<string>('1');
  const [shippingBillNo, setShippingBillNo] = useState('');
  const [shippingBillDate, setShippingBillDate] = useState('');
  const [portCode, setPortCode] = useState('');
  const [buyerCountry, setBuyerCountry] = useState('');
  const [lutNo, setLutNo] = useState('');
  // Rule 114B: the buyer's PAN when the party has none and the invoice is
  // Rs 2,00,000 or more.
  const [pan, setPan] = useState('');

  const isExport = invoiceType === 'Export_Invoice';
  const isBillOfSupply = invoiceType === 'Bill_of_Supply';
  const isForeign = currency !== 'INR';
  const fx = isForeign ? Number(exchangeRate) || 0 : 1;
  const isInterState = isExport || (!!placeOfSupply && !!homeState && placeOfSupply !== homeState);

  const [items, setItems] = useState<LineItem[]>([newLine(1)]);
  // Open lots of the material on each line, for the lot picker.
  const [lotOptions, setLotOptions] = useState<Record<string, LotRow[]>>({});

  const handlePlaceOfSupplyChange = (code: string) => {
    setPosTouched(true);
    setPlaceOfSupply(normaliseStateCode(code));
  };

  const loadLots = async (materialId: string) => {
    if (!materialId || lotOptions[materialId]) return;
    try {
      const res = await lotsApi.list({ material_id: materialId, open_only: true, limit: 100 });
      setLotOptions((prev) => ({ ...prev, [materialId]: res.data?.lots || [] }));
    } catch {
      setLotOptions((prev) => ({ ...prev, [materialId]: [] }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      alert('Please select a customer from master');
      return;
    }
    if (!isExport && !placeOfSupply) {
      alert('Please select the place of supply');
      return;
    }
    if (isForeign && !(fx > 0)) {
      alert(`Enter the exchange rate for ${currency} to INR`);
      return;
    }
    const validLines = items.filter(i => i.material_id && (i.materialValue > 0 || i.makingCharges > 0));
    if (validLines.length === 0) {
      alert('Please select at least one inventory item and enter material value or making charges');
      return;
    }

    setSubmitting(true);
    try {
      const body: any = {
        customer_id: customerId,
        invoice_date: new Date().toISOString().split('T')[0],
        place_of_supply: isExport ? undefined : placeOfSupply,
        invoice_type: invoiceType,
        currency,
        exchange_rate: isForeign ? Number(exchangeRate) : 1,
        lines: validLines.map(i => ({
          material_id: i.material_id,
          lot_id: i.lot_id || undefined,
          description: i.name,
          hsn_sac_code: i.hsn_code,
          material_value: Number(i.materialValue) || 0,
          making_charges: Number(i.makingCharges) || 0,
          quantity: Number(i.quantity) > 0 ? Number(i.quantity) : 1,
        })),
        reason: isExport ? 'Export invoice creation' : isBillOfSupply ? 'Bill of supply creation' : 'Sales invoice creation',
      };
      if (isExport) {
        body.export_type = exportType;
        body.shipping_bill_no = shippingBillNo || undefined;
        body.shipping_bill_date = shippingBillDate || undefined;
        body.port_code = portCode || undefined;
        body.buyer_country = buyerCountry || undefined;
        body.lut_no = exportType === 'LUT_without_tax' ? (lutNo || undefined) : undefined;
      }
      if (pan.trim()) body.pan = pan.trim().toUpperCase();
      await apiClient.post('/sales/invoices', body);
      if (onSuccess) {
        onSuccess();
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      console.error('Invoice create error:', err);
      const detail = err.response?.data?.detail;
      alert(typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: any) => d.msg).join('\n') : 'Failed to create sales invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const addItem = () => setItems([...items, newLine(Date.now())]);

  const removeItem = (id: number) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const handleItemSelect = (id: number, stockItem?: StockItem) => {
    setItems(items.map(item => {
      if (item.id === id) {
        if (!stockItem) {
          return { ...item, material_id: '', name: '', code: '', hsn_code: '71131910', material_gst_rate: 3.0, lot_id: '', lot_no: '' };
        }
        loadLots(stockItem.id);
        return {
          ...item,
          material_id: stockItem.id,
          name: stockItem.name,
          code: stockItem.code,
          hsn_code: stockItem.hsn_code,
          material_gst_rate: stockItem.material_gst_rate,
          lot_id: '',
          lot_no: '',
        };
      }
      return item;
    }));
  };

  const updateItemField = (id: number, field: 'materialValue' | 'makingCharges' | 'quantity', value: number) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const selectLot = (id: number, lotId: string) => {
    setItems(items.map(item => {
      if (item.id !== id) return item;
      const lot = (lotOptions[item.material_id] || []).find(l => l.id === lotId);
      return { ...item, lot_id: lotId, lot_no: lot?.lot_no || '', quantity: lot ? Number(lot.balance_carats) : item.quantity };
    }));
  };

  // Multi-Rate GST Grouping Engine (in the invoice currency; the API books
  // the rupee figure at the exchange rate).
  const rateBuckets: { [rate: number]: { taxable: number; taxAmount: number } } = {};
  let totalMaterialVal = 0;
  let totalMakingVal = 0;
  let totalTaxableVal = 0;
  let totalTaxVal = 0;
  const taxFree = isBillOfSupply || (isExport && exportType === 'LUT_without_tax');

  items.forEach(item => {
    const matVal = Number(item.materialValue) || 0;
    const makVal = Number(item.makingCharges) || 0;
    const lineTaxable = matVal + makVal;
    const matGstRate = taxFree ? 0 : Number(item.material_gst_rate) ?? 3.0;
    const makGstRate = taxFree ? 0 : 5.0;

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
  const fmt = (n: number) => isForeign
    ? `${currency} ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : formatCurrency(n);
  const pan114bHint = !isExport && grandTotal * fx >= 200000 && !customerHasIdentity;

  const fieldCls = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none';

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {/* Kind of document */}
      <div className="grid grid-cols-3 gap-3">
        {([
          ['Tax_Invoice', 'Tax Invoice', 'Rule 46 · GST charged'],
          ['Export_Invoice', 'Export Invoice', 'Zero-rated · s.16 IGST'],
          ['Bill_of_Supply', 'Bill of Supply', 'Rule 49 · no GST'],
        ] as [InvoiceType, string, string][]).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            onClick={() => { setInvoiceType(value); if (value !== 'Export_Invoice') { setCurrency('INR'); setExchangeRate('1'); } }}
            className={`text-left p-3 rounded-lg border transition-colors ${invoiceType === value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}
          >
            <div className={`text-sm font-semibold ${invoiceType === value ? 'text-primary' : 'text-white'}`}>{label}</div>
            <div className="text-[11px] text-textSecondary">{hint}</div>
          </button>
        ))}
      </div>

      {/* Header Info */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm text-textSecondary font-medium">Customer *</label>
          <PartySelect
            partyType="Customer"
            onChange={(id, partyObj) => {
              setCustomerId(id);
              const p: any = partyObj || {};
              setCustomerHasIdentity(Boolean(p.gstin || p.pan));
              if (!isExport && partyObj?.state_code) {
                handlePlaceOfSupplyChange(partyObj.state_code);
              }
            }}
            placeholder="Search customer from master..."
          />
        </div>
        {isExport ? (
          <div className="space-y-2">
            <label className="text-sm text-textSecondary font-medium flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-primary" /> Buyer&apos;s Country
            </label>
            <input
              type="text"
              value={buyerCountry}
              onChange={(e) => setBuyerCountry(e.target.value)}
              className={fieldCls}
              placeholder="e.g. United States"
            />
            <p className="text-[11px] text-textSecondary">Place of supply is recorded as 96 (Other Country), GSTR-1 Table 6A.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm text-textSecondary font-medium flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-primary" /> Place of Supply (Customer State) *
            </label>
            <select
              value={placeOfSupply}
              onChange={(e) => handlePlaceOfSupplyChange(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-white focus:border-primary outline-none font-medium"
            >
              <option value="" disabled>Select state...</option>
              {GST_STATES.map(s => (
                <option key={s.code} value={s.code}>
                  {s.code} - {s.name}{s.code === homeState ? ' (Home State)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Export block */}
      {isExport && (
        <div className="p-4 bg-surface/50 border border-primary/30 rounded-xl space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-white">Export particulars</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Tax treatment *</label>
              <select value={exportType} onChange={(e) => setExportType(e.target.value as ExportType)} className={fieldCls}>
                <option value="LUT_without_tax">Under LUT, without payment of IGST (WOPAY)</option>
                <option value="With_IGST">With payment of IGST, refund claimed (WPAY)</option>
              </select>
            </div>
            {exportType === 'LUT_without_tax' && (
              <div className="space-y-1">
                <label className="text-xs text-textSecondary">LUT / ARN No.</label>
                <input type="text" value={lutNo} onChange={(e) => setLutNo(e.target.value)} className={`${fieldCls} font-mono`} placeholder="AD08…" />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Invoice currency *</label>
              <select value={currency} onChange={(e) => { setCurrency(e.target.value); if (e.target.value === 'INR') setExchangeRate('1'); }} className={fieldCls}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Exchange rate (1 {currency} = ₹) {isForeign ? '*' : ''}</label>
              <input
                type="number" step="0.0001" min="0"
                value={isForeign ? exchangeRate : '1'} disabled={!isForeign}
                onChange={(e) => setExchangeRate(e.target.value)}
                className={`${fieldCls} font-mono disabled:opacity-50`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Shipping bill no.</label>
              <input type="text" value={shippingBillNo} onChange={(e) => setShippingBillNo(e.target.value)} className={`${fieldCls} font-mono`} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Shipping bill date</label>
              <input type="date" value={shippingBillDate} onChange={(e) => setShippingBillDate(e.target.value)} className={fieldCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Port code</label>
              <input type="text" value={portCode} onChange={(e) => setPortCode(e.target.value.toUpperCase())} className={`${fieldCls} font-mono`} placeholder="INJAI4" />
            </div>
          </div>
        </div>
      )}

      {/* Items List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-playfair font-medium text-white">Line Items (Strict Master Selection)</h4>
          <button type="button" onClick={addItem} className="text-xs text-primary flex items-center gap-1 hover:text-white transition-colors">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>

        <div className="bg-surface/50 border border-border rounded-xl overflow-hidden">
          {items.map((item, index) => {
            const lots = lotOptions[item.material_id] || [];
            return (
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
                <div className="w-24 space-y-2">
                  <label className="text-[11px] text-primary font-medium">GST Rate 🔒</label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={taxFree ? '0%' : `${item.material_gst_rate}%`}
                    className="w-full bg-white/5 border border-primary/30 rounded-lg px-2.5 py-2 text-xs text-primary font-mono font-bold cursor-not-allowed h-[38px]"
                  />
                </div>
                <div className="w-24 space-y-2">
                  <label className="text-xs text-textSecondary">Qty</label>
                  <input
                    type="number" step="any" min="0"
                    value={item.quantity || ''}
                    onChange={(e) => updateItemField(item.id, 'quantity', Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none h-[38px]"
                    placeholder="1"
                  />
                </div>
                <div className="w-32 space-y-2">
                  <label className="text-xs text-textSecondary">Material ({currency}) *</label>
                  <input
                    type="number"
                    value={item.materialValue || ''}
                    onChange={(e) => updateItemField(item.id, 'materialValue', Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none h-[38px]"
                    placeholder="0.00"
                  />
                </div>
                <div className="w-32 space-y-2">
                  <label className="text-xs text-textSecondary">Making ({currency})</label>
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
              {item.material_id && lots.length > 0 && (
                <div className="flex items-center gap-3">
                  <label className="text-[11px] text-textSecondary whitespace-nowrap">From lot</label>
                  <select
                    value={item.lot_id}
                    onChange={(e) => selectLot(item.id, e.target.value)}
                    className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:border-primary outline-none font-mono"
                  >
                    <option value="">— untagged stock —</option>
                    {lots.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.lot_no} · {Number(l.balance_carats).toFixed(3)} ct{l.sieve_size ? ` · ${l.sieve_size}` : ''}{l.colour ? ` · ${l.colour}` : ''}
                      </option>
                    ))}
                  </select>
                  {item.lot_no && <span className="text-[11px] text-textSecondary">Qty is carats taken from {item.lot_no}.</span>}
                </div>
              )}
            </div>
          ); })}
        </div>
      </div>

      {/* Dynamic Multi-Rate State GST Summary Box */}
      <div className="p-4 bg-background border border-primary/30 rounded-xl space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-white">
              {isExport ? 'Export invoice summary' : isBillOfSupply ? 'Bill of supply summary' : 'Multi-Rate Itemized GST Tax Breakdown'}
            </span>
          </div>
          <Badge variant={taxFree ? 'info' : !isInterState ? 'success' : 'warning'}>
            {isExport
              ? (exportType === 'LUT_without_tax' ? 'Export under LUT · no IGST' : 'Export with IGST')
              : isBillOfSupply ? 'No GST' : !isInterState ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}
          </Badge>
        </div>

        <div className="space-y-2 text-xs text-textSecondary">
          <div className="flex justify-between text-white font-medium">
            <span>Total Material Value:</span>
            <span className="font-mono">{fmt(totalMaterialVal)}</span>
          </div>
          {totalMakingVal > 0 && (
            <div className="flex justify-between text-white font-medium">
              <span>Total Making Charges:</span>
              <span className="font-mono">{fmt(totalMakingVal)}</span>
            </div>
          )}

          {/* Grouped GST Rate Buckets */}
          {!taxFree && Object.entries(rateBuckets).map(([rateStr, bucket]) => {
            const rate = Number(rateStr);
            const halfRate = rate / 2;
            return (
              <div key={rateStr} className="p-2 bg-surface/50 border border-border/50 rounded-lg space-y-1">
                <div className="flex justify-between text-textSecondary font-medium">
                  <span>Items @ {rate}% Tax Rate:</span>
                  <span className="font-mono text-white">Taxable: {fmt(bucket.taxable)}</span>
                </div>
                {!isInterState ? (
                  <div className="flex justify-between text-emerald-400 text-[11px]">
                    <span>CGST ({halfRate}%): {fmt(bucket.taxAmount / 2)}</span>
                    <span>SGST ({halfRate}%): {fmt(bucket.taxAmount / 2)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-amber-400 text-[11px]">
                    <span>IGST ({rate}%):</span>
                    <span>{fmt(bucket.taxAmount)}</span>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex justify-between text-white border-t border-border pt-2 text-sm font-bold">
            <span>Grand Total Invoice Amount:</span>
            <span className="text-primary font-mono">{fmt(grandTotal)}</span>
          </div>
          {isForeign && fx > 0 && (
            <div className="flex justify-between text-textSecondary">
              <span>Booked in rupees @ {fx}:</span>
              <span className="font-mono">{formatCurrency(grandTotal * fx)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Rule 114B: PAN on a Rs 2 lakh sale */}
      {pan114bHint && (
        <div className="p-3 border border-amber-500/40 bg-amber-500/10 rounded-lg space-y-2">
          <p className="text-xs text-amber-300">
            Rule 114B: this invoice is Rs 2,00,000 or more and the customer has neither a PAN nor a GSTIN on record. Enter the buyer&apos;s PAN; it is stored on the party.
          </p>
          <input
            type="text"
            value={pan}
            onChange={(e) => setPan(e.target.value.toUpperCase())}
            maxLength={10}
            className={`${fieldCls} font-mono uppercase w-48`}
            placeholder="AAAAA9999A"
          />
        </div>
      )}

      <div className="flex justify-end gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2 rounded-lg bg-gold-gradient text-background font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? 'Generating...' : isExport ? 'Generate Export Invoice' : isBillOfSupply ? 'Generate Bill of Supply' : 'Generate Invoice'}
        </button>
      </div>
    </form>
  );
}
