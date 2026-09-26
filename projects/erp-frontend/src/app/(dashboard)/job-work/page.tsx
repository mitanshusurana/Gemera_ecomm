"use client";

/**
 * Job work (karigar challans) — CGST s.143.
 *
 * Metal goes out to an artisan on a delivery challan (not a supply, no GST)
 * and comes back as finished pieces. This screen is the register: what is
 * out, with whom, and how long the s.143 clock has left; a form to issue a
 * challan; per challan, the receipt (which bills the karigar's making
 * charges), the printed challan, and the deemed-supply action once the
 * deadline has passed; the ITC-04 view for a quarter; and a per-karigar
 * statement.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Printer, Download, FileText, X, Loader2, AlertTriangle, Clock, RefreshCw,
  PackageCheck, Gavel, User, Hammer, ClipboardList, Receipt as ReceiptIcon,
} from 'lucide-react';

import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import PartySelect from '@/components/ui/PartySelect';
import ItemSelect, { StockItem } from '@/components/ui/ItemSelect';
import { useToast } from '@/components/ui/Toast';
import { jobWorkApi } from '@/lib/api';
import { useCompany } from '@/lib/company';
import { formatCurrency } from '@/lib/utils';
import { isoDate, today, financialYearStartYear } from '@/lib/fiscal';
import { generateJobWorkChallanPDF } from '@/lib/vectorPdfEngine';

type ChallanStatus = 'Open' | 'PartiallyReceived' | 'Closed' | 'DeemedSupply';

interface ChallanRow {
  id: string;
  challan_no: string;
  challan_date: string;
  goods_type: string;
  return_due_date: string;
  status: ChallanStatus;
  nature_of_work: string | null;
  job_worker_id: string;
  job_worker_name: string;
  job_worker_gstin: string | null;
  quantity_sent: string | number;
  taxable_value: string | number;
  quantity_received: string | number;
  quantity_wastage: string | number;
  quantity_outstanding: string | number;
  days_remaining: number;
  is_overdue: boolean;
  deemed_supply_invoice_id?: string | null;
}

interface ChallanLine {
  id: number;
  sequence_no: number;
  material_id: string;
  material_code: string;
  material_name: string;
  uom: string | null;
  description: string | null;
  hsn_code: string | null;
  quantity_sent: string | number;
  gross_weight: string | number | null;
  net_weight: string | number | null;
  purity: string | number | null;
  taxable_value: string | number;
  quantity_received: string | number;
  quantity_wastage: string | number;
  quantity_outstanding: string | number;
}

interface ChallanDetail extends ChallanRow {
  lines: ChallanLine[];
  receipts: any[];
  company: any;
  remarks: string | null;
  place_of_supply: string | null;
  is_inter_state: boolean;
  legal_return_due_date: string;
  total_quantity: string;
  total_value: string;
}

interface FormLine {
  key: number;
  material_id: string;
  code: string;
  name: string;
  unit: string;
  hsn_code: string;
  description: string;
  quantity_sent: string;
  gross_weight: string;
  net_weight: string;
  purity_pct: string;
  taxable_value: string;
}

interface ReceiptLineState {
  challan_line_id: number;
  label: string;
  outstanding: number;
  quantity_received: string;
  quantity_wastage: string;
  gross_weight: string;
  net_weight: string;
}

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '0');
  return Number.isFinite(n) ? n : 0;
};
const fmtQty = (v: any) => num(v).toLocaleString('en-IN', { maximumFractionDigits: 4 });
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

const addYears = (iso: string, years: number): string => {
  const d = new Date(iso + 'T00:00:00');
  const month = d.getMonth();
  d.setFullYear(d.getFullYear() + years);
  // 29 Feb + n years with no 29 Feb: land on 28 Feb, not 1 Mar.
  if (d.getMonth() !== month) d.setDate(0);
  return isoDate(d);
};
const legalDeadline = (challanDate: string, goodsType: string) =>
  addYears(challanDate, goodsType === 'CapitalGoods' ? 3 : 1);

const statusVariant = (s: ChallanStatus, overdue: boolean): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
  if (overdue) return 'danger';
  switch (s) {
    case 'Open': return 'info';
    case 'PartiallyReceived': return 'warning';
    case 'Closed': return 'success';
    case 'DeemedSupply': return 'danger';
    default: return 'default';
  }
};
const statusLabel = (s: ChallanStatus) =>
  s === 'PartiallyReceived' ? 'Partially received' : s === 'DeemedSupply' ? 'Deemed supply' : s;

const newLine = (key: number): FormLine => ({
  key, material_id: '', code: '', name: '', unit: '', hsn_code: '', description: '',
  quantity_sent: '', gross_weight: '', net_weight: '', purity_pct: '91.6', taxable_value: '',
});

const errorText = (err: any, fallback: string): string => {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: any) => x.msg || JSON.stringify(x)).join('; ');
  return err?.message || fallback;
};

/** Indian FY quarters for the ITC-04 picker: current and previous year. */
const quarterOptions = () => {
  const fyStart = financialYearStartYear();
  const out: { label: string; from: string; to: string }[] = [];
  for (const y of [fyStart, fyStart - 1]) {
    const qs = [
      { q: 'Q1', from: `${y}-04-01`, to: `${y}-06-30` },
      { q: 'Q2', from: `${y}-07-01`, to: `${y}-09-30` },
      { q: 'Q3', from: `${y}-10-01`, to: `${y}-12-31` },
      { q: 'Q4', from: `${y + 1}-01-01`, to: `${y + 1}-03-31` },
    ];
    for (const q of qs) out.push({ label: `${q.q} FY ${y}-${String(y + 1).slice(2)}`, from: q.from, to: q.to });
  }
  return out;
};
const currentQuarterIndex = () => {
  const m = new Date().getMonth() + 1;
  return m >= 4 && m <= 6 ? 0 : m >= 7 && m <= 9 ? 1 : m >= 10 ? 2 : 3;
};

const inputCls = 'w-full bg-background border border-border rounded-md px-3 py-2 text-white text-sm focus:border-primary outline-none';
const cellInputCls = 'w-full bg-background border border-border rounded px-2 py-1 text-white text-xs font-mono focus:border-primary outline-none';

type Tab = 'challans' | 'receipts' | 'overdue' | 'itc04';

// ─── Page ────────────────────────────────────────────────────────────────────

export default function JobWorkPage() {
  const { showToast } = useToast();
  const { company } = useCompany();

  const [tab, setTab] = useState<Tab>('challans');
  const [challans, setChallans] = useState<ChallanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const [receipts, setReceipts] = useState<any[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [overdue, setOverdue] = useState<any | null>(null);
  const [itc, setItc] = useState<any | null>(null);
  const [itcLoading, setItcLoading] = useState(false);
  const quarters = useMemo(quarterOptions, []);
  const [quarterIdx, setQuarterIdx] = useState(currentQuarterIndex());

  // Detail / print
  const [detail, setDetail] = useState<ChallanDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // New challan form
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [challanDate, setChallanDate] = useState(today());
  const [goodsType, setGoodsType] = useState('Input');
  const [expectedReturn, setExpectedReturn] = useState(legalDeadline(today(), 'Input'));
  const [natureOfWork, setNatureOfWork] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<FormLine[]>([newLine(1)]);
  const [lineKey, setLineKey] = useState(2);

  // Receipt form
  const [receiptFor, setReceiptFor] = useState<ChallanDetail | null>(null);
  const [receiptDate, setReceiptDate] = useState(today());
  const [makingCharges, setMakingCharges] = useState('');
  const [karigarBillNo, setKarigarBillNo] = useState('');
  const [receiptRemarks, setReceiptRemarks] = useState('');
  const [receiptLines, setReceiptLines] = useState<ReceiptLineState[]>([]);
  const [receiving, setReceiving] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [receiptResult, setReceiptResult] = useState<any | null>(null);

  // Deem supply
  const [deemFor, setDeemFor] = useState<ChallanRow | null>(null);
  const [deeming, setDeeming] = useState(false);

  // Karigar statement drawer
  const [statement, setStatement] = useState<any | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  const loadChallans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await jobWorkApi.listChallans({ status: statusFilter || undefined, limit: 200 });
      setChallans(res.data?.challans || []);
    } catch (err) {
      showToast('error', 'Could not load challans', errorText(err, ''));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, showToast]);

  const loadReceipts = useCallback(async () => {
    setReceiptsLoading(true);
    try {
      const res = await jobWorkApi.receipts({ limit: 200 });
      setReceipts(res.data?.receipts || []);
    } catch (err) {
      showToast('error', 'Could not load receipts', errorText(err, ''));
    } finally {
      setReceiptsLoading(false);
    }
  }, [showToast]);

  const loadOverdue = useCallback(async () => {
    try {
      const res = await jobWorkApi.overdue();
      setOverdue(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadItc = useCallback(async () => {
    const q = quarters[quarterIdx];
    if (!q) return;
    setItcLoading(true);
    try {
      const res = await jobWorkApi.itc04({ from_date: q.from, to_date: q.to });
      setItc(res.data);
    } catch (err) {
      showToast('error', 'Could not load ITC-04', errorText(err, ''));
    } finally {
      setItcLoading(false);
    }
  }, [quarters, quarterIdx, showToast]);

  useEffect(() => { loadChallans(); loadOverdue(); }, [loadChallans, loadOverdue]);
  useEffect(() => { if (tab === 'receipts') loadReceipts(); }, [tab, loadReceipts]);
  useEffect(() => { if (tab === 'itc04') loadItc(); }, [tab, loadItc]);

  const refreshAll = () => { loadChallans(); loadOverdue(); if (tab === 'receipts') loadReceipts(); };

  // ─── Detail & print ───────────────────────────────────────────────────────

  const openDetail = async (row: { id: string }) => {
    setDetailLoading(true);
    try {
      const res = await jobWorkApi.getChallan(row.id);
      setDetail(res.data);
    } catch (err) {
      showToast('error', 'Could not open challan', errorText(err, ''));
    } finally {
      setDetailLoading(false);
    }
  };

  const printChallan = async (row: { id: string }, mode: 'print' | 'download') => {
    try {
      const res = await jobWorkApi.getChallan(row.id);
      generateJobWorkChallanPDF(res.data, mode, res.data.company || company);
    } catch (err) {
      showToast('error', 'Could not print challan', errorText(err, ''));
    }
  };

  // ─── New challan ──────────────────────────────────────────────────────────

  const resetForm = () => {
    setWorkerId(''); setChallanDate(today()); setGoodsType('Input');
    setExpectedReturn(legalDeadline(today(), 'Input')); setNatureOfWork(''); setRemarks('');
    setLines([newLine(1)]); setLineKey(2); setFormError('');
  };

  const onChallanDateChange = (d: string) => {
    setChallanDate(d);
    if (d) setExpectedReturn(legalDeadline(d, goodsType));
  };
  const onGoodsTypeChange = (g: string) => {
    setGoodsType(g);
    if (challanDate) setExpectedReturn(legalDeadline(challanDate, g));
  };

  const updateLine = (key: number, patch: Partial<FormLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const onItemPicked = (key: number, itemId: string, item?: StockItem) =>
    updateLine(key, {
      material_id: itemId,
      code: item?.code || '',
      name: item?.name || '',
      unit: item?.unit || '',
      hsn_code: item?.hsn_code || '',
    });

  const submitChallan = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!workerId) { setFormError('Choose the karigar the goods are going to.'); return; }
    const valid = lines.filter((l) => l.material_id && num(l.quantity_sent) > 0);
    if (valid.length === 0) { setFormError('Add at least one line with an item and a quantity.'); return; }
    for (const l of valid) {
      if (l.gross_weight && l.net_weight && num(l.net_weight) > num(l.gross_weight)) {
        setFormError(`${l.name}: net weight cannot exceed gross weight.`); return;
      }
    }
    setSaving(true);
    try {
      const res = await jobWorkApi.createChallan({
        job_worker_id: workerId,
        challan_date: challanDate,
        goods_type: goodsType,
        nature_of_work: natureOfWork || null,
        expected_return_date: expectedReturn || null,
        remarks: remarks || null,
        lines: valid.map((l) => ({
          material_id: l.material_id,
          description: l.description || null,
          hsn_code: l.hsn_code || null,
          quantity_sent: num(l.quantity_sent),
          gross_weight: l.gross_weight ? num(l.gross_weight) : null,
          net_weight: l.net_weight ? num(l.net_weight) : null,
          purity: l.purity_pct ? Math.min(1, num(l.purity_pct) / 100) : null,
          taxable_value: l.taxable_value ? num(l.taxable_value) : 0,
        })),
        reason: 'Job work challan issued from the ERP',
      });
      showToast('success', `Challan ${res.data.challan_no} issued`, `Return due by ${fmtDate(res.data.return_due_date)}. No GST: not a supply (s.143).`);
      setIsNewOpen(false);
      resetForm();
      refreshAll();
    } catch (err) {
      setFormError(errorText(err, 'Could not issue the challan'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Receipt ──────────────────────────────────────────────────────────────

  const openReceipt = async (row: { id: string }) => {
    try {
      const res = await jobWorkApi.getChallan(row.id);
      const d: ChallanDetail = res.data;
      setReceiptFor(d);
      setReceiptDate(today());
      setMakingCharges(''); setKarigarBillNo(''); setReceiptRemarks(''); setReceiptError(''); setReceiptResult(null);
      setReceiptLines(
        d.lines
          .filter((l) => num(l.quantity_outstanding) > 0)
          .map((l) => ({
            challan_line_id: l.id,
            label: [l.material_code, l.description || l.material_name].filter(Boolean).join(' — '),
            outstanding: num(l.quantity_outstanding),
            quantity_received: String(num(l.quantity_outstanding)),
            quantity_wastage: '0',
            gross_weight: '',
            net_weight: '',
          })),
      );
    } catch (err) {
      showToast('error', 'Could not open challan', errorText(err, ''));
    }
  };

  const updateReceiptLine = (id: number, patch: Partial<ReceiptLineState>) =>
    setReceiptLines((prev) => prev.map((l) => (l.challan_line_id === id ? { ...l, ...patch } : l)));

  const submitReceipt = async () => {
    if (!receiptFor) return;
    setReceiptError('');
    const active = receiptLines.filter((l) => num(l.quantity_received) > 0 || num(l.quantity_wastage) > 0);
    if (active.length === 0) { setReceiptError('Enter a received or wastage quantity on at least one line.'); return; }
    for (const l of active) {
      if (num(l.quantity_received) + num(l.quantity_wastage) > l.outstanding + 1e-9) {
        setReceiptError(`${l.label}: received + wastage exceeds the ${fmtQty(l.outstanding)} outstanding.`); return;
      }
    }
    setReceiving(true);
    try {
      const res = await jobWorkApi.receive(receiptFor.id, {
        receipt_date: receiptDate,
        making_charges: num(makingCharges),
        karigar_bill_no: karigarBillNo || null,
        remarks: receiptRemarks || null,
        lines: active.map((l) => ({
          challan_line_id: l.challan_line_id,
          quantity_received: num(l.quantity_received),
          quantity_wastage: num(l.quantity_wastage),
          gross_weight: l.gross_weight ? num(l.gross_weight) : null,
          net_weight: l.net_weight ? num(l.net_weight) : null,
        })),
        reason: 'Job work goods received from karigar',
      });
      setReceiptResult(res.data);
      showToast('success', `Receipt ${res.data.receipt_no} recorded`,
        res.data.making_charge_bill
          ? `Karigar bill ${res.data.making_charge_bill.bill_no} raised${res.data.making_charge_bill.reverse_charge ? ' under reverse charge' : ''}.`
          : `Challan is now ${statusLabel(res.data.challan_status)}.`);
      refreshAll();
    } catch (err) {
      setReceiptError(errorText(err, 'Could not record the receipt'));
    } finally {
      setReceiving(false);
    }
  };

  // ─── Deem supply ──────────────────────────────────────────────────────────

  const confirmDeemSupply = async () => {
    if (!deemFor) return;
    setDeeming(true);
    try {
      const res = await jobWorkApi.deemSupply(deemFor.id, { invoice_date: today() });
      showToast('warning', `Challan ${res.data.challan_no} deemed supplied`,
        `Invoice ${res.data.invoice_no} raised on the karigar. Supply dated ${fmtDate(res.data.deemed_supply_date)}; interest runs from then.`);
      setDeemFor(null);
      refreshAll();
    } catch (err) {
      showToast('error', 'Deemed supply failed', errorText(err, ''));
    } finally {
      setDeeming(false);
    }
  };

  // ─── Karigar statement ────────────────────────────────────────────────────

  const openStatement = async (partyId: string) => {
    setStatementLoading(true);
    setStatement({ party: { id: partyId } });
    try {
      const res = await jobWorkApi.karigarStatement(partyId);
      setStatement(res.data);
    } catch (err) {
      setStatement(null);
      showToast('error', 'Could not load statement', errorText(err, ''));
    } finally {
      setStatementLoading(false);
    }
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const openCount = challans.filter((c) => c.status === 'Open' || c.status === 'PartiallyReceived').length;
  const overdueCount = overdue?.count ?? challans.filter((c) => c.is_overdue).length;
  const outstandingQty = challans.reduce((s, c) => s + (c.status === 'Open' || c.status === 'PartiallyReceived' ? num(c.quantity_outstanding) : 0), 0);
  const valueAtRisk = num(overdue?.total_value_at_risk);
  const totalLineValue = lines.reduce((s, l) => s + num(l.taxable_value), 0);

  const tabBtn = (t: Tab, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-primary/15 text-primary border border-primary/30' : 'text-textSecondary hover:text-white hover:bg-white/5 border border-transparent'}`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Job Work — Karigar Challans [CGST s.143]</h1>
          <p className="text-textSecondary mt-1">Metal out on delivery challan, finished pieces back with the karigar&apos;s making-charge bill. Inputs must return within one year, capital goods within three.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={refreshAll} className="p-2 rounded-lg border border-border text-textSecondary hover:text-white hover:bg-white/5" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => { resetForm(); setIsNewOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(212,168,67,0.3)]"
          >
            <Plus className="w-4 h-4" /> New challan
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-card p-6 border-l-4 border-l-primary">
          <h3 className="text-sm font-medium text-textSecondary uppercase">Open challans</h3>
          <p className="text-3xl font-playfair font-bold text-white mt-2">{openCount}</p>
        </div>
        <div className="glass-card p-6 border-l-4 border-l-warning">
          <h3 className="text-sm font-medium text-textSecondary uppercase">Quantity with karigars</h3>
          <p className="text-3xl font-playfair font-bold text-white mt-2">{fmtQty(outstandingQty)}</p>
        </div>
        <div className={`glass-card p-6 border-l-4 ${overdueCount > 0 ? 'border-l-danger' : 'border-l-success'}`}>
          <h3 className="text-sm font-medium text-textSecondary uppercase">Past s.143 deadline</h3>
          <p className={`text-3xl font-playfair font-bold mt-2 ${overdueCount > 0 ? 'text-danger' : 'text-white'}`}>{overdueCount}</p>
        </div>
        <div className="glass-card p-6 border-l-4 border-l-danger">
          <h3 className="text-sm font-medium text-textSecondary uppercase">Value at risk (deemed supply)</h3>
          <p className="text-2xl font-playfair font-bold text-white mt-2">{formatCurrency(valueAtRisk)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabBtn('challans', 'Challans', <ClipboardList className="w-4 h-4" />)}
        {tabBtn('receipts', 'Receipts', <PackageCheck className="w-4 h-4" />)}
        {tabBtn('overdue', `Overdue${overdueCount ? ` (${overdueCount})` : ''}`, <AlertTriangle className="w-4 h-4" />)}
        {tabBtn('itc04', 'ITC-04', <FileText className="w-4 h-4" />)}
      </div>

      {/* ─── Challans ─────────────────────────────────────────────────────── */}
      {tab === 'challans' && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-playfair font-semibold text-white">Delivery challans</h2>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-white">
              <option value="">All statuses</option>
              <option value="Open">Open</option>
              <option value="PartiallyReceived">Partially received</option>
              <option value="Closed">Closed</option>
              <option value="DeemedSupply">Deemed supply</option>
            </select>
          </div>
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
          ) : challans.length === 0 ? (
            <div className="text-center py-8 text-textSecondary">No challans yet. Issue one to send metal to a karigar.</div>
          ) : (
            <div className="w-full glass rounded-xl overflow-x-auto border border-border">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-textSecondary uppercase bg-surface">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Challan</th>
                    <th className="px-4 py-3 font-semibold">Karigar</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Return by</th>
                    <th className="px-4 py-3 font-semibold text-right">Sent</th>
                    <th className="px-4 py-3 font-semibold text-right">Back</th>
                    <th className="px-4 py-3 font-semibold text-right">Waste</th>
                    <th className="px-4 py-3 font-semibold text-right">Out</th>
                    <th className="px-4 py-3 font-semibold text-right">Value</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {challans.map((c) => {
                    const open = c.status === 'Open' || c.status === 'PartiallyReceived';
                    return (
                      <tr
                        key={c.id}
                        onClick={() => openDetail(c)}
                        className={`border-b border-border/50 last:border-0 transition-colors cursor-pointer ${c.is_overdue ? 'bg-danger/10 hover:bg-danger/15' : 'bg-background hover:bg-white/5'}`}
                      >
                        <td className="px-4 py-3 font-mono text-white">{c.challan_no}<span className="block text-[10px] text-textSecondary">{c.goods_type === 'CapitalGoods' ? 'Capital goods' : 'Inputs'}{c.nature_of_work ? ` · ${c.nature_of_work}` : ''}</span></td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={(e) => { e.stopPropagation(); openStatement(c.job_worker_id); }} className="text-white hover:text-primary text-left">
                            {c.job_worker_name}
                          </button>
                          <span className="block text-[10px] text-textSecondary">{c.job_worker_gstin || 'Unregistered'}</span>
                        </td>
                        <td className="px-4 py-3 text-textSecondary whitespace-nowrap">{fmtDate(c.challan_date)}</td>
                        <td className={`px-4 py-3 whitespace-nowrap ${c.is_overdue ? 'text-danger font-semibold' : open && c.days_remaining <= 30 ? 'text-warning' : 'text-textSecondary'}`}>
                          {fmtDate(c.return_due_date)}
                          {open && <span className="block text-[10px]">{c.is_overdue ? `${-c.days_remaining} days overdue` : `${c.days_remaining} days left`}</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{fmtQty(c.quantity_sent)}</td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-400">{fmtQty(c.quantity_received)}</td>
                        <td className="px-4 py-3 text-right font-mono text-textSecondary">{fmtQty(c.quantity_wastage)}</td>
                        <td className="px-4 py-3 text-right font-mono text-white">{fmtQty(c.quantity_outstanding)}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatCurrency(num(c.taxable_value))}</td>
                        <td className="px-4 py-3">
                          <Badge variant={statusVariant(c.status, c.is_overdue)}>{c.is_overdue ? 'OVERDUE' : statusLabel(c.status)}</Badge>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => printChallan(c, 'print')} className="p-1.5 rounded hover:bg-white/10 text-textSecondary hover:text-white" title="Print challan"><Printer className="w-4 h-4" /></button>
                            {open && (
                              <button type="button" onClick={() => openReceipt(c)} className="flex items-center gap-1 px-2 py-1 bg-primary text-black font-semibold rounded text-xs hover:bg-primary/90" title="Receive goods back">
                                <PackageCheck className="w-3.5 h-3.5" /> Receive
                              </button>
                            )}
                            {open && c.is_overdue && (
                              <button type="button" onClick={() => setDeemFor(c)} className="flex items-center gap-1 px-2 py-1 bg-danger/20 text-danger border border-danger/40 font-semibold rounded text-xs hover:bg-danger/30" title="Deem supplied under s.143(3)">
                                <Gavel className="w-3.5 h-3.5" /> Deem supply
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Receipts register ────────────────────────────────────────────── */}
      {tab === 'receipts' && (
        <div className="glass-card p-6">
          <h2 className="text-xl font-playfair font-semibold text-white mb-4">Receipts register</h2>
          {receiptsLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
          ) : receipts.length === 0 ? (
            <div className="text-center py-8 text-textSecondary">Nothing received yet.</div>
          ) : (
            <div className="w-full glass rounded-xl overflow-x-auto border border-border">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-textSecondary uppercase bg-surface">
                  <tr>
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Challan</th>
                    <th className="px-4 py-3">Karigar</th>
                    <th className="px-4 py-3 text-right">Received</th>
                    <th className="px-4 py-3 text-right">Wastage</th>
                    <th className="px-4 py-3 text-right">Stock value in</th>
                    <th className="px-4 py-3 text-right">Making charges</th>
                    <th className="px-4 py-3">Bill</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id} className="bg-background hover:bg-white/5 border-b border-border/50 last:border-0">
                      <td className="px-4 py-3 font-mono text-white">{r.receipt_no}{r.was_overdue && <span className="block text-[10px] text-danger">received after deadline</span>}</td>
                      <td className="px-4 py-3 text-textSecondary whitespace-nowrap">{fmtDate(r.receipt_date)}</td>
                      <td className="px-4 py-3 font-mono"><button type="button" className="hover:text-primary" onClick={() => openDetail({ id: r.challan_id })}>{r.challan_no}</button></td>
                      <td className="px-4 py-3"><button type="button" className="hover:text-primary" onClick={() => openStatement(r.job_worker_id)}>{r.job_worker_name}</button></td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-400">{fmtQty(r.quantity_received)}</td>
                      <td className="px-4 py-3 text-right font-mono text-textSecondary">{fmtQty(r.quantity_wastage)} <span className="text-[10px]">({r.wastage_pct}%)</span></td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(num(r.cost_amount))}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(num(r.making_charges))}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.making_charge_bill_no ? (
                          <span className="font-mono text-white">{r.making_charge_bill_no}{r.bill_reverse_charge && <span className="ml-1 text-[10px] text-warning">RCM</span>}<span className="block text-textSecondary">{formatCurrency(num(r.bill_total))}{r.karigar_bill_no ? ` · ref ${r.karigar_bill_no}` : ''}</span></span>
                        ) : <span className="text-textSecondary">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Overdue ──────────────────────────────────────────────────────── */}
      {tab === 'overdue' && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-playfair font-semibold text-white">Past the s.143 deadline</h2>
            <span className="text-xs text-textSecondary">{overdue?.rule}</span>
          </div>
          <p className="text-sm text-textSecondary mb-4">Each of these is a deemed supply on the <em>challan</em> date, so tax and interest have been running since dispatch. Receive the goods, or deem the supply and invoice the karigar.</p>
          {!overdue || overdue.challans.length === 0 ? (
            <div className="text-center py-8 text-emerald-400 text-sm">Nothing is overdue.</div>
          ) : (
            <div className="w-full glass rounded-xl overflow-x-auto border border-border">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-textSecondary uppercase bg-surface">
                  <tr>
                    <th className="px-4 py-3">Challan</th>
                    <th className="px-4 py-3">Karigar</th>
                    <th className="px-4 py-3">Sent on</th>
                    <th className="px-4 py-3">Was due</th>
                    <th className="px-4 py-3 text-right">Days overdue</th>
                    <th className="px-4 py-3 text-right">Value at risk</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.challans.map((c: any) => (
                    <tr key={c.id} className="bg-danger/10 hover:bg-danger/15 border-b border-border/50 last:border-0">
                      <td className="px-4 py-3 font-mono text-white">{c.challan_no}</td>
                      <td className="px-4 py-3">{c.job_worker_name}<span className="block text-[10px] text-textSecondary">{c.job_worker_gstin || 'Unregistered'}</span></td>
                      <td className="px-4 py-3 text-textSecondary">{fmtDate(c.challan_date)}</td>
                      <td className="px-4 py-3 text-danger">{fmtDate(c.return_due_date)}</td>
                      <td className="px-4 py-3 text-right font-mono text-danger">{c.days_overdue}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(num(c.value_at_risk))}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => openReceipt(c)} className="flex items-center gap-1 px-2 py-1 bg-primary text-black font-semibold rounded text-xs hover:bg-primary/90"><PackageCheck className="w-3.5 h-3.5" /> Receive</button>
                          <button type="button" onClick={() => setDeemFor(c)} className="flex items-center gap-1 px-2 py-1 bg-danger/20 text-danger border border-danger/40 font-semibold rounded text-xs hover:bg-danger/30"><Gavel className="w-3.5 h-3.5" /> Deem supply</button>
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

      {/* ─── ITC-04 ───────────────────────────────────────────────────────── */}
      {tab === 'itc04' && (
        <div className="glass-card p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-playfair font-semibold text-white">FORM ITC-04</h2>
              <p className="text-sm text-textSecondary">Goods sent to and received back from job workers in the quarter.</p>
            </div>
            <select value={quarterIdx} onChange={(e) => setQuarterIdx(Number(e.target.value))} className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-white">
              {quarters.map((q, i) => <option key={q.label} value={i}>{q.label}</option>)}
            </select>
          </div>
          {itcLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
          ) : itc ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="bg-surface rounded-lg p-3"><div className="text-xs text-textSecondary uppercase">Sent qty</div><div className="font-mono text-white text-lg">{fmtQty(itc.totals?.sent_quantity)}</div></div>
                <div className="bg-surface rounded-lg p-3"><div className="text-xs text-textSecondary uppercase">Sent value</div><div className="font-mono text-white text-lg">{formatCurrency(num(itc.totals?.sent_value))}</div></div>
                <div className="bg-surface rounded-lg p-3"><div className="text-xs text-textSecondary uppercase">Received qty</div><div className="font-mono text-emerald-400 text-lg">{fmtQty(itc.totals?.received_quantity)}</div></div>
                <div className="bg-surface rounded-lg p-3"><div className="text-xs text-textSecondary uppercase">Wastage qty</div><div className="font-mono text-warning text-lg">{fmtQty(itc.totals?.wastage_quantity)}</div></div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-2">Table 4 — goods sent to job worker</h3>
                <div className="w-full glass rounded-xl overflow-x-auto border border-border">
                  <table className="w-full text-xs text-left">
                    <thead className="text-textSecondary uppercase bg-surface"><tr><th className="px-3 py-2">Challan</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Job worker GSTIN / State</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">HSN</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Taxable value</th></tr></thead>
                    <tbody>
                      {itc.table_4_sent.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-textSecondary">Nothing sent in this quarter.</td></tr> :
                        itc.table_4_sent.map((r: any, i: number) => (
                          <tr key={i} className="bg-background border-b border-border/40 last:border-0">
                            <td className="px-3 py-2 font-mono text-white">{r.challan_no}</td>
                            <td className="px-3 py-2 text-textSecondary">{fmtDate(r.challan_date)}</td>
                            <td className="px-3 py-2">{r.job_worker_gstin || 'URP'} <span className="text-textSecondary">/ {r.state_code || '—'}</span><span className="block text-textSecondary">{r.job_worker_name}</span></td>
                            <td className="px-3 py-2">{r.description || r.material_name}</td>
                            <td className="px-3 py-2 font-mono">{r.hsn_code || '—'}</td>
                            <td className="px-3 py-2 text-right font-mono">{fmtQty(r.quantity_sent)} {r.uom || ''}</td>
                            <td className="px-3 py-2 text-right font-mono">{formatCurrency(num(r.taxable_value))}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-2">Table 5 — goods received back from job worker</h3>
                <div className="w-full glass rounded-xl overflow-x-auto border border-border">
                  <table className="w-full text-xs text-left">
                    <thead className="text-textSecondary uppercase bg-surface"><tr><th className="px-3 py-2">Receipt</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Against challan</th><th className="px-3 py-2">Job worker</th><th className="px-3 py-2">Material</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Wastage</th></tr></thead>
                    <tbody>
                      {itc.table_5_received.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-textSecondary">Nothing received in this quarter.</td></tr> :
                        itc.table_5_received.map((r: any, i: number) => (
                          <tr key={i} className="bg-background border-b border-border/40 last:border-0">
                            <td className="px-3 py-2 font-mono text-white">{r.receipt_no}</td>
                            <td className="px-3 py-2 text-textSecondary">{fmtDate(r.receipt_date)}</td>
                            <td className="px-3 py-2 font-mono">{r.challan_no} <span className="text-textSecondary">({fmtDate(r.challan_date)})</span></td>
                            <td className="px-3 py-2">{r.job_worker_name}<span className="block text-textSecondary">{r.job_worker_gstin || 'URP'}</span></td>
                            <td className="px-3 py-2">{r.material_code} — {r.material_name}</td>
                            <td className="px-3 py-2 text-right font-mono text-emerald-400">{fmtQty(r.quantity_received)}</td>
                            <td className="px-3 py-2 text-right font-mono text-textSecondary">{fmtQty(r.quantity_wastage)} ({r.wastage_pct}%)</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-textSecondary">{itc.note}</p>
            </>
          ) : null}
        </div>
      )}

      {/* ─── New challan modal ────────────────────────────────────────────── */}
      <Modal isOpen={isNewOpen} onClose={() => setIsNewOpen(false)} title="Issue job work challan">
        <form onSubmit={submitChallan} className="space-y-5 text-sm">
          {formError && <div className="p-3 bg-danger/10 border border-danger/20 rounded-md text-danger text-xs">{formError}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-textSecondary mb-1">Karigar / job worker *</label>
              <PartySelect value={workerId} onChange={(id) => setWorkerId(id)} types={['Karigar', 'Supplier']} placeholder="Search karigars and suppliers..." />
              <p className="text-[11px] text-textSecondary mt-1">Only parties filed as Karigar or Supplier: their making charges post to Sundry Creditors.</p>
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">Challan date *</label>
              <input type="date" required value={challanDate} onChange={(e) => onChallanDateChange(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">Goods type</label>
              <select value={goodsType} onChange={(e) => onGoodsTypeChange(e.target.value)} className={inputCls}>
                <option value="Input">Inputs (return within 1 year)</option>
                <option value="CapitalGoods">Capital goods (return within 3 years)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">Expected return *</label>
              <input type="date" required value={expectedReturn} max={legalDeadline(challanDate || today(), goodsType)} onChange={(e) => setExpectedReturn(e.target.value)} className={inputCls} />
              <p className="text-[11px] text-textSecondary mt-1">Legal deadline (s.143): {fmtDate(legalDeadline(challanDate || today(), goodsType))}</p>
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">Nature of work</label>
              <input type="text" value={natureOfWork} onChange={(e) => setNatureOfWork(e.target.value)} placeholder="e.g. Bangle making, kundan setting" className={inputCls} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-white">Goods sent</h4>
              <button type="button" onClick={() => { setLines((p) => [...p, newLine(lineKey)]); setLineKey((k) => k + 1); }} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add line</button>
            </div>
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="bg-surface/60 border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <ItemSelect value={l.material_id} onChange={(id, item) => onItemPicked(l.key, id, item)} placeholder="Search stock item..." />
                    </div>
                    <button type="button" onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))} className="p-2 text-textSecondary hover:text-danger" title="Remove line"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    <div>
                      <label className="block text-[10px] text-textSecondary">Qty{l.unit ? ` (${l.unit})` : ''} *</label>
                      <input type="number" step="0.001" min="0" value={l.quantity_sent} onChange={(e) => updateLine(l.key, { quantity_sent: e.target.value })} className={cellInputCls} />
                    </div>
                    <div>
                      <label className="block text-[10px] text-textSecondary">Gross wt (g)</label>
                      <input type="number" step="0.001" min="0" value={l.gross_weight} onChange={(e) => updateLine(l.key, { gross_weight: e.target.value })} className={cellInputCls} />
                    </div>
                    <div>
                      <label className="block text-[10px] text-textSecondary">Net wt (g)</label>
                      <input type="number" step="0.001" min="0" value={l.net_weight} onChange={(e) => updateLine(l.key, { net_weight: e.target.value })} className={cellInputCls} />
                    </div>
                    <div>
                      <label className="block text-[10px] text-textSecondary">Purity %</label>
                      <input type="number" step="0.1" min="0" max="100" value={l.purity_pct} onChange={(e) => updateLine(l.key, { purity_pct: e.target.value })} className={cellInputCls} />
                    </div>
                    <div>
                      <label className="block text-[10px] text-textSecondary">Value (Rs)</label>
                      <input type="number" step="0.01" min="0" value={l.taxable_value} onChange={(e) => updateLine(l.key, { taxable_value: e.target.value })} placeholder="our cost" className={cellInputCls} />
                    </div>
                    <div>
                      <label className="block text-[10px] text-textSecondary">HSN</label>
                      <input type="text" value={l.hsn_code} onChange={(e) => updateLine(l.key, { hsn_code: e.target.value })} className={cellInputCls} />
                    </div>
                  </div>
                  <input type="text" value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })} placeholder="Description on the challan (optional)" className={cellInputCls} />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-textSecondary mt-2">Value is for the challan and ITC-04 only; leave blank to use our weighted-average cost. No GST is charged on a job work dispatch.</p>
          </div>

          <div>
            <label className="block text-xs text-textSecondary mb-1">Remarks</label>
            <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputCls} placeholder="Design reference, expected finish, instructions to the karigar" />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="text-xs text-textSecondary">{lines.filter((l) => l.material_id).length} line(s) · value {formatCurrency(totalLineValue)}</div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setIsNewOpen(false)} className="px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5">Cancel</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Issue challan
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ─── Receipt modal ────────────────────────────────────────────────── */}
      {receiptFor && (
        <Modal isOpen={!!receiptFor} onClose={() => setReceiptFor(null)} title={`Receive against ${receiptFor.challan_no} — ${receiptFor.job_worker_name}`}>
          {receiptResult ? (
            <div className="space-y-4 text-sm">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300">
                <div className="font-semibold">Receipt {receiptResult.receipt_no} recorded — challan {statusLabel(receiptResult.challan_status)}</div>
                <div className="text-xs mt-1">Stock value in: {formatCurrency(num(receiptResult.stock_value_in))} (metal {formatCurrency(num(receiptResult.metal_cost))} + making charges). Outstanding: {fmtQty(receiptResult.outstanding_quantity)}.</div>
              </div>
              {receiptResult.making_charge_bill ? (
                <div className="p-4 bg-surface border border-border rounded-lg space-y-1">
                  <div className="text-white font-semibold flex items-center gap-2"><ReceiptIcon className="w-4 h-4 text-primary" /> Karigar bill {receiptResult.making_charge_bill.bill_no}{receiptResult.making_charge_bill.reverse_charge && <Badge variant="warning">Reverse charge</Badge>}</div>
                  <div className="text-xs text-textSecondary">Taxable {formatCurrency(num(receiptResult.making_charges_tax.taxable_value))} at {receiptResult.making_charges_tax.rate}% (SAC 998892) — CGST {formatCurrency(num(receiptResult.making_charges_tax.cgst))}, SGST {formatCurrency(num(receiptResult.making_charges_tax.sgst))}, IGST {formatCurrency(num(receiptResult.making_charges_tax.igst))}.</div>
                  {receiptResult.capitalisation_journal_no && <div className="text-xs text-textSecondary">Making charges moved into stock by journal {receiptResult.capitalisation_journal_no}.</div>}
                </div>
              ) : (
                <div className="text-xs text-textSecondary">No making charges recorded on this receipt.</div>
              )}
              {receiptResult.was_overdue && <div className="text-xs text-danger flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Received after the s.143 deadline: the dispatch was a deemed supply from the challan date until now. Review the tax position.</div>}
              <div className="flex justify-end pt-3 border-t border-border">
                <button type="button" onClick={() => setReceiptFor(null)} className="px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90">Done</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              {receiptError && <div className="p-3 bg-danger/10 border border-danger/20 rounded-md text-danger text-xs">{receiptError}</div>}
              {receiptFor.is_overdue && <div className="p-3 bg-danger/10 border border-danger/30 rounded-md text-danger text-xs flex items-center gap-2"><Clock className="w-4 h-4" /> This challan is past its s.143 deadline ({fmtDate(receiptFor.return_due_date)}).</div>}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-textSecondary mb-1">Receipt date *</label>
                  <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-textSecondary mb-1">Making charges (Rs, before GST)</label>
                  <input type="number" step="0.01" min="0" value={makingCharges} onChange={(e) => setMakingCharges(e.target.value)} className={inputCls + ' font-mono'} placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs text-textSecondary mb-1">Karigar&apos;s bill no</label>
                  <input type="text" value={karigarBillNo} onChange={(e) => setKarigarBillNo(e.target.value)} className={inputCls} placeholder="optional" />
                </div>
              </div>
              <div className="w-full glass rounded-xl overflow-x-auto border border-border">
                <table className="w-full text-xs text-left">
                  <thead className="text-textSecondary uppercase bg-surface"><tr><th className="px-3 py-2">Line</th><th className="px-3 py-2 text-right">Outstanding</th><th className="px-3 py-2">Received</th><th className="px-3 py-2">Wastage</th><th className="px-3 py-2">Gross wt</th><th className="px-3 py-2">Net wt</th></tr></thead>
                  <tbody>
                    {receiptLines.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-textSecondary">Nothing outstanding on this challan.</td></tr> :
                      receiptLines.map((l) => (
                        <tr key={l.challan_line_id} className="bg-background border-b border-border/40 last:border-0">
                          <td className="px-3 py-2 text-white">{l.label}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmtQty(l.outstanding)}</td>
                          <td className="px-3 py-2 w-28"><input type="number" step="0.001" min="0" value={l.quantity_received} onChange={(e) => updateReceiptLine(l.challan_line_id, { quantity_received: e.target.value })} className={cellInputCls} /></td>
                          <td className="px-3 py-2 w-28"><input type="number" step="0.001" min="0" value={l.quantity_wastage} onChange={(e) => updateReceiptLine(l.challan_line_id, { quantity_wastage: e.target.value })} className={cellInputCls} /></td>
                          <td className="px-3 py-2 w-24"><input type="number" step="0.001" min="0" value={l.gross_weight} onChange={(e) => updateReceiptLine(l.challan_line_id, { gross_weight: e.target.value })} className={cellInputCls} /></td>
                          <td className="px-3 py-2 w-24"><input type="number" step="0.001" min="0" value={l.net_weight} onChange={(e) => updateReceiptLine(l.challan_line_id, { net_weight: e.target.value })} className={cellInputCls} /></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Remarks</label>
                <input type="text" value={receiptRemarks} onChange={(e) => setReceiptRemarks(e.target.value)} className={inputCls} />
              </div>
              <div className="p-3 bg-surface border border-border rounded-lg text-xs text-textSecondary space-y-1">
                <strong className="text-white block font-medium">What this posts:</strong>
                <p>• Stock in at full cost: the metal at the rate it went out (wastage included) plus the making charges.</p>
                <p>• Making charges &gt; 0: a purchase bill on the karigar (SAC 998892 at 5%, ITC; reverse charge when the karigar is unregistered) and a journal moving the charges from expense into stock. Needs a posting role.</p>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button type="button" onClick={() => setReceiptFor(null)} className="px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5">Cancel</button>
                <button type="button" onClick={submitReceipt} disabled={receiving || receiptLines.length === 0} className="flex items-center gap-2 px-5 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50">
                  {receiving && <Loader2 className="w-4 h-4 animate-spin" />} Record receipt{num(makingCharges) > 0 ? ' & bill' : ''}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ─── Deem supply confirm ──────────────────────────────────────────── */}
      {deemFor && (
        <Modal isOpen={!!deemFor} onClose={() => setDeemFor(null)} title={`Deem ${deemFor.challan_no} supplied?`}>
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs space-y-1">
              <p className="font-semibold">CGST s.143(3): inputs not returned within one year are deemed supplied by the principal to the job worker on the day they were sent.</p>
              <p>A tax invoice will be raised on <strong>{deemFor.job_worker_name}</strong> for the {fmtQty(deemFor.quantity_outstanding)} still outstanding at the challan value, the outstanding metal is treated as returned and sold, and the challan is closed as a deemed supply. Interest runs from {fmtDate(deemFor.challan_date)}.</p>
            </div>
            <p className="text-xs text-textSecondary">If the goods have in fact come back, record a receipt instead. This cannot be undone from here; the invoice can be cancelled from Sales.</p>
            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <button type="button" onClick={() => setDeemFor(null)} className="px-4 py-2 border border-border rounded-lg text-white hover:bg-white/5">Cancel</button>
              <button type="button" onClick={confirmDeemSupply} disabled={deeming} className="flex items-center gap-2 px-5 py-2 bg-danger text-white font-semibold rounded-lg hover:bg-danger/90 disabled:opacity-50">
                {deeming && <Loader2 className="w-4 h-4 animate-spin" />} <Gavel className="w-4 h-4" /> Deem supplied & invoice
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Challan detail ───────────────────────────────────────────────── */}
      {(detail || detailLoading) && (
        <Modal isOpen onClose={() => setDetail(null)} title={detail ? `Challan ${detail.challan_no}` : 'Loading...'}>
          {!detail ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div><div className="text-textSecondary">Karigar</div><div className="text-white">{detail.job_worker_name}</div><div className="text-textSecondary">{detail.job_worker_gstin || 'Unregistered'}</div></div>
                <div><div className="text-textSecondary">Sent on</div><div className="text-white">{fmtDate(detail.challan_date)}</div></div>
                <div><div className="text-textSecondary">Return due</div><div className={detail.is_overdue ? 'text-danger font-semibold' : 'text-white'}>{fmtDate(detail.return_due_date)}</div><div className="text-textSecondary">legal: {fmtDate(detail.legal_return_due_date)}</div></div>
                <div><div className="text-textSecondary">Status</div><Badge variant={statusVariant(detail.status, detail.is_overdue)}>{detail.is_overdue ? 'OVERDUE' : statusLabel(detail.status)}</Badge></div>
              </div>
              {detail.nature_of_work && <div className="text-xs text-textSecondary">Nature of work: <span className="text-white">{detail.nature_of_work}</span></div>}
              <div className="w-full glass rounded-xl overflow-x-auto border border-border">
                <table className="w-full text-xs text-left">
                  <thead className="text-textSecondary uppercase bg-surface"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Item</th><th className="px-3 py-2">HSN</th><th className="px-3 py-2 text-right">Sent</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">Net</th><th className="px-3 py-2 text-right">Purity</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2 text-right">Back</th><th className="px-3 py-2 text-right">Waste</th><th className="px-3 py-2 text-right">Out</th></tr></thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.id} className="bg-background border-b border-border/40 last:border-0">
                        <td className="px-3 py-2">{l.sequence_no}</td>
                        <td className="px-3 py-2 text-white">{l.material_code} — {l.description || l.material_name}</td>
                        <td className="px-3 py-2 font-mono">{l.hsn_code || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtQty(l.quantity_sent)} {l.uom || ''}</td>
                        <td className="px-3 py-2 text-right font-mono">{l.gross_weight != null ? num(l.gross_weight).toFixed(3) : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{l.net_weight != null ? num(l.net_weight).toFixed(3) : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{l.purity != null ? `${(num(l.purity) * 100).toFixed(1)}%` : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(num(l.taxable_value))}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-400">{fmtQty(l.quantity_received)}</td>
                        <td className="px-3 py-2 text-right font-mono text-textSecondary">{fmtQty(l.quantity_wastage)}</td>
                        <td className="px-3 py-2 text-right font-mono text-white">{fmtQty(l.quantity_outstanding)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {detail.receipts.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-white mb-2">Receipts</h4>
                  <div className="space-y-1">
                    {detail.receipts.map((r: any) => (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 bg-surface/60 border border-border rounded-lg px-3 py-2 text-xs">
                        <span className="font-mono text-white">{r.receipt_no} <span className="text-textSecondary">{fmtDate(r.receipt_date)}</span></span>
                        <span>back <span className="font-mono text-emerald-400">{fmtQty(r.quantity_received)}</span> · waste <span className="font-mono">{fmtQty(r.quantity_wastage)}</span> · stock value {formatCurrency(num(r.cost_amount))}</span>
                        <span>making {formatCurrency(num(r.making_charges))}{r.making_charge_bill_no && <span className="text-textSecondary"> · bill {r.making_charge_bill_no}</span>}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detail.remarks && <div className="text-xs text-textSecondary">Remarks: {detail.remarks}</div>}
              <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-border">
                <button type="button" onClick={() => openStatement(detail.job_worker_id)} className="flex items-center gap-1 px-3 py-2 border border-border rounded-lg text-white hover:bg-white/5 text-xs"><User className="w-4 h-4" /> Karigar statement</button>
                <button type="button" onClick={() => generateJobWorkChallanPDF(detail, 'download', detail.company || company)} className="flex items-center gap-1 px-3 py-2 border border-border rounded-lg text-white hover:bg-white/5 text-xs"><Download className="w-4 h-4" /> PDF</button>
                <button type="button" onClick={() => generateJobWorkChallanPDF(detail, 'print', detail.company || company)} className="flex items-center gap-1 px-3 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 text-xs"><Printer className="w-4 h-4" /> Print challan</button>
                {(detail.status === 'Open' || detail.status === 'PartiallyReceived') && (
                  <button type="button" onClick={() => { setDetail(null); openReceipt(detail); }} className="flex items-center gap-1 px-3 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold rounded-lg text-xs"><PackageCheck className="w-4 h-4" /> Receive</button>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ─── Karigar statement drawer ─────────────────────────────────────── */}
      {statement && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={() => setStatement(null)}>
          <div className="w-full max-w-2xl h-full bg-surface border-l border-border overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-playfair font-semibold text-white flex items-center gap-2"><Hammer className="w-5 h-5 text-primary" /> {statement.party?.name || 'Karigar statement'}</h2>
                {statement.party?.party_code && <p className="text-xs text-textSecondary">{statement.party.party_code} · {statement.party.party_type} · {statement.party.gstin || 'Unregistered'}{statement.party.karigar_skills ? ` · ${statement.party.karigar_skills}` : ''}</p>}
              </div>
              <button type="button" onClick={() => setStatement(null)} className="text-textSecondary hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            {statementLoading || !statement.summary ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="bg-background rounded-lg p-3"><div className="text-textSecondary uppercase">Sent</div><div className="font-mono text-white text-lg">{fmtQty(statement.summary.quantity_sent)}</div></div>
                  <div className="bg-background rounded-lg p-3"><div className="text-textSecondary uppercase">Received back</div><div className="font-mono text-emerald-400 text-lg">{fmtQty(statement.summary.quantity_received)}</div></div>
                  <div className="bg-background rounded-lg p-3"><div className="text-textSecondary uppercase">Wastage</div><div className="font-mono text-warning text-lg">{fmtQty(statement.summary.quantity_wastage)} <span className="text-xs">({statement.summary.wastage_pct}%)</span></div></div>
                  <div className="bg-background rounded-lg p-3"><div className="text-textSecondary uppercase">Still with karigar</div><div className="font-mono text-white text-lg">{fmtQty(statement.summary.quantity_outstanding)}</div><div className="text-textSecondary">{statement.summary.overdue_challans} overdue · {formatCurrency(num(statement.summary.value_at_risk))} at risk</div></div>
                  <div className="bg-background rounded-lg p-3"><div className="text-textSecondary uppercase">Making charges billed</div><div className="font-mono text-white text-lg">{formatCurrency(num(statement.summary.making_charges_billed))}</div><div className="text-textSecondary">bills incl. tax {formatCurrency(num(statement.summary.bills_total))}</div></div>
                  <div className="bg-background rounded-lg p-3"><div className="text-textSecondary uppercase">Payable balance</div><div className={`font-mono text-lg ${num(statement.summary.payable_balance) > 0 ? 'text-danger' : 'text-emerald-400'}`}>{formatCurrency(num(statement.summary.payable_balance))}</div></div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">Challans out ({statement.challans.length})</h3>
                  <div className="w-full glass rounded-xl overflow-x-auto border border-border">
                    <table className="w-full text-xs text-left">
                      <thead className="text-textSecondary uppercase bg-background"><tr><th className="px-3 py-2">Challan</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Sent</th><th className="px-3 py-2 text-right">Back</th><th className="px-3 py-2 text-right">Waste</th><th className="px-3 py-2 text-right">Out</th><th className="px-3 py-2">Status</th></tr></thead>
                      <tbody>
                        {statement.challans.length === 0 ? <tr><td colSpan={8} className="px-3 py-4 text-center text-textSecondary">None</td></tr> :
                          statement.challans.map((c: any) => (
                            <tr key={c.id} className={`border-b border-border/40 last:border-0 ${c.is_overdue ? 'bg-danger/10' : ''}`}>
                              <td className="px-3 py-2 font-mono text-white"><button type="button" className="hover:text-primary" onClick={() => openDetail(c)}>{c.challan_no}</button></td>
                              <td className="px-3 py-2 text-textSecondary">{fmtDate(c.challan_date)}</td>
                              <td className={`px-3 py-2 ${c.is_overdue ? 'text-danger' : 'text-textSecondary'}`}>{fmtDate(c.return_due_date)}</td>
                              <td className="px-3 py-2 text-right font-mono">{fmtQty(c.quantity_sent)}</td>
                              <td className="px-3 py-2 text-right font-mono text-emerald-400">{fmtQty(c.quantity_received)}</td>
                              <td className="px-3 py-2 text-right font-mono">{fmtQty(c.quantity_wastage)}</td>
                              <td className="px-3 py-2 text-right font-mono text-white">{fmtQty(c.quantity_outstanding)}</td>
                              <td className="px-3 py-2"><Badge variant={statusVariant(c.status, c.is_overdue)}>{c.is_overdue ? 'OVERDUE' : statusLabel(c.status)}</Badge></td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">Receipts in ({statement.receipts.length})</h3>
                  <div className="w-full glass rounded-xl overflow-x-auto border border-border">
                    <table className="w-full text-xs text-left">
                      <thead className="text-textSecondary uppercase bg-background"><tr><th className="px-3 py-2">Receipt</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Challan</th><th className="px-3 py-2 text-right">Back</th><th className="px-3 py-2 text-right">Waste</th><th className="px-3 py-2 text-right">Stock value</th><th className="px-3 py-2 text-right">Making</th><th className="px-3 py-2">Bill</th></tr></thead>
                      <tbody>
                        {statement.receipts.length === 0 ? <tr><td colSpan={8} className="px-3 py-4 text-center text-textSecondary">None</td></tr> :
                          statement.receipts.map((r: any) => (
                            <tr key={r.id} className="border-b border-border/40 last:border-0">
                              <td className="px-3 py-2 font-mono text-white">{r.receipt_no}</td>
                              <td className="px-3 py-2 text-textSecondary">{fmtDate(r.receipt_date)}</td>
                              <td className="px-3 py-2 font-mono">{r.challan_no}</td>
                              <td className="px-3 py-2 text-right font-mono text-emerald-400">{fmtQty(r.quantity_received)}</td>
                              <td className="px-3 py-2 text-right font-mono">{fmtQty(r.quantity_wastage)}</td>
                              <td className="px-3 py-2 text-right font-mono">{formatCurrency(num(r.cost_amount))}</td>
                              <td className="px-3 py-2 text-right font-mono">{formatCurrency(num(r.making_charges))}</td>
                              <td className="px-3 py-2 font-mono">{r.making_charge_bill_no || '—'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">Making-charge bills ({statement.bills.length})</h3>
                  <div className="w-full glass rounded-xl overflow-x-auto border border-border">
                    <table className="w-full text-xs text-left">
                      <thead className="text-textSecondary uppercase bg-background"><tr><th className="px-3 py-2">Bill</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Karigar ref</th><th className="px-3 py-2 text-right">Taxable</th><th className="px-3 py-2 text-right">GST</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Status</th></tr></thead>
                      <tbody>
                        {statement.bills.length === 0 ? <tr><td colSpan={7} className="px-3 py-4 text-center text-textSecondary">None</td></tr> :
                          statement.bills.map((b: any) => (
                            <tr key={b.id} className="border-b border-border/40 last:border-0">
                              <td className="px-3 py-2 font-mono text-white">{b.bill_no}{b.is_rcm_applicable && <span className="ml-1 text-[10px] text-warning">RCM</span>}</td>
                              <td className="px-3 py-2 text-textSecondary">{fmtDate(b.bill_date)}</td>
                              <td className="px-3 py-2">{b.vendor_inv_no || '—'}</td>
                              <td className="px-3 py-2 text-right font-mono">{formatCurrency(num(b.subtotal_value))}</td>
                              <td className="px-3 py-2 text-right font-mono">{formatCurrency(num(b.total_gst) + num(b.rcm_cgst) + num(b.rcm_sgst))}</td>
                              <td className="px-3 py-2 text-right font-mono text-white">{formatCurrency(num(b.grand_total))}</td>
                              <td className="px-3 py-2"><Badge variant={b.status === 'Cancelled' ? 'danger' : 'default'}>{b.status || 'Posted'}</Badge></td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
