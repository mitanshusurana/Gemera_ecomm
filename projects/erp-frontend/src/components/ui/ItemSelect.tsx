'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { itemsApi } from '@/lib/api';

export interface StockItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  hsn_code: string;
  gst_tax_rate: number;
  material_gst_rate: number;
  current_stock?: number;
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
          current_stock: i.current_stock ?? 0
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
              current_stock: match.current_stock ?? 0
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
            current_stock: i.current_stock ?? 0
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
              {loading && options.length === 0 ? (
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
