'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, BookOpen, FileText, Package, Plus, Receipt, ShoppingBag, Users } from 'lucide-react';

import { QUICK_CREATE_EVENT } from '@/lib/quickCreate';

// `form: true` pages open their entry form on `?new=1` (see useQuickCreate);
// the voucher pages are entry forms already.
const ITEMS: { group: string; label: string; href: string; form?: boolean; icon: React.ReactNode }[] = [
  { group: 'Sales', label: 'Sales invoice', href: '/sales', form: true, icon: <FileText className="w-4 h-4" /> },
  { group: 'Sales', label: 'Receipt', href: '/vouchers/receipt', icon: <ArrowDownLeft className="w-4 h-4" /> },
  { group: 'Purchases', label: 'Purchase bill', href: '/purchases', form: true, icon: <ShoppingBag className="w-4 h-4" /> },
  { group: 'Purchases', label: 'Expense', href: '/expenses', form: true, icon: <Receipt className="w-4 h-4" /> },
  { group: 'Purchases', label: 'Payment', href: '/vouchers/payment', icon: <ArrowUpRight className="w-4 h-4" /> },
  { group: 'Accounts', label: 'Journal', href: '/vouchers/journal', icon: <BookOpen className="w-4 h-4" /> },
  { group: 'Masters', label: 'Party', href: '/parties', form: true, icon: <Users className="w-4 h-4" /> },
  { group: 'Masters', label: 'Stock item', href: '/inventory', form: true, icon: <Package className="w-4 h-4" /> },
];

/** The "+" in the header: start any common entry from any screen. */
export default function QuickCreate() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const start = (item: (typeof ITEMS)[number]) => {
    setOpen(false);
    if (!item.form) { router.push(item.href); return; }
    if (pathname === item.href) window.dispatchEvent(new Event(QUICK_CREATE_EVENT));
    else router.push(`${item.href}?new=1`);
  };

  let lastGroup = '';
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Create new"
        title="Create new"
        className="w-9 h-9 rounded-lg bg-primary text-black flex items-center justify-center hover:bg-primary/90 transition-colors"
      >
        <Plus className={`w-5 h-5 transition-transform ${open ? 'rotate-45' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden z-50 py-1">
          {ITEMS.map((item) => {
            const heading = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.label}>
                {heading && <p className="px-4 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-textSecondary">{heading}</p>}
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => start(item)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-textSecondary hover:bg-white/5 hover:text-white transition-colors"
                >
                  <span className="text-primary">{item.icon}</span>
                  {item.label}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
