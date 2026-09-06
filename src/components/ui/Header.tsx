'use client';

import { Bell, LogOut, Search, User } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getUser, logout, type SessionUser } from '@/lib/auth';

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
  // Read after mount, not during render: the session lives in localStorage,
  // which does not exist on the server, and rendering a different value on the
  // two sides would trip hydration.
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

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

        <div className="flex items-center gap-3 pl-6 border-l border-border">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/50 text-primary text-xs font-semibold">
            {badge ?? <User className="w-4 h-4" />}
          </div>
          <div className="hidden md:block text-sm">
            <p className="text-white font-medium" title={user?.email ?? undefined}>
              {displayName}
            </p>
            <p className="text-xs text-textSecondary">{roleLabel(user?.role)}</p>
          </div>
          <button
            onClick={() => logout()}
            title="Sign out"
            aria-label="Sign out"
            className="text-textSecondary hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
