'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';

import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { mailApi, OverdueCustomer } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

/** Overdue invoices by customer: read the list, tick who gets a reminder, send; plus the log of what was sent. */
export default function RemindersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'overdue' | 'log'>('overdue');
  const [customers, setCustomers] = useState<OverdueCustomer[]>([]);
  const [configured, setConfigured] = useState(true);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: string[]; failed: string[]; no_email: string[] } | null>(null);
  const [error, setError] = useState('');
  const [log, setLog] = useState<any[]>([]);

  useEffect(() => {
    if (!open) return;
    setTab('overdue'); setResult(null); setError(''); setMessage('');
    setLoading(true);
    mailApi.overdue()
      .then((res) => {
        const list = res.data?.customers || [];
        setCustomers(list);
        setConfigured(Boolean(res.data?.configured));
        setPicked(Object.fromEntries(list.filter((c) => c.can_email).map((c) => [c.party_id, true])));
      })
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (open && tab === 'log') mailApi.log().then((res) => setLog(res.data?.log || [])).catch(() => setLog([]));
  }, [open, tab]);

  const chosen = customers.filter((c) => c.can_email && picked[c.party_id]);

  const send = async () => {
    setError(''); setSending(true);
    try {
      const res = await mailApi.reminders({ party_ids: chosen.map((c) => c.party_id), message: message.trim() || undefined });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not send the reminders.');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;
  const tabCls = (t: string) => `px-3 py-1.5 rounded-lg text-xs font-medium ${tab === t ? 'bg-primary text-black' : 'text-textSecondary hover:text-textPrimary'}`;

  return (
    <Modal isOpen onClose={onClose} title="Overdue reminders">
      <div className="space-y-4">
        <div className="flex gap-1">
          <button className={tabCls('overdue')} onClick={() => setTab('overdue')}>Overdue customers</button>
          <button className={tabCls('log')} onClick={() => setTab('log')}>Sent mail</button>
        </div>

        {tab === 'overdue' ? (
          <>
            {!configured && <p className="text-sm text-warning">E-mail is not set up on this server yet, so nothing can be sent. The list below still shows who is overdue.</p>}
            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
            ) : customers.length === 0 ? (
              <p className="py-6 text-center text-sm text-textSecondary">No invoice is past its due date.</p>
            ) : (
              <div className="border border-border rounded-lg divide-y divide-border max-h-72 overflow-y-auto">
                {customers.map((c) => (
                  <label key={c.party_id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                    <input type="checkbox" disabled={!c.can_email} checked={!!picked[c.party_id]} onChange={(e) => setPicked({ ...picked, [c.party_id]: e.target.checked })} className="w-4 h-4" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-textPrimary truncate">{c.party_name}</span>
                      <span className="block text-xs text-textSecondary truncate">
                        {c.invoice_count} invoice{c.invoice_count === 1 ? '' : 's'} · oldest {c.oldest_days} days · {c.can_email ? c.email : 'no e-mail on file'}
                      </span>
                    </span>
                    <span className="font-mono text-sm text-textPrimary">{formatCurrency(c.total)}</span>
                  </label>
                ))}
              </div>
            )}
            <textarea rows={2} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional line added to every reminder"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:border-primary outline-none" />
            {error && <p className="text-sm text-danger">{error}</p>}
            {result && (
              <div className="text-sm space-y-1">
                <p className="text-success">Sent to {result.sent.length}: {result.sent.join(', ') || '—'}</p>
                {result.failed.length > 0 && <p className="text-danger">Failed: {result.failed.join(', ')}</p>}
                {result.no_email.length > 0 && <p className="text-textSecondary">No e-mail on file: {result.no_email.join(', ')}</p>}
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-border text-textPrimary text-sm rounded-lg hover:bg-surface">Close</button>
              <button type="button" disabled={sending || !configured || chosen.length === 0 || !!result} onClick={send}
                className="px-6 py-2 bg-gold-gradient text-background font-semibold text-sm rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send {chosen.length} reminder{chosen.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border max-h-96 overflow-y-auto">
            {log.length === 0 ? <p className="py-6 text-center text-sm text-textSecondary">Nothing has been e-mailed yet.</p> : log.map((l) => (
              <div key={l.id} className="px-3 py-2.5 flex items-start gap-3">
                <Badge variant={l.status === 'Sent' ? 'success' : 'danger'}>{l.status}</Badge>
                <span className="min-w-0">
                  <span className="block text-sm text-textPrimary truncate">{l.subject}</span>
                  <span className="block text-xs text-textSecondary truncate">{l.kind} · {l.to_address} · {new Date(l.sent_at).toLocaleString('en-IN')}{l.sent_by_name ? ` · ${l.sent_by_name}` : ''}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
