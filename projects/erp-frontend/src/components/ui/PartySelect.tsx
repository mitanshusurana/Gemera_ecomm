'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';

interface Party {
  id: string;
  name: string;
  gstin: string;
  city: string;
  state_code?: string;
  state_name?: string;
}

interface PartySelectProps {
  value?: string;
  onChange: (partyId: string, partyObj?: Party) => void;
  partyType?: 'Customer' | 'Supplier' | 'Both';
  placeholder?: string;
}

export default function PartySelect({ value, onChange, partyType, placeholder = 'Search party...' }: PartySelectProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<Party[]>([]);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);

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

  // Sync selectedParty state when value prop changes (e.g. Edit View modal)
  useEffect(() => {
    if (!value) {
      setSelectedParty(null);
      return;
    }

    if (selectedParty && selectedParty.id === value) {
      return;
    }

    const existing = options.find((p) => p.id === value);
    if (existing) {
      setSelectedParty(existing);
      onChange(existing.id, existing);
      return;
    }

    let active = true;
    apiClient.get(`/parties/${value}`)
      .then((res) => {
        if (!active || !res.data) return;
        const p = res.data;
        const formatted: Party = {
          id: p.id,
          name: (p.name && p.name.trim()) ? p.name : (p.trade_name && p.trade_name.trim()) ? p.trade_name : (p.legal_name && p.legal_name.trim()) ? p.legal_name : (p.code || 'Party Master Item'),
          gstin: p.gstin || 'Unregistered',
          city: p.city || p.state_name || 'Jaipur',
          state_code: p.state_code || '08',
          state_name: p.state_name || p.state || 'Rajasthan'
        };
        setSelectedParty(formatted);
        onChange(formatted.id, formatted);
      })
      .catch((err) => {
        console.error('Failed to pre-fetch party by ID:', err);
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
        const res = await apiClient.get('/parties', {
          params: { q: query, limit: 30 }
        });
        const partyList = Array.isArray(res.data) ? res.data : res.data?.data || [];
        if (active) {
          setOptions(partyList.map((p: any) => ({
            id: p.id,
            name: (p.name && p.name.trim()) ? p.name : (p.trade_name && p.trade_name.trim()) ? p.trade_name : (p.legal_name && p.legal_name.trim()) ? p.legal_name : (p.code || 'Party Master Item'),
            gstin: p.gstin || 'Unregistered',
            city: p.city || p.state_name || 'Jaipur',
            state_code: p.state_code || '08',
            state_name: p.state_name || p.state || 'Rajasthan'
          })));
        }
      } catch (err) {
        console.error('Party fetch error:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchOptions();
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, partyType]);

  const handleSelect = (party: Party) => {
    setSelectedParty(party);
    setIsOpen(false);
    onChange(party.id, party);
  };

  const handleClear = () => {
    setSelectedParty(null);
    onChange('');
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      {selectedParty ? (
        <div className="flex items-center justify-between w-full p-2 border border-border bg-surface rounded-md focus-within:border-primary">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">{selectedParty.name}</span>
            <span className="text-xs text-textSecondary">{selectedParty.gstin}</span>
          </div>
          <button type="button" onClick={handleClear} className="p-1 hover:bg-white/10 rounded-md">
            <X className="w-4 h-4 text-textSecondary" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textSecondary" />
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded-md text-white placeholder:text-textSecondary focus:outline-none focus:border-primary transition-colors text-sm"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />}
        </div>
      )}

      {isOpen && !selectedParty && (
        <div className="absolute z-50 w-full mt-1 bg-surface border border-border rounded-md shadow-lg max-h-60 overflow-auto">
          {options.length === 0 ? (
            <div className="p-3 text-sm text-textSecondary text-center">No parties found</div>
          ) : (
            <ul className="py-1">
              {options.map((party) => (
                <li
                  key={party.id}
                  className="px-3 py-2 hover:bg-white/5 cursor-pointer flex flex-col"
                  onClick={() => handleSelect(party)}
                >
                  <span className="text-sm font-medium text-white">{party.name}</span>
                  <div className="flex items-center gap-2 text-xs text-textSecondary mt-0.5">
                    <span>{party.gstin}</span>
                    <span>•</span>
                    <span>{party.city}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
