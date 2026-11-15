"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Eye, Loader2, Mail, Plus, Printer, Trash2, X } from 'lucide-react';

import Badge from '@/components/ui/Badge';
import DataTable from '@/components/ui/DataTable';
import ItemSelect, { StockItem } from '@/components/ui/ItemSelect';
import Modal from '@/components/ui/Modal';
import PartySelect from '@/components/ui/PartySelect';
import { mailApi, ordersApi, OrderDocType, OrderDocument } from '@/lib/api';
import EmailDialog from '@/components/mail/EmailDialog';
import { useCompany } from '@/lib/company';
import { isoDate, today } from '@/lib/fiscal';
import { useQuickCreate } from '@/lib/quickCreate';
import { formatCurrency } from '@/lib/utils';

// Quotes, sales orders and purchase orders: documents of intent. Nothing here
// posts to the ledger or moves stock; that happens when the invoice or bill is
// raised from them, through the ordinary invoice and bill forms.

const TYPES: { id: OrderDocType; label: string; one: string; party: 'Customer' | 'Supplier'; dateLabel: string }[] = [
  { id: 'Quote', label: 'Quotes', one: 'Quote', party: 'Customer', dateLabel: 'Valid Until' },
  { id: 'SalesOrder', label: 'Sales Orders', one: 'Sales Order', party: 'Customer', dateLabel: 'Delivery By' },
  { id: 'PurchaseOrder', label: 'Purchase Orders', one: 'Purchase Order', party: 'Supplier', dateLabel: 'Expected By' },
];

interface Line {
  id: number; material_id: string; description: string; hsn_sac_code: string; quantity: number; net_weight: number;
  material_value: number; making_charges: number; discount_pct: number; material_gst_rate: number; making_gst_rate: number;
}
const newLine = (id: number, sales: boolean): Line => ({
  id, material_id: '', description: '', hsn_sac_code: '71131910', quantity: 1, net_weight: 0,
  material_value: 0, making_charges: 0, discount_pct: 0, material_gst_rate: 3, making_gst_rate: sales ? 5 : 3,
});

// Same arithmetic as app/api/v1/orders.py line_amounts.
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const amounts = (l: Line) => {
  const keep = (100 - (Number(l.discount_pct) || 0)) / 100;
  const material = r2((Number(l.material_value) || 0) * keep);
  const making = r2((Number(l.making_charges) || 0) * keep);
  const gst = r2(material * (Number(l.material_gst_rate) || 0) / 100) + r2(making * (Number(l.making_gst_rate) || 0) / 100);
  const gross = r2((Number(l.material_value) || 0) + (Number(l.making_charges) || 0));
  return { gross, taxable: material + making, discount: gross - (material + making), gst, total: material + making + gst };
};

const statusVariant = (s: string) => (s === 'Open' ? 'info' : s === 'Accepted' ? 'success' : s === 'Converted' ? 'success' : s === 'Declined' ? 'danger' : 'default');
const fieldCls = 'w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:border-primary outline-none';
const cellCls = 'w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-textPrimary focus:border-primary outline-none';

export default function OrdersPage() {
  const router = useRouter();
  const { company } = useCompany();
  const [docType, setDocType] = useState<OrderDocType>('Quote');
  const meta = TYPES.find((t) => t.id === docType)!;
  const isSales = docType !== 'PurchaseOrder';

  const [rows, setRows] = useState<OrderDocument[]>([]);
  const [openValue, setOpenValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<OrderDocument | null>(null);
  const [mailing, setMailing] = useState<OrderDocument | null>(null);

  // Form
  const [open, setOpen] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [docDate, setDocDate] = useState(today());
  const [validUntil, setValidUntil] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine(1, true)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await ordersApi.list({ doc_type: docType });
      setRows(res.data?.documents || []);
      setOpenValue(Number(res.data?.open_value || 0));
    } catch {
      setRows([]); setOpenValue(0);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [docType]);

  // /orders?type=PurchaseOrder selects the tab.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('type');
    if (t && TYPES.some((x) => x.id === t)) setDocType(t as OrderDocType);
  }, []);

  const openNew = () => {
    const d = new Date(); d.setDate(d.getDate() + 15);
    setPartyId(''); setDocDate(today()); setValidUntil(docType === 'Quote' ? isoDate(d) : '');
    setReferenceNo(''); setNotes(''); setTerms(''); setError('');
    setLines([newLine(1, isSales)]);
    setOpen(true);
  };
  useQuickCreate(openNew);

  const setLine = (id: number, patch: Partial<Line>) => setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const pickItem = (id: number, item?: StockItem) => setLine(id, item
    ? { material_id: item.id, description: item.name, hsn_sac_code: item.hsn_code || '', material_gst_rate: Number(item.material_gst_rate ?? item.gst_tax_rate ?? 3), ...(isSales ? {} : { making_gst_rate: Number(item.gst_tax_rate ?? 3) }) }
    : { material_id: '' });

  const totals = lines.reduce((t, l) => { const a = amounts(l); return { gross: t.gross + a.gross, discount: t.discount + a.discount, gst: t.gst + a.gst, total: t.total + a.total }; }, { gross: 0, discount: 0, gst: 0, total: 0 });

  const save = async () => {
    setError('');
    if (!partyId) { setError(`Choose the ${meta.party.toLowerCase()}.`); return; }
    const valid = lines.filter((l) => (Number(l.material_value) || 0) + (Number(l.making_charges) || 0) > 0);
    if (valid.length === 0) { setError('Enter a value on at least one line.'); return; }
    if (valid.some((l) => !l.material_id && !l.description.trim())) { setError('Each line needs an item or a description.'); return; }
    setSaving(true);
    try {
      await ordersApi.create({
        doc_type: docType, party_id: partyId, doc_date: docDate, valid_until: validUntil || undefined,
        reference_no: referenceNo.trim() || undefined, notes: notes.trim() || undefined, terms: terms.trim() || undefined,
        lines: valid.map((l) => ({
          material_id: l.material_id || undefined, description: l.description || undefined, hsn_sac_code: l.hsn_sac_code || undefined,
          quantity: Number(l.quantity) > 0 ? Number(l.quantity) : 1, net_weight: Number(l.net_weight) || undefined,
          material_value: Number(l.material_value) || 0, making_charges: Number(l.making_charges) || 0,
          discount_pct: Number(l.discount_pct) || 0, material_gst_rate: Number(l.material_gst_rate) || 0, making_gst_rate: Number(l.making_gst_rate) || 0,
        })),
      });
      setOpen(false);
      load();
    } catch (err: any) {
      const d = err.response?.data?.detail;
      setError(typeof d === 'string' ? d : 'Could not save the document.');
    } finally {
      setSaving(false);
    }
  };

  const act = async (doc: OrderDocument, what: 'Accepted' | 'Declined' | 'Cancelled' | 'Open' | 'toSalesOrder') => {
    if (what === 'Cancelled' && !confirm(`Cancel ${doc.doc_no}?`)) return;
    setBusy(doc.id);
    try {
      if (what === 'toSalesOrder') {
        const res = await ordersApi.toSalesOrder(doc.id);
        alert(`${doc.doc_no} became sales order ${res.data?.doc_no}.`);
      } else {
        await ordersApi.setStatus(doc.id, what);
      }
      load();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const view = async (doc: OrderDocument) => {
    try { setViewing((await ordersApi.get(doc.id)).data); } catch { alert('Could not open the document.'); }
  };

  const canConvert = (d: OrderDocument) => d.status === 'Open' || d.status === 'Accepted';
  const btn = 'px-2 py-1 bg-surface border border-border hover:border-primary text-textSecondary hover:text-textPrimary rounded text-xs flex items-center gap-1 disabled:opacity-50';

  const columns = [
    { header: 'Date / No', accessorKey: 'doc_date', cell: (d: OrderDocument) => (
      <span>
        <span className="block text-textPrimary text-sm">{new Date(d.doc_date).toLocaleDateString('en-IN')}</span>
        <button className="font-mono text-primary hover:underline text-[11px]" onClick={() => view(d)}>{d.doc_no}</button>
      </span>
    ) },
    { header: meta.party === 'Customer' ? 'Customer' : 'Vendor', accessorKey: 'party_name', cell: (d: OrderDocument) => (
      <span>
        <span className="block font-medium text-textPrimary">{d.party_name}</span>
        <span className="block text-xs text-textSecondary">{[d.reference_no, d.valid_until ? `${meta.dateLabel.toLowerCase()} ${new Date(d.valid_until).toLocaleDateString('en-IN')}` : null].filter(Boolean).join(' · ') || '—'}</span>
      </span>
    ) },
    { header: 'Amount (₹)', accessorKey: 'grand_total', cell: (d: OrderDocument) => <span className="font-mono font-semibold text-textPrimary">{formatCurrency(d.grand_total)}</span> },
    { header: 'Status', accessorKey: 'status', cell: (d: OrderDocument) => (
      <span>
        <Badge variant={statusVariant(d.status) as any}>{d.status}</Badge>
        {d.converted_to && <span className="block text-[11px] text-textSecondary mt-1 font-mono">→ {d.converted_to}</span>}
      </span>
    ) },
    { header: 'Actions', accessorKey: 'id', cell: (d: OrderDocument) => (
      <span className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
        <button className={btn} onClick={() => view(d)} title="View / print"><Eye className="w-3.5 h-3.5" /></button>
        {d.status === 'Open' && docType !== 'PurchaseOrder' && (
          <button className={btn} disabled={busy === d.id} onClick={() => act(d, 'Accepted')} title="Customer accepted"><Check className="w-3.5 h-3.5" /> Accept</button>
        )}
        {canConvert(d) && docType === 'Quote' && (
          <button className={btn} disabled={busy === d.id} onClick={() => act(d, 'toSalesOrder')}><ArrowRight className="w-3.5 h-3.5" /> Order</button>
        )}
        {canConvert(d) && isSales && (
          <button className={btn} onClick={() => router.push(`/sales?from_order=${d.id}`)}><ArrowRight className="w-3.5 h-3.5" /> Invoice</button>
        )}
        {canConvert(d) && !isSales && (
          <button className={btn} onClick={() => router.push(`/purchases?from_po=${d.id}`)}><ArrowRight className="w-3.5 h-3.5" /> Bill</button>
        )}
        {d.status === 'Open' && docType === 'Quote' && (
          <button className={btn} disabled={busy === d.id} onClick={() => act(d, 'Declined')} title="Customer declined"><X className="w-3.5 h-3.5" /></button>
        )}
        {d.status === 'Declined' && <button className={btn} disabled={busy === d.id} onClick={() => act(d, 'Open')}>Reopen</button>}
        {canConvert(d) && <button className={btn} disabled={busy === d.id} onClick={() => act(d, 'Cancelled')} title="Cancel"><Trash2 className="w-3.5 h-3.5" /></button>}
      </span>
    ) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-textPrimary">Quotes &amp; Orders</h1>
          <p className="text-textSecondary mt-1">A price quoted, an order taken, an order placed. Nothing posts to the books until the invoice or bill is raised.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-gold-gradient text-background font-semibold text-sm rounded-lg hover:opacity-90 whitespace-nowrap">
          <Plus className="w-4 h-4" /> New {meta.one}
        </button>
      </div>

      <div className="glass-card p-2 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex gap-1">
          {TYPES.map((t) => (
            <button key={t.id} onClick={() => setDocType(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${docType === t.id ? 'bg-primary text-black' : 'text-textSecondary hover:text-textPrimary'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="text-sm text-textSecondary px-3">Open value <span className="text-primary font-mono font-semibold">{formatCurrency(openValue)}</span></div>
      </div>

      <div className="glass-card p-6 print:hidden">
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-textSecondary text-sm">No {meta.label.toLowerCase()} yet.</div>
        ) : (
          <DataTable columns={columns} data={rows} />
        )}
      </div>

      {/* New document */}
      <Modal isOpen={open} onClose={() => setOpen(false)} title={`New ${meta.one}`}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <label className="text-xs text-textSecondary">{meta.party === 'Customer' ? 'Customer' : 'Vendor'} *</label>
              <PartySelect value={partyId} onChange={(id) => setPartyId(id)} partyType={meta.party} placeholder={`Search ${meta.party.toLowerCase()}...`} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Date *</label>
              <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={fieldCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">{meta.dateLabel}</label>
              <input type="date" value={validUntil} min={docDate} onChange={(e) => setValidUntil(e.target.value)} className={fieldCls} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-textPrimary">Lines</span>
              <button type="button" onClick={() => setLines([...lines, newLine(Date.now(), isSales)])} className="text-xs text-primary flex items-center gap-1 hover:text-textPrimary"><Plus className="w-3.5 h-3.5" /> Add line</button>
            </div>
            {lines.map((l, i) => (
              <div key={l.id} className="p-3 bg-surface/50 border border-border rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-primary font-semibold w-5">#{i + 1}</span>
                  <div className="flex-1"><ItemSelect value={l.material_id} onChange={(id, item) => pickItem(l.id, item)} placeholder="Item from master (optional)" /></div>
                  {lines.length > 1 && <button type="button" onClick={() => setLines(lines.filter((x) => x.id !== l.id))} className="text-textSecondary hover:text-danger"><Trash2 className="w-4 h-4" /></button>}
                </div>
                <input type="text" value={l.description} maxLength={500} onChange={(e) => setLine(l.id, { description: e.target.value })} placeholder="Description (e.g. 22K gold chain, 12 gm)" className={cellCls} />
                <div className="grid grid-cols-6 gap-2">
                  {([
                    ['Qty', 'quantity'], ['Net Wt', 'net_weight'], ['Material ₹', 'material_value'],
                    ['Making ₹', 'making_charges'], ['Disc %', 'discount_pct'], ['GST %', 'material_gst_rate'],
                  ] as [string, keyof Line][]).map(([label, key]) => (
                    <label key={key} className="space-y-1">
                      <span className="block text-[10px] text-textSecondary">{label}</span>
                      <input type="number" min="0" step="0.01" value={(l[key] as number) || ''} onChange={(e) => setLine(l.id, { [key]: Number(e.target.value) } as Partial<Line>)} className={`${cellCls} font-mono`} />
                    </label>
                  ))}
                </div>
                <div className="text-right text-[11px] text-textSecondary">Line total <span className="text-textPrimary font-mono">{formatCurrency(amounts(l).total)}</span></div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Reference (optional)</label>
              <input type="text" maxLength={50} value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className={fieldCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-textSecondary">Notes (optional)</label>
              <input type="text" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldCls} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-textSecondary">Terms (optional, printed on the document)</label>
            <textarea rows={2} maxLength={2000} value={terms} onChange={(e) => setTerms(e.target.value)} className={fieldCls} placeholder={docType === 'Quote' ? 'e.g. Rates as on date; final price at the gold rate on the day of billing.' : ''} />
          </div>

          <div className="p-3 bg-surface border border-border rounded-lg text-sm space-y-1">
            <div className="flex justify-between text-textSecondary"><span>Value</span><span className="font-mono">{formatCurrency(totals.gross)}</span></div>
            {totals.discount > 0 && <div className="flex justify-between text-textSecondary"><span>Discount</span><span className="font-mono">− {formatCurrency(totals.discount)}</span></div>}
            <div className="flex justify-between text-textSecondary"><span>GST</span><span className="font-mono">{formatCurrency(totals.gst)}</span></div>
            <div className="flex justify-between text-textPrimary font-semibold border-t border-border pt-1"><span>Total</span><span className="font-mono text-primary">{formatCurrency(totals.total)}</span></div>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border border-border text-textPrimary text-sm rounded-lg hover:bg-surface">Cancel</button>
            <button type="button" disabled={saving} onClick={save} className="px-6 py-2 bg-gold-gradient text-background font-semibold text-sm rounded-lg hover:opacity-90 disabled:opacity-50">{saving ? 'Saving...' : `Save ${meta.one}`}</button>
          </div>
        </div>
      </Modal>

      <EmailDialog
        subject={mailing ? `${TYPES.find((t) => t.id === mailing.doc_type)?.one} ${mailing.doc_no}` : null}
        defaultTo={mailing?.party_email}
        onClose={() => setMailing(null)}
        onSend={(body) => mailApi.order(mailing!.id, body)}
      />

      {/* View / print */}
      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-6 print:static print:bg-white print:p-0" onClick={() => setViewing(null)}>
          <div className="printable-area bg-white text-black rounded-xl w-full max-w-3xl p-8 print:rounded-none print:max-w-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-gray-300 pb-4">
              <div>
                <h2 className="text-xl font-bold">{company?.name || 'Caratloop'}</h2>
                <p className="text-xs text-gray-600">{[company?.address_line1, company?.city, company?.pincode].filter(Boolean).join(', ')}</p>
                {company?.gstin && <p className="text-xs text-gray-600">GSTIN: {company.gstin}</p>}
              </div>
              <div className="text-right">
                <h3 className="text-lg font-bold uppercase tracking-wide">{TYPES.find((t) => t.id === viewing.doc_type)?.one}</h3>
                <p className="text-sm font-mono">{viewing.doc_no}</p>
                <p className="text-xs">Date: {new Date(viewing.doc_date).toLocaleDateString('en-IN')}</p>
                {viewing.valid_until && <p className="text-xs">{TYPES.find((t) => t.id === viewing.doc_type)?.dateLabel}: {new Date(viewing.valid_until).toLocaleDateString('en-IN')}</p>}
              </div>
            </div>
            <div className="py-3 text-sm">
              <p className="text-xs text-gray-500">{viewing.doc_type === 'PurchaseOrder' ? 'To' : 'For'}</p>
              <p className="font-semibold">{viewing.party_name}</p>
              {viewing.party_gstin && <p className="text-xs text-gray-600">GSTIN: {viewing.party_gstin}</p>}
              {viewing.reference_no && <p className="text-xs text-gray-600">Reference: {viewing.reference_no}</p>}
            </div>
            <table className="w-full text-xs border border-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  {['#', 'Description', 'HSN', 'Qty', 'Net Wt', 'Value', 'Disc %', 'Taxable', 'GST', 'Total'].map((h) => <th key={h} className="px-2 py-1.5 text-left border-b border-gray-300">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(viewing.lines || []).map((l) => (
                  <tr key={l.sequence_no} className="border-b border-gray-200">
                    <td className="px-2 py-1.5">{l.sequence_no}</td>
                    <td className="px-2 py-1.5">{l.description || l.material_name}{l.material_code ? <span className="text-gray-500"> ({l.material_code})</span> : null}</td>
                    <td className="px-2 py-1.5 font-mono">{l.hsn_sac_code || ''}</td>
                    <td className="px-2 py-1.5">{l.quantity}</td>
                    <td className="px-2 py-1.5">{l.net_weight || ''}</td>
                    <td className="px-2 py-1.5 font-mono">{formatCurrency(l.material_value + l.making_charges)}</td>
                    <td className="px-2 py-1.5">{l.discount_pct ? `${l.discount_pct}%` : ''}</td>
                    <td className="px-2 py-1.5 font-mono">{formatCurrency(l.taxable)}</td>
                    <td className="px-2 py-1.5 font-mono">{formatCurrency(l.gst_amount)}</td>
                    <td className="px-2 py-1.5 font-mono font-semibold">{formatCurrency(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end pt-3">
              <div className="w-64 text-sm space-y-1">
                <div className="flex justify-between"><span>Value</span><span className="font-mono">{formatCurrency(viewing.subtotal)}</span></div>
                {viewing.discount_total > 0 && <div className="flex justify-between"><span>Discount</span><span className="font-mono">− {formatCurrency(viewing.discount_total)}</span></div>}
                <div className="flex justify-between"><span>GST</span><span className="font-mono">{formatCurrency(viewing.gst_total)}</span></div>
                <div className="flex justify-between font-bold border-t border-gray-400 pt-1"><span>Total</span><span className="font-mono">{formatCurrency(viewing.grand_total)}</span></div>
              </div>
            </div>
            {(viewing.notes || viewing.terms) && (
              <div className="pt-4 text-xs text-gray-700 space-y-1">
                {viewing.notes && <p><strong>Notes:</strong> {viewing.notes}</p>}
                {viewing.terms && <p><strong>Terms:</strong> {viewing.terms}</p>}
              </div>
            )}
            {viewing.doc_type === 'Quote' && <p className="pt-4 text-[11px] text-gray-500">This is a quotation, not a tax invoice.</p>}
            <div className="flex justify-end gap-3 pt-6 print:hidden">
              <button onClick={() => setViewing(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Close</button>
              {viewing.status !== 'Cancelled' && (
                <button onClick={() => { setMailing(viewing); setViewing(null); }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm flex items-center gap-2"><Mail className="w-4 h-4" /> E-mail</button>
              )}
              <button onClick={() => window.print()} className="px-4 py-2 bg-black text-white rounded-lg text-sm flex items-center gap-2"><Printer className="w-4 h-4" /> Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
