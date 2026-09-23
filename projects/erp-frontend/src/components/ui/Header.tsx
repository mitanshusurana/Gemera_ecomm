'use client';

import { Bell, ChevronDown, KeyRound, LogOut, Search, User } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { logout } from '@/lib/auth';
import { useMe } from '@/lib/session';
import ChangePasswordModal from '@/components/ui/ChangePasswordModal';

// The role the token carries, in the words a person uses for it. These are the
// seven values caratloop.users.role permits; anything else is shown verbatim
// rather than guessed at.
const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  accountant: 'Accountant',
  production_manager: 'Production Manager',
  store_keeper: 'Store Keeper',
  auditor: 'Auditor',
  read_only: 'Read Only',
};

function roleLabel(role?: string | null): string {
  if (!role) return 'Signed in';
  return ROLE_LABELS[role.trim().toLowerCase()] ?? role;
}

function initials(name?: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export default function Header() {
  // This said "Admin User / Super Admin" for everybody, hardcoded. It was not
  // only wrong, it was misleading about authority: an auditor or a store
  // keeper saw themselves described as a super admin, and "Super Admin" is not
  // a role the system has at all.
  //
  // useMe reads the stored session after mount (localStorage does not exist on
  // the server, and rendering a different value on the two sides would trip
  // hydration) and then replaces it with what /auth/me says.
  const { me: user } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const closeChangePassword = useCallback(() => setChangePasswordOpen(false), []);

  const displayName = user?.name || user?.email || 'Signed in';
  const badge = initials(user?.name) ?? null;

  return (
    <header className="h-16 bg-surface/80 backdrop-blur-md border-b border-border flex items-center justify-between px-8 sticky top-0 z-40">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textSecondary group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Search transactions, inventory..."
            className="w-full bg-background border border-border rounded-full pl-10 pr-4 py-2 text-sm text-white placeholder:text-textSecondary focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-6">
        <button className="relative text-textSecondary hover:text-white transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-danger rounded-full border border-surface"></span>
        </button>

        <div className="relative pl-6 border-l border-border" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-white/5 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/50 text-primary text-xs font-semibold">
              {badge ?? <User className="w-4 h-4" />}
            </div>
            <div className="hidden md:block text-sm text-left">
              <p className="text-white font-medium" title={user?.email ?? undefined}>
                {displayName}
              </p>
              <p className="text-xs text-textSecondary">{roleLabel(user?.role)}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-textSecondary transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-60 glass-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-50"
            >
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm text-white font-medium truncate">{displayName}</p>
                {user?.email && <p className="text-xs text-textSecondary truncate">{user.email}</p>}
                <p className="text-xs text-primary mt-0.5">{roleLabel(user?.role)}</p>
              </div>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setChangePasswordOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-textSecondary hover:bg-white/5 hover:text-white transition-colors"
              >
                <KeyRound className="w-4 h-4" />
                Change password
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => logout()}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-textSecondary hover:bg-white/5 hover:text-white transition-colors border-t border-border"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <ChangePasswordModal isOpen={changePasswordOpen} onClose={closeChangePassword} email={user?.email} />
    </header>
  );
}
