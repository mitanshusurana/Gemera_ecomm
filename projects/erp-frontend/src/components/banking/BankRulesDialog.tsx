'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';

import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import PartySelect from '@/components/ui/PartySelect';
import { apiClient, BankRule, controlsApi } from '@/lib/api';

const fieldCls = 'w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none';

/** Rules that suggest a ledger or party when a statement line containing some text is booked. */
export default function BankRulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rules, setRules] = useState<BankRule[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [matchText, setMatchText] = useState('');
  const [direction, setDirection] = useState('Any');
  const [target, setTarget] = useState<'ledger' | 'party'>('ledger');
  const [accountId, setAccountId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    controlsApi.getBankRules().then((r) => setRules(r.data?.rules || [])).catch(() => setRules([])).finally(() => setLoading(false));
  };
  useEffect(() => {
    if (!open) return;
    load();
    apiClient.get('/accounting/accounts', { params: { limit: 1000 } }).then((r) => setAccounts(r.data?.accounts || [])).catch(() => setAccounts([]));
  }, [open]);

  if (!open) return null;

  const add = async () => {
    setError('');
    if (name.trim().length < 2 || matchText.trim().length < 3) { setError('Give the rule a name and at least three characters to look for.'); return; }
    if (target === 'ledger' ? !accountId : !partyId) { setError(`Choose the ${target} to suggest.`); return; }
    setSaving(true);
    try {
      await controlsApi.createBankRule({ name: name.trim(), match_text: matchText.trim(), direction,
        account_id: target === 'ledger' ? accountId : undefined, party_id: target === 'party' ? partyId : undefined });
      setName(''); setMatchText(''); setAccountId(''); setPartyId('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not save the rule.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: BankRule) => {
    try { await controlsApi.setBankRuleActive(r.id, !r.is_active); load(); } catch { /* list stays as it was */ }
  };

  return (
    <Modal isOpen onClose={onClose} title="Bank rules">
      <div className="space-y-4">
        <p className="text-xs text-textSecondary">When a statement line&apos;s description contains the text, booking it starts with the ledger or party already chosen. You still confirm every entry.</p>
        <div className="border border-border rounded-lg divide-y divide-border max-h-56 overflow-y-auto">
          {loading ? <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
            : rules.length === 0 ? <p className="py-5 text-center text-sm text-textSecondary">No rules yet.</p>
            : rules.map((r) => (
              <div key={r.id} className="px-3 py-2.5 flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white truncate">{r.name}</span>
                  <span className="block text-xs text-textSecondary truncate">contains “{r.match_text}” · {r.direction === 'Any' ? 'money in or out' : r.direction === 'Debit' ? 'money out' : 'money in'} → {r.account_name || r.party_name}</span>
                </span>
                <Badge variant={r.is_active ? 'success' : 'default'}>{r.is_active ? 'On' : 'Off'}</Badge>
                <button onClick={() => toggle(r)} className="px-2 py-1 bg-surface border border-border hover:border-primary text-textSecondary hover:text-white rounded text-xs">{r.is_active ? 'Switch off' : 'Switch on'}</button>
              </div>
            ))}
        </div>

        <div className="p-3 bg-surface/50 border border-border rounded-lg space-y-3">
          <p className="text-sm font-semibold text-white">New rule</p>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Electricity" className={fieldCls} />
            <input type="text" maxLength={120} value={matchText} onChange={(e) => setMatchText(e.target.value)} placeholder="Text in the description, e.g. JVVNL" className={fieldCls} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <select value={direction} onChange={(e) => setDirection(e.target.value)} className={fieldCls}>
              <option value="Any">Money in or out</option>
              <option value="Debit">Money out</option>
              <option value="Credit">Money in</option>
            </select>
            <select value={target} onChange={(e) => setTarget(e.target.value as 'ledger' | 'party')} className={fieldCls}>
              <option value="ledger">Suggest a ledger</option>
              <option value="party">Suggest a party</option>
            </select>
            {target === 'ledger' ? (
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={fieldCls}>
                <option value="">Select ledger...</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            ) : (
              <PartySelect value={partyId} onChange={(id) => setPartyId(id)} partyType="Both" placeholder="Search party..." />
            )}
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end">
            <button type="button" disabled={saving} onClick={add} className="px-4 py-2 bg-gold-gradient text-background font-semibold text-sm rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add rule
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
