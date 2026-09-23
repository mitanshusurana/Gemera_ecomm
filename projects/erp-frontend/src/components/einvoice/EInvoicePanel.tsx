'use client';

/**
 * e-Invoice (IRN) and e-Way Bill actions for one sales invoice.
 *
 * Shows what the ERP holds (IRN, acknowledgement, QR, e-way bill), what it
 * would send to the IRP (the schema 1.1 payload, or why it cannot be sent),
 * and the three actions: Generate IRN, Cancel IRN (with reason), Generate
 * e-Way Bill (with transport details). Every action re-reads the server
 * state afterwards; nothing is inferred client-side.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, QrCode, RefreshCw, Truck, XCircle } from 'lucide-react';

import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { einvoiceApi, EwayBillPayload } from '@/lib/api';

interface Props {
  invoiceId: string;
  invoiceNo: string;
  onClose: () => void;
  /** Called after any successful change so the register can refresh. */
  onChanged?: () => void;
}

type View = 'summary' | 'payload' | 'cancel' | 'ewb';

export function eInvoiceBadge(status: string | null | undefined, irn?: string | null) {
  if (status === 'Generated' && irn) {
    return <Badge variant="success" className="font-mono" >IRN {irn.slice(0, 10)}…</Badge>;
  }
  if (status === 'Cancelled') return <Badge variant="danger">IRN cancelled</Badge>;
  return <Badge variant="default">Not generated</Badge>;
}

const errorText = (err: any, fallback: string) => {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: any) => x.msg || JSON.stringify(x)).join('; ');
  return err?.message || fallback;
};

export default function EInvoicePanel({ invoiceId, invoiceNo, onClose, onChanged }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<View>('summary');

  const [cancelReason, setCancelReason] = useState('2');
  const [cancelRemarks, setCancelRemarks] = useState('');

  const [ewb, setEwb] = useState<EwayBillPayload>({
    transport_mode: '1', distance_km: 0, vehicle_type: 'R',
    transporter_id: '', transporter_name: '', vehicle_no: '', document_no: '', document_date: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await einvoiceApi.get(invoiceId);
      setData(res.data);
    } catch (err: any) {
      setError(errorText(err, 'Could not load e-invoice details'));
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fn();
      setNotice(`${label} succeeded${res?.data?.irn ? `: IRN ${res.data.irn}` : res?.data?.eway_bill_no ? `: e-Way Bill ${res.data.eway_bill_no}` : '.'}`);
      setView('summary');
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(errorText(err, `${label} failed`));
    } finally {
      setBusy(false);
    }
  };

  const generateIrn = () => {
    if (!confirm(`Send ${invoiceNo} to the IRP and generate its IRN? This cannot be undone after 24 hours.`)) return;
    run('IRN generation', () => einvoiceApi.generate(invoiceId));
  };

  const cancelIrn = () => {
    if (cancelRemarks.trim().length < 3) { setError('Remarks are required (at least 3 characters).'); return; }
    run('IRN cancellation', () => einvoiceApi.cancel(invoiceId, { reason_code: cancelReason, remarks: cancelRemarks.trim() }));
  };

  const generateEwb = () => {
    const body: EwayBillPayload = {
      ...ewb,
      distance_km: Number(ewb.distance_km) || 0,
      transporter_id: ewb.transporter_id || undefined,
      transporter_name: ewb.transporter_name || undefined,
      vehicle_no: ewb.vehicle_no || undefined,
      document_no: ewb.document_no || undefined,
      document_date: ewb.document_date || undefined,
    };
    run('e-Way Bill generation', () => einvoiceApi.generateEwayBill(invoiceId, body));
  };

  const cancelEwb = () => {
    if (!confirm(`Cancel e-Way Bill ${data?.eway_bill?.no}?`)) return;
    run('e-Way Bill cancellation', () => einvoiceApi.cancelEwayBill(invoiceId, { reason_code: '2' }));
  };

  const status: string = data?.e_invoice_status || 'Not_Generated';
  const hasIrn = status === 'Generated' && !!data?.irn;
  const canGenerate = !hasIrn && status !== 'Cancelled' && data?.invoice_status !== 'Cancelled'
    && (data?.validation_errors || []).length === 0 && !data?.below_threshold;
  const providerOff = data?.provider === 'disabled';
  const fmtDt = (v: any) => (v ? new Date(v).toLocaleString('en-IN') : '—');

  const input = 'w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white focus:border-primary outline-none';
  const label = 'block text-xs text-textSecondary mb-1';

  return (
    <Modal isOpen onClose={onClose} title={`e-Invoice — ${invoiceNo}`}>
      {loading ? (
        <div className="py-10 flex items-center justify-center gap-2 text-textSecondary">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading IRP details…
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          {providerOff && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-warning/30 bg-warning/10 text-warning text-xs">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>No e-invoice provider is configured (EINVOICE_PROVIDER=disabled). The preview works; Generate will answer 503 until a GSP is set up.</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-danger/30 bg-danger/10 text-danger text-xs">
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-success/30 bg-success/10 text-success text-xs">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><span>{notice}</span>
            </div>
          )}

          {/* Stored state */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-textSecondary">IRN</span>
                {eInvoiceBadge(status, data?.irn)}
              </div>
              <p className="font-mono text-[11px] break-all text-white min-h-[2.5rem]">{data?.irn || <span className="text-textSecondary">No IRN on record</span>}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-textSecondary">Ack No</span><p className="font-mono text-white">{data?.ack_no || '—'}</p></div>
                <div><span className="text-textSecondary">Ack Date</span><p className="text-white">{fmtDt(data?.ack_date)}</p></div>
                {data?.cancelled_at && (
                  <div className="col-span-2"><span className="text-textSecondary">Cancelled at</span><p className="text-danger">{fmtDt(data.cancelled_at)}</p></div>
                )}
              </div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-textSecondary">e-Way Bill</span>
                {data?.eway_bill?.no ? <Badge variant="success">Issued</Badge> : <Badge variant="default">None</Badge>}
              </div>
              <p className="font-mono text-white">{data?.eway_bill?.no || <span className="text-textSecondary">Not generated</span>}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-textSecondary">Generated</span><p className="text-white">{fmtDt(data?.eway_bill?.date)}</p></div>
                <div><span className="text-textSecondary">Valid up to</span><p className="text-white">{fmtDt(data?.eway_bill?.valid_upto)}</p></div>
              </div>
            </div>
          </div>

          {/* Why it cannot be sent */}
          {(data?.validation_errors || []).length > 0 && (
            <div className="p-3 rounded-lg border border-warning/30 bg-warning/5 text-xs space-y-1">
              <p className="font-semibold text-warning">This invoice cannot be e-invoiced as it stands:</p>
              <ul className="list-disc pl-5 text-textSecondary space-y-0.5">
                {data.validation_errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {data?.below_threshold && (
            <p className="text-xs text-textSecondary">Invoice value is below the configured e-invoice threshold (Rs {Number(data.threshold_inr).toLocaleString('en-IN')}).</p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              onClick={() => setView(view === 'payload' ? 'summary' : 'payload')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border text-white hover:border-primary"
            >
              <QrCode className="w-3.5 h-3.5" /> {view === 'payload' ? 'Hide payload' : 'Preview payload'}
            </button>
            {canGenerate && (
              <button onClick={generateIrn} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-gold-gradient text-background disabled:opacity-50">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Generate IRN
              </button>
            )}
            {hasIrn && (
              <>
                <button onClick={() => setView(view === 'cancel' ? 'summary' : 'cancel')} disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50">
                  <XCircle className="w-3.5 h-3.5" /> Cancel IRN
                </button>
                {!data?.eway_bill?.no ? (
                  <button onClick={() => setView(view === 'ewb' ? 'summary' : 'ewb')} disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50">
                    <Truck className="w-3.5 h-3.5" /> Generate e-Way Bill
                  </button>
                ) : (
                  <button onClick={cancelEwb} disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border text-textSecondary hover:text-danger disabled:opacity-50">
                    <Truck className="w-3.5 h-3.5" /> Cancel e-Way Bill
                  </button>
                )}
              </>
            )}
            <button onClick={load} disabled={busy} className="ml-auto p-2 text-textSecondary hover:text-white" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {view === 'payload' && (
            <div className="space-y-2">
              <p className="text-xs text-textSecondary">NIC e-invoice schema 1.1 — exactly what Generate sends. Material and making are separate items; TCS, if any, travels in OthChrg.</p>
              <pre className="bg-background border border-border rounded-lg p-3 text-[11px] leading-relaxed text-white overflow-auto max-h-80">
                {data?.payload ? JSON.stringify(data.payload, null, 2) : 'Payload cannot be built — see the validation notes above.'}
              </pre>
            </div>
          )}

          {view === 'cancel' && (
            <div className="space-y-3 p-4 rounded-xl border border-danger/30 bg-danger/5">
              <p className="text-xs text-textSecondary">The IRP accepts cancellation within 24 hours of acknowledgement. The invoice number cannot be re-registered afterwards; cancelling the IRN does not cancel the invoice in the books.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Reason</label>
                  <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={input}>
                    {Object.entries(data?.cancel_reasons || { '1': 'Duplicate', '2': 'Data entry mistake', '3': 'Order cancelled', '4': 'Others' })
                      .map(([k, v]) => <option key={k} value={k}>{k} — {String(v)}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Remarks (required)</label>
                  <input value={cancelRemarks} onChange={(e) => setCancelRemarks(e.target.value)} maxLength={100} className={input} placeholder="e.g. Wrong buyer GSTIN" />
                </div>
              </div>
              <button onClick={cancelIrn} disabled={busy} className="px-4 py-2 text-xs font-semibold rounded-lg bg-danger text-white disabled:opacity-50">
                {busy ? 'Cancelling…' : 'Confirm IRN cancellation'}
              </button>
            </div>
          )}

          {view === 'ewb' && (
            <div className="space-y-3 p-4 rounded-xl border border-primary/30 bg-primary/5">
              <p className="text-xs text-textSecondary">Part A comes from the invoice via the IRN; Part B is entered here. By road, give the vehicle number, or only the transporter id to leave Part B to the transporter. Chapter 71 goods are e-way-bill exempt except where a State has notified gold movement.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className={label}>Mode</label>
                  <select value={ewb.transport_mode} onChange={(e) => setEwb({ ...ewb, transport_mode: e.target.value as any })} className={input}>
                    <option value="1">1 — Road</option><option value="2">2 — Rail</option><option value="3">3 — Air</option><option value="4">4 — Ship</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Distance (km)</label>
                  <input type="number" min={0} max={4000} value={ewb.distance_km} onChange={(e) => setEwb({ ...ewb, distance_km: Number(e.target.value) })} className={input} />
                </div>
                <div>
                  <label className={label}>Vehicle No</label>
                  <input value={ewb.vehicle_no} onChange={(e) => setEwb({ ...ewb, vehicle_no: e.target.value.toUpperCase() })} className={input} placeholder="RJ14GA1234" />
                </div>
                <div>
                  <label className={label}>Vehicle type</label>
                  <select value={ewb.vehicle_type} onChange={(e) => setEwb({ ...ewb, vehicle_type: e.target.value as any })} className={input}>
                    <option value="R">Regular</option><option value="O">Over-dimensional</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Transporter ID (GSTIN / TRANSIN)</label>
                  <input value={ewb.transporter_id} onChange={(e) => setEwb({ ...ewb, transporter_id: e.target.value.toUpperCase() })} className={input} maxLength={15} />
                </div>
                <div>
                  <label className={label}>Transporter name</label>
                  <input value={ewb.transporter_name} onChange={(e) => setEwb({ ...ewb, transporter_name: e.target.value })} className={input} />
                </div>
                <div>
                  <label className={label}>Transport doc No (LR / RR / AWB)</label>
                  <input value={ewb.document_no} onChange={(e) => setEwb({ ...ewb, document_no: e.target.value })} className={input} maxLength={15} />
                </div>
                <div>
                  <label className={label}>Transport doc date (DD/MM/YYYY)</label>
                  <input value={ewb.document_date} onChange={(e) => setEwb({ ...ewb, document_date: e.target.value })} className={input} placeholder="21/09/2026" />
                </div>
              </div>
              <button onClick={generateEwb} disabled={busy} className="px-4 py-2 text-xs font-semibold rounded-lg bg-gold-gradient text-background disabled:opacity-50">
                {busy ? 'Generating…' : 'Generate e-Way Bill'}
              </button>
            </div>
          )}

          {/* Provider log */}
          {(data?.log || []).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Provider log</p>
              <div className="border border-border rounded-lg divide-y divide-border text-xs">
                {data.log.map((l: any) => (
                  <div key={l.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="text-textSecondary w-36 shrink-0">{fmtDt(l.created_at)}</span>
                    <span className="font-mono text-white w-28 shrink-0">{l.action}</span>
                    <Badge variant={l.status === 'Success' ? 'success' : 'danger'}>{l.status}</Badge>
                    {l.error && <span className="text-danger truncate" title={l.error}>{l.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
