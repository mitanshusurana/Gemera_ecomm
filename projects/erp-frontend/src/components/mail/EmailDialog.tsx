'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';

import Modal from '@/components/ui/Modal';

interface Props {
  /** What is being sent, e.g. "Invoice CL/2026-27/0061". Null closes the dialog. */
  subject: string | null;
  /** The party's address on file, shown as the default recipient. */
  defaultTo?: string | null;
  onClose: () => void;
  /** Send the document; reject with an axios error to show its message. */
  onSend: (body: { to?: string; cc?: string; message?: string }) => Promise<unknown>;
}

const fieldCls = 'w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-white focus:border-primary outline-none';

/** Recipient, CC and a covering note for e-mailing one document. */
export default function EmailDialog({ subject, defaultTo, onClose, onSend }: Props) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  useEffect(() => {
    if (subject) { setTo(''); setCc(''); setMessage(''); setError(''); setSent(''); }
  }, [subject]);

  if (!subject) return null;

  const send = async () => {
    setError(''); setSending(true);
    try {
      const res: any = await onSend({ to: to.trim() || undefined, cc: cc.trim() || undefined, message: message.trim() || undefined });
      setSent(`Sent to ${(res?.data?.to || [to || defaultTo]).join(', ')}.`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not send the e-mail.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`E-mail ${subject}`}>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">To</label>
          <input type="text" value={to} onChange={(e) => setTo(e.target.value)} className={fieldCls}
            placeholder={defaultTo ? `${defaultTo} (on file)` : 'No address on file: enter one'} />
          <p className="text-[11px] text-textSecondary">Leave blank to use the address on the party. Separate several with commas.</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">CC (optional)</label>
          <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} className={fieldCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-textSecondary">Message (optional)</label>
          <textarea rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} className={fieldCls} placeholder="A line or two above the document's figures" />
        </div>
        <p className="text-[11px] text-textSecondary">The e-mail carries the document&apos;s figures in its body. Print the invoice from its screen when a PDF is needed.</p>
        {error && <p className="text-sm text-danger">{error}</p>}
        {sent && <p className="text-sm text-success">{sent}</p>}
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-border text-white text-sm rounded-lg hover:bg-surface">{sent ? 'Close' : 'Cancel'}</button>
          {!sent && (
            <button type="button" disabled={sending} onClick={send} className="px-6 py-2 bg-gold-gradient text-background font-semibold text-sm rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
