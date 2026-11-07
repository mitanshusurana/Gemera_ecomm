'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, Package, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { itemsApi, apiClient } from '@/lib/api';

export interface StockItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  hsn_code: string;
  gst_tax_rate: number;
  material_gst_rate: number;
  current_stock?: number;
  category?: string;
}

interface ItemSelectProps {
  value?: string;
  onChange: (itemId: string, item?: StockItem) => void;
  placeholder?: string;
  className?: string;
}

export default function ItemSelect({ value, onChange, placeholder = 'Search item...', className }: ItemSelectProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<StockItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);

  // Inline creation: a purchase bill often needs an item that does not exist
  // yet (a new gemstone line, or a service such as rent or electricity).
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newCategory, setNewCategory] = useState('Other');
  const [newUom, setNewUom] = useState('pcs');
  const [newHsn, setNewHsn] = useState('');
  const [newRate, setNewRate] = useState('3');
  const [newExpenseAccount, setNewExpenseAccount] = useState('');
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const startCreate = () => {
    const name = query.trim();
    setNewName(name);
    setNewCode(name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20));
    setNewCategory('Other');
    setNewUom('pcs');
    setNewHsn('');
    setNewRate('3');
    setNewExpenseAccount('');
    setCreateError(null);
    setCreating(true);
    if (expenseAccounts.length === 0) {
      apiClient.get('/accounting/accounts', { params: { nature: 'Expenses', limit: 1000 } })
        .then((res) => setExpenseAccounts(res.data?.accounts || []))
        .catch(() => setExpenseAccounts([]));
    }
  };

  const saveNew = async () => {
    const name = newName.trim();
    if (!name) { setCreateError('Enter the item name.'); return; }
    if (newCategory === 'Service' && !newExpenseAccount) { setCreateError('Choose the expense ledger this service is booked to.'); return; }
    if (!newHsn.trim()) { setCreateError(newCategory === 'Service' ? 'Enter the SAC (e.g. 997212 for rent).' : 'Enter the HSN code.'); return; }
    setSaving(true);
    setCreateError(null);
    try {
      const res = await itemsApi.create({
        code: (newCode.trim() || name).toUpperCase(),
        name,
        category: newCategory,
        uom: newCategory === 'Service' ? 'pcs' : newUom,
        hsn_code: newHsn.trim(),
        gst_tax_rate: Number(newRate) || 0,
        expense_account_id: newCategory === 'Service' ? newExpenseAccount : undefined,
        reason: 'Created from the item picker',
      });
      const created: StockItem = {
        id: res.data?.id, code: (newCode.trim() || name).toUpperCase(), name,
        unit: newCategory === 'Service' ? 'pcs' : newUom, hsn_code: newHsn.trim(),
        gst_tax_rate: Number(newRate) || 0, material_gst_rate: Number(newRate) || 0, current_stock: 0, category: newCategory,
      };
      if (!created.id) throw new Error('no id');
      setOptions((prev) => [created, ...prev]);
      setCreating(false);
      handleSelect(created);
    } catch (err: any) {
      setCreateError(err.response?.data?.detail || 'Could not create the item.');
    } finally {
      setSaving(false);
    }
  };

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  // Sync selectedItem state when value prop changes (e.g. Edit View modal)
  useEffect(() => {
    if (!value) {
      setSelectedItem(null);
      return;
    }

    if (selectedItem && selectedItem.id === value) {
      return;
    }

    const existing = options.find((i) => i.id === value);
    if (existing) {
      setSelectedItem(existing);
      onChange(existing.id, existing);
      return;
    }

    let active = true;
    itemsApi.getById(value)
      .then((res) => {
        if (!active || !res.data) return;
        const i = res.data;
        const rateVal = Number(i.gst_tax_rate ?? i.material_gst_rate ?? i.gst_rate ?? 0.25);
        const formatted: StockItem = {
          id: i.id,
          code: i.code || i.name,
          name: i.name,
          unit: i.uom || i.unit || 'ct',
          hsn_code: i.hsn_code || '71131910',
          gst_tax_rate: rateVal,
          material_gst_rate: rateVal,
          current_stock: i.current_stock ?? 0,
        category: i.category
        };
        setSelectedItem(formatted);
        onChange(formatted.id, formatted);
      })
      .catch(() => {
        // Fallback: search by query/value if getItem fails
        itemsApi.search(value).then((res) => {
          if (!active || !res.data) return;
          const list = Array.isArray(res.data) ? res.data : res.data?.materials || [];
          const match = list.find((item: any) => item.id === value || item.code === value);
          if (match) {
            const rateVal = Number(match.gst_tax_rate ?? match.material_gst_rate ?? match.gst_rate ?? 0.25);
            const formatted: StockItem = {
              id: match.id,
              code: match.code,
              name: match.name,
              unit: match.uom || match.unit || 'ct',
              hsn_code: match.hsn_code || '71131910',
              gst_tax_rate: rateVal,
              material_gst_rate: rateVal,
              current_stock: match.current_stock ?? 0,
              category: match.category
            };
            setSelectedItem(formatted);
            onChange(formatted.id, formatted);
          }
        });
      });

    return () => {
      active = false;
    };
  }, [value, options]);

  useEffect(() => {
    let active = true;
    const fetchOptions = async () => {
      setLoading(true);
      try {
        const res = await itemsApi.search(query);
        const list = Array.isArray(res.data) ? res.data : res.data?.materials || [];
        if (active) {
          setOptions(list.map((i: any) => ({
            id: i.id,
            code: i.code,
            name: i.name,
            unit: i.uom || i.unit || 'pcs',
            hsn_code: i.hsn_code || '71131910',
            gst_tax_rate: Number(i.gst_tax_rate ?? i.material_gst_rate ?? 3.0),
            material_gst_rate: Number(i.gst_tax_rate ?? i.material_gst_rate ?? 3.0),
            current_stock: i.current_stock ?? 0,
          category: i.category
          })));
        }
      } catch (err) {
        console.error('Item fetch error:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchOptions();
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const handleSelect = (item: StockItem) => {
    setSelectedItem(item);
    setIsOpen(false);
    onChange(item.id, item);
  };

  const handleClear = () => {
    setSelectedItem(null);
    setQuery('');
    onChange('');
  };

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      {selectedItem ? (
        <div className="flex items-center justify-between w-full p-2 border border-border bg-surface rounded-md focus-within:border-primary">
          <div className="flex flex-col">
            <span className="font-medium text-sm text-white">{selectedItem.name}</span>
            <span className="text-xs text-textSecondary font-mono">
              {selectedItem.code} • HSN: {selectedItem.hsn_code} ({selectedItem.material_gst_rate}% GST)
            </span>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="p-1 hover:bg-white/10 rounded-full text-textSecondary hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative w-full">
          <input
            type="text"
            className="w-full bg-background border border-border rounded-md pl-9 pr-8 py-2 text-sm text-white placeholder-textSecondary focus:outline-none focus:border-primary transition-colors h-[38px]"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textSecondary" />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
          )}

          {isOpen && (
            <div className="absolute z-50 left-0 right-0 mt-1 bg-[#18181C] border border-border rounded-md shadow-xl max-h-60 overflow-y-auto">
              {creating ? (
                <div className="p-3 space-y-2 text-sm" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="font-semibold text-white">New item</div>
                  <input className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-white" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <select className="bg-background border border-border rounded-md px-2.5 py-1.5 text-white" value={newCategory} onChange={(e) => { setNewCategory(e.target.value); if (e.target.value === 'Service') setNewRate('18'); }}>
                      {['Gold', 'Silver', 'Diamond', 'Ruby', 'Emerald', 'Sapphire', 'Other_Gem', 'Consumable', 'Finished_Good', 'Other', 'Service'].map((c) => (
                        <option key={c} value={c}>{c === 'Service' ? 'Service / expense' : c.replace('_', ' ')}</option>
                      ))}
                    </select>
                    <input className="bg-background border border-border rounded-md px-2.5 py-1.5 text-white" placeholder="Code" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
                    <input className="bg-background border border-border rounded-md px-2.5 py-1.5 text-white" placeholder={newCategory === 'Service' ? 'SAC (997212 rent)' : 'HSN (7103 gems)'} value={newHsn} onChange={(e) => setNewHsn(e.target.value)} />
                    <input className="bg-background border border-border rounded-md px-2.5 py-1.5 text-white" placeholder="GST %" value={newRate} onChange={(e) => setNewRate(e.target.value)} />
                    {newCategory !== 'Service' && (
                      <select className="bg-background border border-border rounded-md px-2.5 py-1.5 text-white" value={newUom} onChange={(e) => setNewUom(e.target.value)}>
                        {['pcs', 'gm', 'ct', 'kg'].map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    )}
                  </div>
                  {newCategory === 'Service' && (
                    <select className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-white" value={newExpenseAccount} onChange={(e) => setNewExpenseAccount(e.target.value)}>
                      <option value="">Expense ledger this service is booked to...</option>
                      {expenseAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} · {a.name} ({a.group_name})</option>)}
                    </select>
                  )}
                  {createError && <p className="text-xs text-danger">{createError}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setCreating(false)} className="px-3 py-1.5 rounded-md border border-border text-xs text-textSecondary hover:text-white">Back</button>
                    <button type="button" onClick={saveNew} disabled={saving} className="px-3 py-1.5 rounded-md bg-primary text-black text-xs font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Create and select'}</button>
                  </div>
                </div>
              ) : loading && options.length === 0 ? (
                <div className="p-3 text-sm text-textSecondary flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" /> Searching stock items...
                </div>
              ) : options.length === 0 ? (
                <div className="p-3 text-sm text-textSecondary text-center">No items found</div>
              ) : (
                <ul className="py-1 divide-y divide-border/40">
                  {options.map((item) => (
                    <li
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      className="px-3 py-2 text-sm hover:bg-primary/10 cursor-pointer transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary shrink-0" />
                        <div className="flex flex-col">
                          <span className="font-medium text-white">{item.name}</span>
                          <span className="text-xs text-textSecondary font-mono">{item.code}</span>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className="text-xs font-semibold px-2 py-0.5 bg-primary/20 text-primary rounded">
                          HSN {item.hsn_code} @ {item.material_gst_rate}%
                        </span>
                        <span className="text-[10px] text-textSecondary mt-0.5">{item.unit}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!creating && (
                <button type="button" onClick={startCreate} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-white/5 border-t border-border">
                  <Plus className="w-4 h-4" /> Create new item{query.trim() ? ` “${query.trim()}”` : ''}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
