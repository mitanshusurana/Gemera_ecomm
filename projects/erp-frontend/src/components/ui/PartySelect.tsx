'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, Plus } from 'lucide-react';
import { apiClient, partiesApi } from '@/lib/api';

/**
 * Party search box.
 *
 * Shows the TRADE name first (the shop and the bank statement know
 * "G Star Gems" by that name) with the legal name underneath, searches both,
 * and when nothing matches offers to create the party right here instead of
 * sending the user to the Parties page and back.
 */
interface Party {
  id: string;
  /** Display name: trade name, else legal name. */
  name: string;
  legalName?: string;
  gstin: string;
  city: string;
  state_code?: string;
  state_name?: string;
}

interface PartySelectProps {
  value?: string;
  onChange: (partyId: string, partyObj?: Party) => void;
  partyType?: 'Customer' | 'Supplier' | 'Both';
  /** Restrict the search to these stored party types (e.g. ['Karigar', 'Supplier']).
   *  Sent to the API as a comma-separated `type`; `partyType` alone decides
   *  what a party created inline is saved as. */
  types?: string[];
  placeholder?: string;
  /** Hide the inline "create" offer (defaults to shown). */
  allowCreate?: boolean;
}

function toParty(p: any): Party {
  const trade = (p.trade_name || '').trim();
  const legal = (p.name || p.legal_name || '').trim();
  return {
    id: p.id,
    name: trade || legal || p.code || 'Party',
    legalName: legal && legal !== trade ? legal : undefined,
    gstin: p.gstin || 'Unregistered',
    city: p.city || p.state_name || 'Jaipur',
    state_code: p.state_code || '08',
    state_name: p.state_name || p.state || 'Rajasthan',
  };
}

const STATES: Array<[string, string]> = [
  ['08', 'Rajasthan'], ['07', 'Delhi'], ['09', 'Uttar Pradesh'], ['24', 'Gujarat'], ['27', 'Maharashtra'],
  ['06', 'Haryana'], ['03', 'Punjab'], ['23', 'Madhya Pradesh'], ['29', 'Karnataka'], ['33', 'Tamil Nadu'],
  ['36', 'Telangana'], ['19', 'West Bengal'], ['32', 'Kerala'], ['37', 'Andhra Pradesh'], ['10', 'Bihar'],
  ['04', 'Chandigarh'], ['22', 'Chhattisgarh'], ['21', 'Odisha'], ['20', 'Jharkhand'], ['05', 'Uttarakhand'],
  ['02', 'Himachal Pradesh'], ['01', 'Jammu & Kashmir'], ['18', 'Assam'], ['30', 'Goa'],
];

export default function PartySelect({ value, onChange, partyType, types, placeholder = 'Search party...', allowCreate = true }: PartySelectProps) {
  const typeFilter = types && types.length ? types.join(',') : undefined;
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<Party[]>([]);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);

  // Inline creation
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState<'Customer' | 'Supplier' | 'Both'>(partyType || 'Customer');
  const [newTrade, setNewTrade] = useState('');
  const [newLegal, setNewLegal] = useState('');
  const [newGstin, setNewGstin] = useState('');
  const [newState, setNewState] = useState('08');
  const [newPhone, setNewPhone] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [wrapperRef]);

  // Sync selectedParty when the value prop changes (e.g. an edit modal).
  useEffect(() => {
    if (!value) {
      setSelectedParty(null);
      return;
    }
    if (selectedParty && selectedParty.id === value) return;
    const existing = options.find((p) => p.id === value);
    if (existing) {
      setSelectedParty(existing);
      onChange(existing.id, existing);
      return;
    }
    let active = true;
    apiClient
      .get(`/parties/${value}`)
      .then((res) => {
        if (!active || !res.data) return;
        const formatted = toParty(res.data);
        setSelectedParty(formatted);
        onChange(formatted.id, formatted);
      })
      .catch((err) => console.error('Failed to pre-fetch party by ID:', err));
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
          params: typeFilter ? { q: query, limit: 30, type: typeFilter } : { q: query, limit: 30 },
        });
        const partyList = Array.isArray(res.data) ? res.data : res.data?.data || [];
        if (active) setOptions(partyList.map(toParty));
      } catch (err) {
        console.error('Party fetch error:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    const timer = setTimeout(fetchOptions, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, partyType, typeFilter]);

  const handleSelect = (party: Party) => {
    setSelectedParty(party);
    setIsOpen(false);
    setCreating(false);
    onChange(party.id, party);
  };

  const handleClear = () => {
    setSelectedParty(null);
    onChange('');
  };

  const startCreate = () => {
    setNewType(partyType || 'Customer');
    setNewTrade(query.trim());
    setNewLegal('');
    setNewGstin('');
    setNewState('08');
    setNewPhone('');
    setCreateError(null);
    setCreating(true);
  };

  // GSTIN lookup fills the legal name, trade name and state from the GST portal.
  const lookupGstin = async () => {
    const g = newGstin.trim().toUpperCase();
    if (g.length !== 15) {
      setCreateError('A GSTIN has 15 characters.');
      return;
    }
    setLookingUp(true);
    setCreateError(null);
    try {
      const res = await partiesApi.fetchByGstin(g);
      const d = res.data || {};
      if (d.legal_name) setNewLegal(d.legal_name);
      if (d.trade_name) setNewTrade(d.trade_name);
      if (d.state_code) setNewState(d.state_code);
      if (!d.legal_name && !d.trade_name) setCreateError(d.reason || 'No details returned for this GSTIN.');
    } catch (err: any) {
      setCreateError(err.response?.data?.detail || 'GSTIN lookup failed.');
    } finally {
      setLookingUp(false);
    }
  };

  const saveNew = async () => {
    const trade = newTrade.trim();
    const legal = newLegal.trim() || trade;
    if (!legal) {
      setCreateError('Enter at least a name.');
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      const stateName = STATES.find(([c]) => c === newState)?.[1];
      const res = await partiesApi.create({
        party_type: newType,
        name: legal,
        trade_name: trade || undefined,
        gstin: newGstin.trim().toUpperCase() || undefined,
        gst_reg_type: newGstin.trim() ? 'Regular' : 'Unregistered',
        state_code: newState,
        state_name: stateName,
        phone: newPhone.trim() || undefined,
      });
      const created = toParty({ ...res.data, id: res.data?.id, trade_name: trade, name: legal, gstin: newGstin.trim().toUpperCase(), state_code: newState, state_name: stateName });
      setOptions((prev) => [created, ...prev]);
      handleSelect(created);
      setQuery('');
    } catch (err: any) {
      setCreateError(err.response?.data?.detail || 'Could not create the party.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-white text-sm outline-none focus:border-primary';

  return (
    <div ref={wrapperRef} className="relative w-full">
      {selectedParty ? (
        <div className="flex items-center justify-between w-full p-2 border border-border bg-surface rounded-md focus-within:border-primary">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">{selectedParty.name}</span>
            <span className="text-xs text-textSecondary">
              {selectedParty.legalName ? `${selectedParty.legalName} · ` : ''}{selectedParty.gstin}
            </span>
          </div>
          <button type="button" onClick={handleClear} className="p-1 hover:bg-white/10 rounded-md" aria-label="Clear party">
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
              setCreating(false);
            }}
            onFocus={() => setIsOpen(true)}
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />}
        </div>
      )}

      {isOpen && !selectedParty && (
        <div className="absolute z-50 w-full mt-1 bg-surface border border-border rounded-md shadow-lg max-h-96 overflow-auto">
          {creating ? (
            <div className="p-3 space-y-2" onMouseDown={(e) => e.stopPropagation()}>
              <div className="text-sm font-semibold text-white">New party</div>
              <div className="flex gap-2">
                {(['Customer', 'Supplier', 'Both'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNewType(t)}
                    className={`px-2.5 py-1 rounded text-xs border ${newType === t ? 'bg-primary text-black border-primary font-semibold' : 'border-border text-textSecondary'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input className={inputCls} placeholder="GSTIN (optional)" value={newGstin} onChange={(e) => setNewGstin(e.target.value)} maxLength={15} />
                <button type="button" onClick={lookupGstin} disabled={lookingUp} className="px-2.5 py-1.5 rounded-md border border-border text-xs text-textSecondary hover:text-white whitespace-nowrap">
                  {lookingUp ? '…' : 'Lookup'}
                </button>
              </div>
              <input className={inputCls} placeholder="Trade name (how you know them)" value={newTrade} onChange={(e) => setNewTrade(e.target.value)} />
              <input className={inputCls} placeholder="Legal name (as on GST / PAN); defaults to trade name" value={newLegal} onChange={(e) => setNewLegal(e.target.value)} />
              <div className="flex gap-2">
                <select className={inputCls} value={newState} onChange={(e) => setNewState(e.target.value)}>
                  {STATES.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
                </select>
                <input className={inputCls} placeholder="Phone (optional)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </div>
              {createError && <p className="text-xs text-danger">{createError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setCreating(false)} className="px-3 py-1.5 rounded-md border border-border text-xs text-textSecondary hover:text-white">Back</button>
                <button type="button" onClick={saveNew} disabled={saving} className="px-3 py-1.5 rounded-md bg-primary text-black text-xs font-semibold disabled:opacity-60">
                  {saving ? 'Saving…' : 'Create and select'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {options.length === 0 ? (
                <div className="p-3 text-sm text-textSecondary text-center">No parties found{query ? ` for “${query}”` : ''}</div>
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
                        {party.legalName && (<><span>{party.legalName}</span><span>•</span></>)}
                        <span>{party.gstin}</span>
                        <span>•</span>
                        <span>{party.city}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {allowCreate && (
                <button
                  type="button"
                  onClick={startCreate}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-white/5 border-t border-border"
                >
                  <Plus className="w-4 h-4" />
                  Create new party{query.trim() ? ` “${query.trim()}”` : ''}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
