'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Factory,
  ShoppingCart,
  ShoppingBag,
  BookOpen,
  FileText,
  BarChart3,
  ShieldCheck,
  Users,
  UserCog,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Calendar,
  Landmark,
  Plus,
  Minus,
  AlertTriangle,
  ClipboardList,
  Receipt
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { financialYearLabel } from '@/lib/fiscal';
import { useCompany } from '@/lib/company';
import { normaliseRole, useMe } from '@/lib/session';

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  group: string;
  /** Roles that see the entry; absent means everyone. The API enforces the
   *  real check -- this only keeps a door out of the menu for people it
   *  would refuse. */
  roles?: string[];
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'Main' },
  { name: 'Parties', href: '/parties', icon: Users, group: 'Masters' },
  { name: 'Stock Items', href: '/inventory', icon: Package, group: 'Masters' },
  { name: 'Manufacturing', href: '/manufacturing', icon: Factory, group: 'Operations' },
  { name: 'Sales', href: '/sales', icon: ShoppingCart, group: 'Operations' },
  { name: 'Purchases', href: '/purchases', icon: ShoppingBag, group: 'Operations' },
  { name: 'Memos (Jangad)', href: '/memos', icon: ClipboardList, group: 'Operations' },
  { name: 'Receipt', href: '/vouchers/receipt', icon: ArrowDownLeft, group: 'Vouchers' },
  { name: 'Payment', href: '/vouchers/payment', icon: ArrowUpRight, group: 'Vouchers' },
  { name: 'Journal', href: '/vouchers/journal', icon: BookOpen, group: 'Vouchers' },
  { name: 'Contra', href: '/vouchers/contra', icon: ArrowLeftRight, group: 'Vouchers' },
  { name: 'Credit Note', href: '/vouchers/credit-note', icon: Minus, group: 'Vouchers' },
  { name: 'Debit Note', href: '/vouchers/debit-note', icon: Plus, group: 'Vouchers' },
  { name: 'Day Book', href: '/books', icon: Calendar, group: 'Books' },
  { name: 'Ledger', href: '/ledger', icon: FileText, group: 'Books' },
  { name: 'Outstanding', href: '/outstanding', icon: AlertTriangle, group: 'Books' },
  { name: 'Accounting', href: '/accounting', icon: BookOpen, group: 'Finance' },
  { name: 'GST', href: '/gst', icon: Receipt, group: 'Finance' },
  { name: 'GST & Compliance', href: '/gst/exports', icon: FileText, group: 'Finance' },
  { name: 'Reconciliation', href: '/banking', icon: Landmark, group: 'Banking' },
  { name: 'Reports', href: '/reports', icon: BarChart3, group: 'Admin' },
  // The reports page picks its tab by component state, not by URL, so the
  // nearest reachable target for the audit trail is the reports page itself.
  { name: 'Audit Trail', href: '/reports', icon: ShieldCheck, group: 'Admin' },
  // Only owners and admins may manage users (app.core.roles.CAN_AMEND).
  { name: 'Users', href: '/users', icon: UserCog, group: 'Admin', roles: ['owner', 'admin'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { company } = useCompany();
  const { me } = useMe();
  const role = normaliseRole(me?.role);

  const visible = navigation.filter((item) => !item.roles || item.roles.includes(role));

  const groupedNav = visible.reduce((acc, item) => {
    if (!acc[item.group]) {
      acc[item.group] = [];
    }
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  const groupOrder = ['Main', 'Masters', 'Operations', 'Vouchers', 'Books', 'Finance', 'Banking', 'Admin'];

  return (
    <div className="w-64 h-screen bg-surface border-r border-border flex flex-col fixed left-0 top-0 overflow-y-auto">
      {/* Brand */}
      <div className="p-6 flex items-center gap-3">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="url(#gold-gradient-sidebar)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <defs>
            <linearGradient id="gold-gradient-sidebar" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#D4A843" />
              <stop offset="100%" stopColor="#B28830" />
            </linearGradient>
          </defs>
          <path d="M6 3h12l4 6-10 12L2 9l4-6z" />
          <path d="M2 9h20" />
          <path d="M12 21V9" />
        </svg>
        <span className="text-2xl font-playfair font-bold text-white tracking-wide">Caratloop</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-6 pb-6">
        {groupOrder.map((group) => {
          const items = groupedNav[group];
          if (!items) return null;
          return (
            <div key={group} className="space-y-2">
              <h3 className="text-xs font-semibold text-textSecondary uppercase tracking-wider px-3">
                {group}
              </h3>
              <ul className="space-y-1">
                {items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group",
                          isActive
                            ? "bg-primary/10 text-primary border-l-2 border-primary"
                            : "text-textSecondary hover:bg-white/5 hover:text-white"
                        )}
                      >
                        <item.icon className={cn(
                          "w-5 h-5",
                          isActive ? "text-primary" : "text-textSecondary group-hover:text-primary"
                        )} />
                        <span className={cn(
                          isActive ? "" : "group-hover:text-white transition-colors"
                        )}>
                          {item.name}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border mt-auto">
        <div className="text-xs text-textSecondary text-center">
          <p className="font-semibold text-white">{company?.legal_name || company?.name || company?.trade_name || '—'}</p>
          <p>FY {financialYearLabel()}</p>
        </div>
      </div>
    </div>
  );
}
