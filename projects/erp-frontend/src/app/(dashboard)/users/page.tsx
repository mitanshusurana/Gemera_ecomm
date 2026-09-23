'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  UserCog,
  X,
} from 'lucide-react';

import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { usersApi, type CreateUserPayload, type ErpUser, type UpdateUserPayload } from '@/lib/api';
import { MIN_PASSWORD_LENGTH, apiErrorMessage, copyToClipboard, generatePassword } from '@/lib/passwords';
import { canManageUsers, normaliseRole, useMe } from '@/lib/session';

// The seven values caratloop.users.role permits, in the order they are
// usually granted, each with what it lets a person do.
const ROLE_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: 'owner', label: 'Owner', description: 'Full control, including appointing other owners.' },
  { value: 'admin', label: 'Administrator', description: 'Everything an owner can do except create or alter owners.' },
  { value: 'accountant', label: 'Accountant', description: 'Posts invoices, vouchers and journals; cannot cancel posted documents.' },
  { value: 'production_manager', label: 'Production Manager', description: 'Runs production orders and moves stock; cannot post accounts.' },
  { value: 'store_keeper', label: 'Store Keeper', description: 'Receives, issues and transfers stock; no accounting access.' },
  { value: 'auditor', label: 'Auditor', description: 'Reads everything including the full audit trail; changes nothing.' },
  { value: 'read_only', label: 'Read Only', description: 'Views the books and reports only.' },
];

const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));

function roleBadgeVariant(role: string): 'info' | 'success' | 'warning' | 'default' {
  switch (normaliseRole(role)) {
    case 'owner':
      return 'warning';
    case 'admin':
      return 'info';
    case 'auditor':
    case 'read_only':
      return 'default';
    default:
      return 'success';
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const inputClass =
  'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-textSecondary focus:outline-none focus:border-primary transition-colors disabled:opacity-50';
const labelClass = 'block text-xs font-medium text-textSecondary mb-1';

// ─── Role select with one-line descriptions ──────────────────────────────────

function RoleSelect({
  value,
  onChange,
  actorRole,
  disabled,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  actorRole: string;
  disabled?: boolean;
  id: string;
}) {
  const current = ROLE_OPTIONS.find((r) => r.value === value);
  return (
    <div>
      <select
        id={id}
        className={inputClass}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {ROLE_OPTIONS.map((r) => {
          // Only an owner may grant the owner role; the API refuses otherwise.
          const locked = r.value === 'owner' && actorRole !== 'owner';
          return (
            <option key={r.value} value={r.value} disabled={locked && value !== r.value}>
              {r.label}{locked ? ' (owners only)' : ''}
            </option>
          );
        })}
      </select>
      {current && <p className="text-xs text-textSecondary mt-1">{current.description}</p>}
    </div>
  );
}

// ─── Password field with generator and copy ──────────────────────────────────

function PasswordSuggestion({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    const ok = await copyToClipboard(value);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      <div className="flex items-stretch gap-2">
        <input
          id={id}
          type="text"
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} font-mono`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        />
        <button
          type="button"
          onClick={() => onChange(generatePassword())}
          title="Generate a password"
          className="px-3 rounded-lg border border-border bg-surface text-textSecondary hover:text-white hover:bg-white/5 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          title="Copy to clipboard"
          className="px-3 rounded-lg border border-border bg-surface text-textSecondary hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-textSecondary mt-1">
        Share it with the person over a channel you trust; it is shown only here and never again.
      </p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { me, loading: meLoading, verified } = useMe();
  const { showToast } = useToast();
  const actorRole = normaliseRole(me?.role);
  const allowed = canManageUsers(actorRole);

  const [users, setUsers] = useState<ErpUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ErpUser | null>(null);
  const [resetting, setResetting] = useState<ErpUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await usersApi.list();
      setUsers(res.data?.data ?? []);
    } catch (err: unknown) {
      setLoadError(apiErrorMessage(err, 'Could not load users.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const activeOwners = useMemo(
    () => users.filter((u) => normaliseRole(u.role) === 'owner' && u.is_active).length,
    [users],
  );

  if (meLoading && !me) {
    return <div className="text-sm text-textSecondary">Checking your role…</div>;
  }

  if (!allowed) {
    return (
      <div className="glass-card p-8 flex flex-col items-center text-center gap-3">
        <ShieldAlert className="w-10 h-10 text-amber-400" />
        <h1 className="text-xl font-playfair font-semibold text-white">Users is for owners and administrators</h1>
        <p className="text-sm text-textSecondary max-w-md">
          Your role ({ROLE_LABEL[actorRole] ?? me?.role ?? 'unknown'}) does not include managing accounts. Ask an owner
          or administrator to make changes for you. You can still change your own password from the account menu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white flex items-center gap-3">
            <UserCog className="w-7 h-7 text-primary" /> Users
          </h1>
          <p className="text-textSecondary mt-1">
            Who can sign in to these books and what they may do. Every change here is written to the audit trail.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(212,168,67,0.3)] text-sm"
        >
          <Plus className="w-4 h-4" />
          New user
        </button>
      </div>

      {!verified && (
        <p className="text-xs text-textSecondary">Confirming your role with the server…</p>
      )}

      <div className="glass-card">
        <div className="p-4 overflow-x-auto">
          {loading ? (
            <div className="animate-pulse space-y-4 py-4">
              <div className="h-8 bg-white/10 rounded w-full"></div>
              <div className="h-8 bg-white/10 rounded w-full"></div>
              <div className="h-8 bg-white/10 rounded w-full"></div>
            </div>
          ) : loadError ? (
            <div className="text-center py-12 text-textSecondary flex flex-col items-center gap-3">
              <AlertCircle className="w-10 h-10 text-rose-400" />
              <p>{loadError}</p>
              <button onClick={load} className="text-sm text-primary hover:underline">Try again</button>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-textSecondary flex flex-col items-center gap-3">
              <AlertCircle className="w-12 h-12 text-white/20" />
              <p>No users yet.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-textSecondary border-b border-border">
                <tr>
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Role</th>
                  <th className="pb-3 font-medium">Department</th>
                  <th className="pb-3 font-medium">Phone</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Last sign-in</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => {
                  const isSelf = !!me?.id && u.id === me.id;
                  return (
                    <tr key={u.id} className={`hover:bg-white/5 transition-colors ${u.is_active ? '' : 'opacity-60'}`}>
                      <td className="py-4">
                        <div className="font-medium text-white flex items-center gap-2">
                          {u.full_name}
                          {isSelf && <span className="text-[10px] uppercase tracking-wider text-primary border border-primary/40 rounded px-1">you</span>}
                        </div>
                        <div className="text-xs text-textSecondary">{u.email}</div>
                        {u.employee_code && <div className="text-xs text-textSecondary font-mono">{u.employee_code}</div>}
                      </td>
                      <td className="py-4">
                        <Badge variant={roleBadgeVariant(u.role)}>{ROLE_LABEL[normaliseRole(u.role)] ?? u.role}</Badge>
                      </td>
                      <td className="py-4 text-textSecondary">{u.department || '—'}</td>
                      <td className="py-4 text-textSecondary font-mono text-xs">{u.phone || '—'}</td>
                      <td className="py-4">
                        <Badge variant={u.is_active ? 'success' : 'danger'}>{u.is_active ? 'Active' : 'Disabled'}</Badge>
                      </td>
                      <td className="py-4 text-textSecondary text-xs">{formatWhen(u.last_login_at)}</td>
                      <td className="py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditing(u)}
                            className="p-1.5 rounded text-xs font-medium flex items-center gap-1 text-textSecondary hover:text-white hover:bg-white/5"
                            title="Edit user"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => setResetting(u)}
                            disabled={isSelf}
                            className="p-1.5 rounded text-xs font-medium flex items-center gap-1 bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
                            title={isSelf ? 'Use "Change password" in the account menu for your own account' : 'Set a new password'}
                          >
                            <KeyRound className="w-3.5 h-3.5" /> Reset password
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CreateUserModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        actorRole={actorRole}
        onCreated={(u) => {
          setUsers((prev) => [u, ...prev]);
          showToast('success', 'User created', `${u.full_name} can sign in as ${ROLE_LABEL[u.role] ?? u.role}.`);
        }}
      />

      {editing && (
        <EditUserDrawer
          user={editing}
          isSelf={!!me?.id && editing.id === me.id}
          actorRole={actorRole}
          lastActiveOwner={normaliseRole(editing.role) === 'owner' && editing.is_active && activeOwners <= 1}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            setEditing(null);
            showToast('success', 'User updated', u.full_name);
          }}
        />
      )}

      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            showToast('success', 'Password reset', `${resetting.full_name} has been signed out everywhere.`);
            setResetting(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Create ──────────────────────────────────────────────────────────────────

const EMPTY_CREATE: CreateUserPayload = {
  full_name: '',
  email: '',
  phone: '',
  role: 'accountant',
  department: '',
  employee_code: '',
  password: '',
};

function CreateUserModal({
  isOpen,
  onClose,
  actorRole,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  actorRole: string;
  onCreated: (u: ErpUser) => void;
}) {
  const [form, setForm] = useState<CreateUserPayload>(EMPTY_CREATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setForm({ ...EMPTY_CREATE, password: generatePassword() });
      setError('');
    }
  }, [isOpen]);

  const set = <K extends keyof CreateUserPayload>(key: K, value: CreateUserPayload[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const problems: string[] = [];
  if (form.password && form.password.length < MIN_PASSWORD_LENGTH) problems.push(`Password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (form.password && form.email && form.password.trim().toLowerCase() === form.email.trim().toLowerCase()) {
    problems.push('Password must not be the email address.');
  }
  const canSubmit = form.full_name.trim() && form.email.trim().includes('@') && form.password && problems.length === 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const res = await usersApi.create({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone?.trim() || null,
        role: form.role,
        department: form.department?.trim() || null,
        employee_code: form.employee_code?.trim() || null,
        password: form.password,
      });
      onCreated(res.data);
      onClose();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Could not create the user.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New user">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass} htmlFor="cu-name">Full name</label>
            <input id="cu-name" className={inputClass} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required autoFocus />
          </div>
          <div>
            <label className={labelClass} htmlFor="cu-email">Email (used to sign in)</label>
            <input id="cu-email" type="email" className={inputClass} value={form.email} onChange={(e) => set('email', e.target.value)} required />
          </div>
          <div>
            <label className={labelClass} htmlFor="cu-phone">Phone</label>
            <input id="cu-phone" className={inputClass} value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} maxLength={15} />
          </div>
          <div>
            <label className={labelClass} htmlFor="cu-department">Department</label>
            <input id="cu-department" className={inputClass} value={form.department ?? ''} onChange={(e) => set('department', e.target.value)} maxLength={100} />
          </div>
          <div>
            <label className={labelClass} htmlFor="cu-code">Employee code</label>
            <input id="cu-code" className={`${inputClass} font-mono`} value={form.employee_code ?? ''} onChange={(e) => set('employee_code', e.target.value)} maxLength={20} />
          </div>
          <div className="col-span-2">
            <label className={labelClass} htmlFor="cu-role">Role</label>
            <RoleSelect id="cu-role" value={form.role} onChange={(v) => set('role', v)} actorRole={actorRole} />
          </div>
          <div className="col-span-2">
            <label className={labelClass} htmlFor="cu-password">Initial password</label>
            <PasswordSuggestion id="cu-password" value={form.password} onChange={(v) => set('password', v)} />
          </div>
        </div>

        {(problems.length > 0 || error) && (
          <ul className="text-xs text-rose-400 space-y-1 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            {error && <li>{error}</li>}
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-textSecondary hover:text-white transition-colors">Cancel</button>
          <button
            type="submit"
            disabled={!canSubmit || saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Create user
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit drawer ─────────────────────────────────────────────────────────────

function EditUserDrawer({
  user,
  isSelf,
  actorRole,
  lastActiveOwner,
  onClose,
  onSaved,
}: {
  user: ErpUser;
  isSelf: boolean;
  actorRole: string;
  lastActiveOwner: boolean;
  onClose: () => void;
  onSaved: (u: ErpUser) => void;
}) {
  const [form, setForm] = useState({
    full_name: user.full_name,
    phone: user.phone ?? '',
    department: user.department ?? '',
    employee_code: user.employee_code ?? '',
    role: normaliseRole(user.role),
    is_active: user.is_active,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const targetIsOwner = normaliseRole(user.role) === 'owner';
  // Mirrors the API: you cannot change your own role or deactivate yourself;
  // an admin cannot alter an owner's role or status.
  const roleLocked = isSelf || (targetIsOwner && actorRole !== 'owner');
  const activeLocked = isSelf || (targetIsOwner && actorRole !== 'owner');
  const lockReason = isSelf
    ? 'Your own role and status can only be changed by another owner or administrator.'
    : targetIsOwner && actorRole !== 'owner'
      ? "Only an owner may change an owner's role or deactivate an owner."
      : lastActiveOwner
        ? 'This is the only active owner; appoint another owner before demoting or disabling this one.'
        : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload: UpdateUserPayload = {};
    if (form.full_name.trim() !== user.full_name) payload.full_name = form.full_name.trim();
    if ((form.phone.trim() || null) !== (user.phone || null)) payload.phone = form.phone.trim() || null;
    if ((form.department.trim() || null) !== (user.department || null)) payload.department = form.department.trim() || null;
    if ((form.employee_code.trim() || null) !== (user.employee_code || null)) payload.employee_code = form.employee_code.trim() || null;
    if (!roleLocked && form.role !== normaliseRole(user.role)) payload.role = form.role;
    if (!activeLocked && form.is_active !== user.is_active) payload.is_active = form.is_active;

    if (Object.keys(payload).length === 0) {
      setSaving(false);
      onClose();
      return;
    }
    try {
      const res = await usersApi.update(user.id, payload);
      onSaved(res.data);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Could not save the changes.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative z-50 h-full w-full max-w-md bg-surface border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 id="edit-user-title" className="text-lg font-playfair font-semibold text-white">Edit user</h3>
            <p className="text-xs text-textSecondary">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-textSecondary hover:text-white transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className={labelClass} htmlFor="eu-name">Full name</label>
            <input id="eu-name" className={inputClass} value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
          </div>
          <div>
            <label className={labelClass} htmlFor="eu-phone">Phone</label>
            <input id="eu-phone" className={inputClass} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} maxLength={15} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="eu-department">Department</label>
              <input id="eu-department" className={inputClass} value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} maxLength={100} />
            </div>
            <div>
              <label className={labelClass} htmlFor="eu-code">Employee code</label>
              <input id="eu-code" className={`${inputClass} font-mono`} value={form.employee_code} onChange={(e) => setForm((f) => ({ ...f, employee_code: e.target.value }))} maxLength={20} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="eu-role">Role</label>
            <RoleSelect
              id="eu-role"
              value={form.role}
              onChange={(v) => setForm((f) => ({ ...f, role: v }))}
              actorRole={actorRole}
              disabled={roleLocked || (lastActiveOwner && targetIsOwner)}
            />
          </div>

          <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border bg-background">
            <div>
              <p className="text-sm text-white font-medium">Account active</p>
              <p className="text-xs text-textSecondary">A disabled account cannot sign in and its open sessions end immediately.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.is_active}
              disabled={activeLocked || (lastActiveOwner && form.is_active)}
              onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${form.is_active ? 'bg-emerald-500' : 'bg-white/20'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {lockReason && (
            <p className="text-xs text-amber-400 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /> {lockReason}
            </p>
          )}

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-textSecondary hover:text-white transition-colors">Cancel</button>
            <button
              type="submit"
              disabled={saving || !form.full_name.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reset password ──────────────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose, onDone }: { user: ErpUser; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState(() => generatePassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const tooShort = password.length < MIN_PASSWORD_LENGTH;
  const sameAsEmail = password.trim().toLowerCase() === user.email.trim().toLowerCase();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tooShort || sameAsEmail) return;
    setSaving(true);
    setError('');
    try {
      await usersApi.resetPassword(user.id, password);
      onDone();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Could not reset the password.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Reset password — ${user.full_name}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-textSecondary">
          Sets a new password for <span className="text-white">{user.email}</span> and signs them out of every
          device. Copy it before you confirm; it will not be shown again.
        </p>
        <div>
          <label className={labelClass} htmlFor="rp-password">New password</label>
          <PasswordSuggestion id="rp-password" value={password} onChange={setPassword} />
        </div>
        {(tooShort || sameAsEmail || error) && (
          <ul className="text-xs text-rose-400 space-y-1 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            {error && <li>{error}</li>}
            {tooShort && <li>At least {MIN_PASSWORD_LENGTH} characters.</li>}
            {sameAsEmail && <li>Must not be the email address.</li>}
          </ul>
        )}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-textSecondary hover:text-white transition-colors">Cancel</button>
          <button
            type="submit"
            disabled={saving || tooShort || sameAsEmail}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Reset and sign out everywhere
          </button>
        </div>
      </form>
    </Modal>
  );
}
