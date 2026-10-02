'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { vouchersApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface VoucherModalProps {
  /** Numeric journal entry id or entry UUID; null closes the modal. */
  voucherId: string | number | null;
  onClose: () => void;
}

/**
 * Drill-down from any ledger line to its voucher, and from the voucher to the
 * document it was posted from (invoice, bill, fiscal year). Every ledger,
 * book and register row carries `journal_entry_id`; this is where it leads.
 */
export default function VoucherModal({ voucherId, onClose }: VoucherModalProps) {
  const [voucher, setVoucher] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (voucherId === null || voucherId === undefined || voucherId === '') {
      setVoucher(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    vouchersApi.get(voucherId)
      .then((res) => { if (!cancelled) setVoucher(res.data); })
      .catch((err) => { if (!cancelled) setError(err?.response?.data?.detail || 'Could not load the voucher.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [voucherId]);

  const isOpen = voucherId !== null && voucherId !== undefined && voucherId !== '';
  if (!isOpen) return null;

  const totalDr = (voucher?.lines || []).reduce((acc: number, l: any) => acc + Number(l.dr_amount || 0), 0);
  const totalCr = (voucher?.lines || []).reduce((acc: number, l: any) => acc + Number(l.cr_amount || 0), 0);
  const doc = voucher?.source_document;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={voucher ? `Voucher ${voucher.entry_no}` : 'Voucher'}>
      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
      ) : error ? (
        <div className="py-8 text-center text-danger text-sm">{error}</div>
      ) : voucher ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-textSecondary">Date</div>
              <div className="text-white font-mono">{voucher.entry_date}</div>
            </div>
            <div>
              <div className="text-xs text-textSecondary">Type</div>
              <div><Badge variant="info">{voucher.entry_type}</Badge></div>
            </div>
            <div>
              <div className="text-xs text-textSecondary">Status</div>
              <div><Badge variant={voucher.status === 'Posted' ? 'success' : 'warning'}>{voucher.status}</Badge></div>
            </div>
            <div>
              <div className="text-xs text-textSecondary">Reference</div>
              <div className="text-white font-mono text-xs break-all">{voucher.reference_no || '—'}</div>
            </div>
          </div>

          <div className="text-sm">
            <div className="text-xs text-textSecondary">Narration</div>
            <div className="text-white">{voucher.narration}</div>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="text-textSecondary border-b border-border text-xs uppercase">
              <tr>
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">Account</th>
                <th className="pb-2 font-medium">Particulars</th>
                <th className="pb-2 font-medium text-right">Dr (₹)</th>
                <th className="pb-2 font-medium text-right">Cr (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(voucher.lines || []).map((l: any) => (
                <tr key={l.id}>
                  <td className="py-2 text-textSecondary font-mono text-xs">{l.sequence_no}</td>
                  <td className="py-2">
                    <div className="text-white">{l.account_name}</div>
                    <div className="text-xs text-textSecondary font-mono">{l.account_code}{l.party_name ? ` · ${l.party_name}` : ''}</div>
                  </td>
                  <td className="py-2 text-textSecondary text-xs">{l.narration}</td>
                  <td className="py-2 text-right font-mono text-white">{Number(l.dr_amount) > 0 ? formatCurrency(Number(l.dr_amount)) : '—'}</td>
                  <td className="py-2 text-right font-mono text-success">{Number(l.cr_amount) > 0 ? formatCurrency(Number(l.cr_amount)) : '—'}</td>
                </tr>
              ))}
              <tr className="bg-white/5 font-semibold">
                <td colSpan={3} className="py-2 text-right text-white">Total</td>
                <td className="py-2 text-right font-mono text-white">{formatCurrency(totalDr)}</td>
                <td className="py-2 text-right font-mono text-success">{formatCurrency(totalCr)}</td>
              </tr>
            </tbody>
          </table>
          {Math.abs(totalDr - totalCr) > 0.005 && (
            <div className="text-xs text-danger">This voucher does not balance: difference {formatCurrency(Math.abs(totalDr - totalCr))}.</div>
          )}

          {doc && (
            <div className="bg-surface border border-border rounded-xl p-4 text-sm flex items-center justify-between gap-4">
              <div>
                <div className="text-xs text-textSecondary uppercase">Source document</div>
                <div className="text-white font-mono">{doc.number || doc.type}</div>
                {doc.grand_total !== undefined && (
                  <div className="text-xs text-textSecondary mt-1">
                    {doc.type} · {doc.date} · total {formatCurrency(Number(doc.grand_total || 0))} · paid {formatCurrency(Number(doc.amount_paid || 0))} · {doc.payment_status} · {doc.status}
                  </div>
                )}
              </div>
              {doc.href && (
                <Link href={doc.href} className="flex items-center gap-1 text-primary hover:underline text-xs whitespace-nowrap">
                  Open <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}
          {voucher.reverses && (
            <div className="text-xs text-textSecondary">Reverses voucher <span className="font-mono text-primary">{voucher.reverses.entry_no}</span>.</div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
