'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, FileText, Loader2, Package, Search, ShoppingBag, Users } from 'lucide-react';

import VoucherModal from '@/components/ui/VoucherModal';
import { insightsApi, SearchHit } from '@/lib/api';

const KIND_LABEL: Record<string, string> = {
  party: 'Parties', item: 'Stock items', sales_invoice: 'Sales invoices', purchase_bill: 'Purchase bills', voucher: 'Vouchers',
};
const KIND_ICON: Record<string, React.ReactNode> = {
  party: <Users className="w-4 h-4" />, item: <Package className="w-4 h-4" />, sales_invoice: <FileText className="w-4 h-4" />,
  purchase_bill: <ShoppingBag className="w-4 h-4" />, voucher: <BookOpen className="w-4 h-4" />,
};

/** One box over parties, items, invoices, bills and vouchers. "/" focuses it. */
export default function GlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [voucherId, setVoucherId] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounced lookup; a reply for an older term is dropped.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setLoading(false); return; }
    let current = true;
    setLoading(true);
    const t = setTimeout(() => {
      insightsApi.search(term)
        .then((res) => { if (current) { setHits(res.data?.results || []); setActive(0); } })
        .catch(() => { if (current) setHits([]); })
        .finally(() => { if (current) setLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === '/' && !typing) { e.preventDefault(); inputRef.current?.focus(); }
    };
    const onPointer = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onPointer); };
  }, []);

  const go = (hit: SearchHit) => {
    setOpen(false);
    if (hit.kind === 'voucher' && hit.voucher_id != null) { setVoucherId(hit.voucher_id); return; }
    if (!hit.href) return;
    // Pages read their URL parameters when they mount; if the target page is
    // the one already showing, load it afresh so the parameter is seen.
    if (hit.href.split('?')[0] === pathname) window.location.assign(hit.href);
    else router.push(hit.href);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); go(hits[active]); }
  };

  const term = q.trim();
  let lastKind = '';

  return (
    <div className="relative group" ref={boxRef}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textSecondary group-focus-within:text-primary transition-colors" />
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKey}
        placeholder="Search parties, items, invoices, vouchers  ( / )"
        aria-label="Search"
        className="w-full bg-background border border-border rounded-full pl-10 pr-9 py-2 text-sm text-white placeholder:text-textSecondary focus:outline-none focus:border-primary transition-colors"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textSecondary animate-spin" />}

      {open && term.length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-surface border border-border rounded-xl shadow-2xl z-50 max-h-[70vh] overflow-y-auto">
          {hits.length === 0 ? (
            <p className="px-4 py-4 text-sm text-textSecondary">{loading ? 'Searching...' : `Nothing found for “${term}”.`}</p>
          ) : hits.map((hit, i) => {
            const heading = hit.kind !== lastKind ? KIND_LABEL[hit.kind] || hit.kind : null;
            lastKind = hit.kind;
            return (
              <div key={`${hit.kind}-${hit.id}`}>
                {heading && <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-textSecondary">{heading}</p>}
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(hit)}
                  className={`w-full flex items-start gap-3 px-4 py-2 text-left transition-colors ${i === active ? 'bg-white/5' : ''}`}
                >
                  <span className="text-primary mt-0.5">{KIND_ICON[hit.kind]}</span>
                  <span className="min-w-0">
                    <span className="block text-sm text-white truncate">{hit.title}</span>
                    <span className="block text-xs text-textSecondary truncate">{hit.subtitle}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <VoucherModal voucherId={voucherId} onClose={() => setVoucherId(null)} />
    </div>
  );
}
