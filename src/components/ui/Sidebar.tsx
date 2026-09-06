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
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Calendar,
  Landmark,
  Plus,
  Minus,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { financialYearLabel } from '@/lib/fiscal';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'Main' },
  { name: 'Parties', href: '/parties', icon: Users, group: 'Masters' },
  { name: 'Stock Items', href: '/inventory', icon: Package, group: 'Masters' },
  { name: 'Manufacturing', href: '/manufacturing', icon: Factory, group: 'Operations' },
  { name: 'Sales', href: '/sales', icon: ShoppingCart, group: 'Operations' },
  { name: 'Purchases', href: '/purchases', icon: ShoppingBag, group: 'Operations' },
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
  { name: 'GST & Compliance', href: '/gst/exports', icon: FileText, group: 'Finance' },
  { name: 'Reconciliation', href: '/banking', icon: Landmark, group: 'Banking' },
  { name: 'Reports', href: '/reports', icon: BarChart3, group: 'Admin' },
  { name: 'Audit Trail', href: '#', icon: ShieldCheck, group: 'Admin' },
];

export default function Sidebar() {
  const pathname = usePathname();

  const groupedNav = navigation.reduce((acc, item) => {
    if (!acc[item.group]) {
      acc[item.group] = [];
    }
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, typeof navigation>);

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
          <p className="font-semibold text-white">Caratloop Pvt Ltd</p>
          <p>FY {financialYearLabel()}</p>
        </div>
      </div>
    </div>
  );
}
