'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';

import { authApi } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { MIN_PASSWORD_LENGTH, apiErrorMessage } from '@/lib/passwords';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** The signed-in user's email, so the "not your email" rule can be checked
   *  before the round trip. */
  email?: string | null;
}

/**
 * Self-service password change for the signed-in user. Any role may use it.
 * On success the API ends the user's other sessions; this one stays alive.
 */
export default function ChangePasswordModal({ isOpen, onClose, email }: Props) {
  const { showToast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setCurrent('');
    setNext('');
    setConfirm('');
    setShow(false);
    setError('');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const localProblems: string[] = [];
  if (next && next.length < MIN_PASSWORD_LENGTH) {
    localProblems.push(`At least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (next && email && next.trim().toLowerCase() === email.trim().toLowerCase()) {
    localProblems.push('Must not be your email address.');
  }
  if (next && current && next === current) {
    localProblems.push('Must differ from the current password.');
  }
  if (confirm && next !== confirm) {
    localProblems.push('The two new passwords do not match.');
  }
  const canSubmit = current.length > 0 && next.length > 0 && confirm.length > 0 && localProblems.length === 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      await authApi.changePassword(current, next);
      showToast('success', 'Password changed', 'Your other sessions have been signed out.');
      onClose();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Could not change the password.'));
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-textSecondary focus:outline-none focus:border-primary transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative z-50 w-full max-w-md glass-card m-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3 bg-surface/50">
          <KeyRound className="w-5 h-5 text-primary" />
          <h3 id="change-password-title" className="text-lg font-playfair font-semibold text-white">
            Change password
          </h3>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1" htmlFor="cp-current">
              Current password
            </label>
            <input
              id="cp-current"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              className={inputClass}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1" htmlFor="cp-next">
              New password
            </label>
            <input
              id="cp-next"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              className={inputClass}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1" htmlFor="cp-confirm">
              Repeat new password
            </label>
            <input
              id="cp-confirm"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              className={inputClass}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="inline-flex items-center gap-1.5 text-xs text-textSecondary hover:text-white transition-colors"
          >
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {show ? 'Hide passwords' : 'Show passwords'}
          </button>

          {(localProblems.length > 0 || error) && (
            <ul className="text-xs text-rose-400 space-y-1 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {error && <li>{error}</li>}
              {localProblems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <p className="text-xs text-textSecondary">
            At least {MIN_PASSWORD_LENGTH} characters, and not your email address. Changing it signs you out
            everywhere else; this browser stays signed in.
          </p>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-textSecondary hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Change password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
