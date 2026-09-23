"use client";

import { useState, useEffect } from 'react';
import Badge from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { Plus, Search, Filter, AlertCircle, Loader2, Upload, FileText, CheckCircle2, ShieldCheck, UserCheck, CreditCard, Building, X, Eye, Download, ExternalLink } from 'lucide-react';
import { partiesApi } from '@/lib/api';

export default function PartiesPage() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [viewKycParty, setViewKycParty] = useState<any | null>(null);
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingGstin, setFetchingGstin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // What the GSTIN lookup actually managed to do, so a lookup that could not
  // run says so instead of leaving the form blank and silent.
  const [gstinNotice, setGstinNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    party_type: 'Both',
    name: '',
    trade_name: '',
    gstin: '',
    pan: '',
    aadhaar_no: '',
    gst_reg_type: 'Regular',
    business_type: 'Proprietorship',
    state_code: '08',
    state_name: 'Rajasthan',
    address_line1: '',
    address_line2: '',
    city: 'Jaipur',
    pincode: '',
    mobile: '',
    email: '',
    credit_limit: 0,
    credit_days: 30,
    opening_balance: 0,
    opening_bal_type: 'Dr',
    // TDS s.194Q (we deduct on purchases from them), TCS s.206C(1H) (we
    // collect on sales to them), s.197 lower-deduction certificate rate.
    tds_applicable: false,
    tcs_applicable: false,
    lower_deduction_pct: '' as string | number,
    tds_pan_verified: false,
    kyc_documents: {
      pan_card: '',
      gst_cert: '',
      aadhaar_card: '',
      cancelled_cheque: ''
    }
  });

  const fetchParties = async () => {
    setLoading(true);
    try {
      const res = await partiesApi.list();
      const partyList = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setParties(partyList);
    } catch (err) {
      console.error('Error fetching parties:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParties();
  }, []);

  const handleFetchGstin = async () => {
    if (!formData.gstin || formData.gstin.length < 15) {
      setError('Please enter a valid 15-digit GSTIN');
      return;
    }
    setFetchingGstin(true);
    setError('');
    setGstinNotice(null);
    try {
      const res = await partiesApi.fetchByGstin(formData.gstin);
      const d = res.data;
      if (d) {
        // state_code, state_name and pan are decoded from the GSTIN itself and
        // are true whether or not a provider answered. Everything else -- the
        // legal name, the address, whether the registration is live -- only
        // exists if one did.
        setFormData(prev => ({
          ...prev,
          name: d.legal_name || prev.name,
          trade_name: d.trade_name || prev.trade_name,
          pan: d.pan || prev.pan,
          state_code: d.state_code || prev.state_code,
          state_name: d.state_name || prev.state_name,
          // Only from a verified lookup: the API used to return 'Regular'
          // unconditionally, so an unchecked GSTIN silently set the party's
          // registration type as though it had been confirmed.
          gst_reg_type: d.verified && d.registration_type ? d.registration_type : prev.gst_reg_type,
          address_line1: d.address?.building_no ? `${d.address.building_no} ${d.address.street || ''}` : prev.address_line1,
          city: d.address?.city || prev.city,
          pincode: d.address?.pincode || prev.pincode,
        }));

        // The failure that prompted this: the endpoint answers 200 with blank
        // fields when no provider is configured, so nothing populated, nothing
        // errored, and the button just stopped spinning. Say what happened.
        if (d.verified) {
          setGstinNotice({
            tone: 'ok',
            text: `Verified via ${d.source}${d.status ? ` — registration ${d.status}` : ''}.`,
          });
        } else if (d.checksum_valid === false) {
          setGstinNotice({
            tone: 'warn',
            text: 'That GSTIN fails its own check digit — it is very likely mistyped. State and PAN below are read from the number as entered.',
          });
        } else {
          setGstinNotice({
            tone: 'warn',
            text: `${d.reason || 'Lookup unavailable.'} State and PAN were filled from the number itself; enter the name and address manually.`,
          });
        }
      }
    } catch (err: any) {
      console.error('GSTIN Fetch Error:', err);
      setError('Could not verify GSTIN. You can fill party details manually.');
    } finally {
      setFetchingGstin(false);
    }
  };

  const handleNewParty = (isConsumer: boolean = false) => {
    setEditingPartyId(null);
    setError('');
    setFormData({
      party_type: 'Both',
      name: '',
      trade_name: '',
      gstin: isConsumer ? 'Unregistered' : '',
      pan: '',
      aadhaar_no: '',
      gst_reg_type: isConsumer ? 'Unregistered' : 'Regular',
      business_type: 'Proprietorship',
      state_code: '08',
      state_name: 'Rajasthan',
      address_line1: '',
      address_line2: '',
      city: 'Jaipur',
      pincode: '',
      mobile: '',
      email: '',
      credit_limit: 0,
      credit_days: 30,
      opening_balance: 0,
      opening_bal_type: 'Dr',
      tds_applicable: false,
      tcs_applicable: false,
      lower_deduction_pct: '',
      tds_pan_verified: false,
      kyc_documents: {
        pan_card: '',
        gst_cert: '',
        aadhaar_card: '',
        cancelled_cheque: ''
      }
    });
    setIsDrawerOpen(true);
  };

  const handleEditParty = (party: any) => {
    setEditingPartyId(party.id);
    setError('');
    setFormData({
      party_type: party.party_type || party.type || 'Both',
      name: party.name || '',
      trade_name: party.trade_name || '',
      gstin: party.gstin || '',
      pan: party.pan || '',
      aadhaar_no: party.aadhaar_no || '',
      gst_reg_type: party.gst_reg_type || (party.gstin && party.gstin.length === 15 ? 'Regular' : 'Unregistered'),
      business_type: party.business_type || 'Proprietorship',
      state_code: party.state_code || '08',
      state_name: party.state_name || party.state || 'Rajasthan',
      address_line1: party.address_line1 || party.address || '',
      address_line2: party.address_line2 || '',
      city: party.city || 'Jaipur',
      pincode: party.pincode || '',
      mobile: party.mobile || party.phone || '',
      email: party.email || '',
      credit_limit: Number(party.credit_limit || party.creditLimit || 0),
      credit_days: Number(party.credit_days || 30),
      opening_balance: Number(party.opening_balance || 0),
      opening_bal_type: party.opening_bal_type || 'Dr',
      tds_applicable: Boolean(party.tds_applicable),
      tcs_applicable: Boolean(party.tcs_applicable),
      lower_deduction_pct: party.lower_deduction_pct === null || party.lower_deduction_pct === undefined ? '' : Number(party.lower_deduction_pct),
      tds_pan_verified: Boolean(party.tds_pan_verified),
      kyc_documents: party.kyc_documents || {
        pan_card: '',
        gst_cert: '',
        aadhaar_card: '',
        cancelled_cheque: ''
      }
    });
    setIsDrawerOpen(true);
  };

  const handleFileUpload = (docKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          kyc_documents: {
            ...prev.kyc_documents,
            [docKey]: reader.result as string
          }
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveParty = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // An empty certificate field means "no certificate held", i.e. null,
      // not 0% (which would be a nil-deduction certificate).
      const body = {
        ...formData,
        lower_deduction_pct: formData.lower_deduction_pct === '' ? null : Number(formData.lower_deduction_pct),
      };
      if (editingPartyId) {
        await partiesApi.update(editingPartyId, body);
      } else {
        await partiesApi.create(body);
      }
      setIsDrawerOpen(false);
      fetchParties();
    } catch (err: any) {
      console.error('Save Party Error:', err);
      setError(err.response?.data?.detail || 'Failed to save party');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Party Master & KYC Directory</h1>
          <p className="text-textSecondary mt-1">Manage B2B partners, unregistered consumers, and verified KYC document vaults.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleNewParty(true)}
            className="flex items-center gap-2 px-4 py-2 border border-border bg-surface text-white font-medium rounded-lg hover:bg-white/5 transition-colors text-sm"
          >
            <UserCheck className="w-4 h-4 text-emerald-400" />
            + Unregistered Consumer
          </button>
          <button 
            onClick={() => handleNewParty(false)}
            className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(212,168,67,0.3)] text-sm"
          >
            <Plus className="w-4 h-4" />
            New Registered Party
          </button>
        </div>
      </div>

      <div className="glass-card">
        <div className="p-4">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="animate-pulse space-y-4 py-4">
                <div className="h-8 bg-white/10 rounded w-full"></div>
                <div className="h-8 bg-white/10 rounded w-full"></div>
                <div className="h-8 bg-white/10 rounded w-full"></div>
              </div>
            ) : parties.length === 0 ? (
              <div className="text-center py-12 text-textSecondary flex flex-col items-center gap-3">
                <AlertCircle className="w-12 h-12 text-white/20" />
                <p>No parties found. Create your first party or consumer above.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-textSecondary border-b border-border">
                  <tr>
                    <th className="pb-3 font-medium">Code</th>
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">GSTIN / Reg</th>
                    <th className="pb-3 font-medium">Registered Address</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">State</th>
                    <th className="pb-3 font-medium text-right">Outstanding</th>
                    <th className="pb-3 font-medium">KYC Status</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parties.map((party) => (
                    <tr key={party.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-4 text-textSecondary font-mono">{party.code}</td>
                      <td className="py-4 font-medium text-white">
                        <div>{party.name}</div>
                        {party.trade_name && party.trade_name !== party.name && (
                          <div className="text-xs text-textSecondary">{party.trade_name}</div>
                        )}
                      </td>
                      <td className="py-4 font-mono text-xs">
                        {party.gstin && party.gstin !== 'Unregistered' ? (
                          <span className="text-primary font-bold">{party.gstin}</span>
                        ) : (
                          <span className="text-textSecondary italic">Unregistered (URP)</span>
                        )}
                      </td>
                      <td className="py-4 text-textSecondary text-xs max-w-[220px] truncate" title={`${party.address_line1 || party.address || ''}, ${party.city || ''} ${party.pincode || ''}`}>
                        {party.address_line1 || party.address ? `${party.address_line1 || party.address}, ${party.city || ''}` : '—'}
                      </td>
                      <td className="py-4 text-textSecondary">{party.type || party.party_type}</td>
                      <td className="py-4 text-textSecondary">{party.state_name || party.state}</td>
                      <td className={`py-4 text-right font-medium ${party.outstanding > 0 ? 'text-success' : party.outstanding < 0 ? 'text-danger' : 'text-textSecondary'}`}>
                        {party.outstanding ? formatCurrency(Math.abs(party.outstanding)) : '—'} {party.outstanding > 0 ? 'Dr' : party.outstanding < 0 ? 'Cr' : ''}
                      </td>
                      <td className="py-4">
                        <Badge variant={party.kyc === 'Complete' ? 'success' : party.kyc === 'Partial' ? 'warning' : 'danger'}>
                          {party.kyc === 'Complete' ? 'KYC Verified' : party.kyc === 'Partial' ? 'Partial KYC' : 'Unregistered'}
                        </Badge>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setViewKycParty(party)} 
                            className="p-1.5 bg-primary/20 text-primary hover:bg-primary/30 rounded text-xs font-medium flex items-center gap-1"
                            title="View KYC Document Vault"
                          >
                            <Eye className="w-3.5 h-3.5" /> View KYC
                          </button>
                          <button 
                            onClick={() => handleEditParty(party)} 
                            className="p-1 text-textSecondary hover:text-white text-xs font-medium"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* KYC Document Vault Viewer Modal */}
      {viewKycParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl bg-surface border border-border rounded-xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-playfair font-bold text-white">{viewKycParty.name}</h3>
                  <Badge variant={viewKycParty.kyc === 'Complete' ? 'success' : viewKycParty.kyc === 'Partial' ? 'warning' : 'danger'}>
                    {viewKycParty.kyc === 'Complete' ? 'KYC Verified' : viewKycParty.kyc === 'Partial' ? 'Partial KYC' : 'Unregistered'}
                  </Badge>
                </div>
                {viewKycParty.trade_name && viewKycParty.trade_name !== viewKycParty.name && (
                  <p className="text-xs text-textSecondary font-medium">Trade Name: {viewKycParty.trade_name}</p>
                )}
                <p className="text-xs text-textSecondary mt-1">
                  Code: <span className="font-mono text-white">{viewKycParty.code}</span> | 
                  GSTIN: <span className="font-mono text-primary font-bold">{viewKycParty.gstin || 'Unregistered'}</span> | 
                  State: <span className="text-white">{viewKycParty.state_name || viewKycParty.state}</span>
                </p>
              </div>
              <button onClick={() => setViewKycParty(null)} className="text-textSecondary hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* PAN Card Card */}
              <div className="p-4 bg-background border border-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white text-sm flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-primary" /> PAN Card
                  </span>
                  <span className="text-xs font-mono text-textSecondary">{viewKycParty.pan || 'Not provided'}</span>
                </div>
                {viewKycParty.kyc_documents?.pan_card ? (
                  <div className="space-y-2">
                    <img src={viewKycParty.kyc_documents.pan_card} alt="PAN Card" className="w-full h-40 object-cover rounded border border-border" />
                    <a 
                      href={viewKycParty.kyc_documents.pan_card} 
                      download={`${viewKycParty.code}_PAN.png`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                    >
                      <Download className="w-3.5 h-3.5" /> Download / Full Size
                    </a>
                  </div>
                ) : (
                  <div className="h-32 bg-white/5 border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-textSecondary text-xs">
                    <span>No PAN document image uploaded</span>
                  </div>
                )}
              </div>

              {/* GST Certificate Card */}
              <div className="p-4 bg-background border border-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white text-sm flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-primary" /> GST Certificate
                  </span>
                  <span className="text-xs font-mono text-primary font-bold">{viewKycParty.gstin || 'Unregistered'}</span>
                </div>
                {viewKycParty.kyc_documents?.gst_cert ? (
                  <div className="space-y-2">
                    <img src={viewKycParty.kyc_documents.gst_cert} alt="GST Certificate" className="w-full h-40 object-cover rounded border border-border" />
                    <a 
                      href={viewKycParty.kyc_documents.gst_cert} 
                      download={`${viewKycParty.code}_GST_Certificate.png`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                    >
                      <Download className="w-3.5 h-3.5" /> Download / Full Size
                    </a>
                  </div>
                ) : (
                  <div className="h-32 bg-white/5 border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-textSecondary text-xs">
                    <span>No GST certificate document uploaded</span>
                  </div>
                )}
              </div>

              {/* Aadhaar Card Card */}
              <div className="p-4 bg-background border border-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white text-sm flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-primary" /> Aadhaar Card
                  </span>
                  <span className="text-xs font-mono text-textSecondary">{viewKycParty.aadhaar_no || 'Not provided'}</span>
                </div>
                {viewKycParty.kyc_documents?.aadhaar_card ? (
                  <div className="space-y-2">
                    <img src={viewKycParty.kyc_documents.aadhaar_card} alt="Aadhaar Card" className="w-full h-40 object-cover rounded border border-border" />
                    <a 
                      href={viewKycParty.kyc_documents.aadhaar_card} 
                      download={`${viewKycParty.code}_Aadhaar.png`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                    >
                      <Download className="w-3.5 h-3.5" /> Download / Full Size
                    </a>
                  </div>
                ) : (
                  <div className="h-32 bg-white/5 border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-textSecondary text-xs">
                    <span>No Aadhaar card document uploaded</span>
                  </div>
                )}
              </div>

              {/* Cancelled Cheque Card */}
              <div className="p-4 bg-background border border-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white text-sm flex items-center gap-1.5">
                    <Upload className="w-4 h-4 text-primary" /> Bank Proof / Cheque
                  </span>
                  <span className="text-xs text-textSecondary font-medium">Bank Verification</span>
                </div>
                {viewKycParty.kyc_documents?.cancelled_cheque ? (
                  <div className="space-y-2">
                    <img src={viewKycParty.kyc_documents.cancelled_cheque} alt="Bank Proof" className="w-full h-40 object-cover rounded border border-border" />
                    <a 
                      href={viewKycParty.kyc_documents.cancelled_cheque} 
                      download={`${viewKycParty.code}_Bank_Proof.png`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                    >
                      <Download className="w-3.5 h-3.5" /> Download / Full Size
                    </a>
                  </div>
                ) : (
                  <div className="h-32 bg-white/5 border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-textSecondary text-xs">
                    <span>No bank cheque / proof document uploaded</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-border gap-3">
              <button 
                onClick={() => {
                  const partyToEdit = viewKycParty;
                  setViewKycParty(null);
                  handleEditParty(partyToEdit);
                }}
                className="px-4 py-2 bg-gold-gradient text-background font-semibold rounded-md hover:opacity-90 text-sm"
              >
                Edit & Upload Documents
              </button>
              <button 
                onClick={() => setViewKycParty(null)}
                className="px-4 py-2 border border-border rounded-md text-textSecondary hover:text-white text-sm"
              >
                Close Vault
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Party Master & KYC Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
          <div className="w-[560px] h-full bg-surface border-l border-border p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-xl font-playfair font-bold text-white">
                  {editingPartyId ? 'Edit Party Master & KYC' : 'Create Party Master (KYC Vault)'}
                </h2>
                <p className="text-xs text-textSecondary mt-0.5">Two-way business account & statutory KYC documents</p>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="text-textSecondary hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-danger/10 border border-danger/20 rounded-md text-danger text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSaveParty} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-textSecondary mb-1">Party Account Type *</label>
                  <select 
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white font-medium"
                    value={formData.party_type}
                    onChange={(e) => setFormData({ ...formData, party_type: e.target.value })}
                  >
                    <option value="Both">Both (Customer & Supplier)</option>
                    <option value="Customer">Customer (Sundry Debtor)</option>
                    <option value="Supplier">Supplier (Sundry Creditor)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-textSecondary mb-1">GST Registration Type *</label>
                  <select 
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white font-medium"
                    value={formData.gst_reg_type}
                    onChange={(e) => setFormData({ ...formData, gst_reg_type: e.target.value, gstin: e.target.value === 'Unregistered' ? 'Unregistered' : formData.gstin })}
                  >
                    <option value="Regular">Regular Taxpayer</option>
                    <option value="Composition">Composition Scheme</option>
                    <option value="Unregistered">Unregistered (URP / Consumer)</option>
                    <option value="SEZ">SEZ Developer / Unit</option>
                    <option value="Export">Export / Overseas Client</option>
                  </select>
                </div>
              </div>

              {formData.gst_reg_type !== 'Unregistered' && (
                <div>
                  <label className="block text-sm text-textSecondary mb-1">GSTIN Verification</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="e.g. 08BBUPS8859R1ZW"
                      className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-white uppercase font-mono"
                      value={formData.gstin}
                      onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                    />
                    <button 
                      type="button" 
                      onClick={handleFetchGstin}
                      disabled={fetchingGstin}
                      className="px-3.5 py-2 bg-primary/20 text-primary border border-primary/30 rounded-md hover:bg-primary/30 font-medium text-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {fetchingGstin ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      Verify GSTIN
                    </button>
                  </div>
                  {gstinNotice && (
                    <p
                      className={`mt-2 text-xs ${
                        gstinNotice.tone === 'ok' ? 'text-success' : 'text-warning'
                      }`}
                    >
                      {gstinNotice.text}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-textSecondary mb-1">Legal Name *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Legal Entity Name / Full Name"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-textSecondary mb-1">Trade Name / Alias</label>
                  <input 
                    type="text" 
                    placeholder="Trade / Brand Name"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white"
                    value={formData.trade_name}
                    onChange={(e) => setFormData({ ...formData, trade_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-textSecondary mb-1">PAN Number</label>
                  <input 
                    type="text" 
                    placeholder="ABCDE1234F"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white uppercase font-mono"
                    value={formData.pan}
                    onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-textSecondary mb-1">Aadhaar Card Number</label>
                  <input 
                    type="text" 
                    placeholder="12-digit Aadhaar Number"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white font-mono"
                    value={formData.aadhaar_no}
                    onChange={(e) => setFormData({ ...formData, aadhaar_no: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-textSecondary mb-1">Registered Address Line 1</label>
                <input 
                  type="text" 
                  placeholder="Street / Premises / Building / Market"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-white"
                  value={formData.address_line1}
                  onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-textSecondary mb-1">City</label>
                  <input 
                    type="text" 
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-textSecondary mb-1">State Code</label>
                  <input 
                    type="text" 
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white font-mono"
                    value={formData.state_code}
                    onChange={(e) => setFormData({ ...formData, state_code: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-textSecondary mb-1">Pincode</label>
                  <input 
                    type="text" 
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white font-mono"
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-textSecondary mb-1">Mobile / Phone</label>
                  <input 
                    type="text" 
                    placeholder="9876543210"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white font-mono"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-textSecondary mb-1">Email</label>
                  <input 
                    type="email" 
                    placeholder="party@domain.com"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              {/* KYC Document Vault Section */}
              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    KYC Document Vault Attachments
                  </h3>
                  <span className="text-[11px] text-textSecondary">Upload PAN, Aadhaar, & GST proofs</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* PAN Card */}
                  <div className="p-3 bg-background border border-border rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs text-textSecondary">
                      <span className="font-medium text-white flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-primary" /> PAN Card Image
                      </span>
                      {formData.kyc_documents.pan_card && (
                        <span className="text-emerald-400 flex items-center gap-0.5 text-[10px]">
                          <CheckCircle2 className="w-3 h-3" /> Attached
                        </span>
                      )}
                    </div>
                    <input 
                      type="file" 
                      accept="image/*,.pdf"
                      onChange={(e) => handleFileUpload('pan_card', e)}
                      className="text-xs text-textSecondary file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-white/10 file:text-white hover:file:bg-white/20"
                    />
                    {formData.kyc_documents.pan_card && (
                      <img src={formData.kyc_documents.pan_card} alt="PAN Card" className="h-16 w-full object-cover rounded border border-border" />
                    )}
                  </div>

                  {/* GST Certificate */}
                  <div className="p-3 bg-background border border-border rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs text-textSecondary">
                      <span className="font-medium text-white flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-primary" /> GST Certificate
                      </span>
                      {formData.kyc_documents.gst_cert && (
                        <span className="text-emerald-400 flex items-center gap-0.5 text-[10px]">
                          <CheckCircle2 className="w-3 h-3" /> Attached
                        </span>
                      )}
                    </div>
                    <input 
                      type="file" 
                      accept="image/*,.pdf"
                      onChange={(e) => handleFileUpload('gst_cert', e)}
                      className="text-xs text-textSecondary file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-white/10 file:text-white hover:file:bg-white/20"
                    />
                    {formData.kyc_documents.gst_cert && (
                      <img src={formData.kyc_documents.gst_cert} alt="GST Certificate" className="h-16 w-full object-cover rounded border border-border" />
                    )}
                  </div>

                  {/* Aadhaar Card */}
                  <div className="p-3 bg-background border border-border rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs text-textSecondary">
                      <span className="font-medium text-white flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-primary" /> Aadhaar Card
                      </span>
                      {formData.kyc_documents.aadhaar_card && (
                        <span className="text-emerald-400 flex items-center gap-0.5 text-[10px]">
                          <CheckCircle2 className="w-3 h-3" /> Attached
                        </span>
                      )}
                    </div>
                    <input 
                      type="file" 
                      accept="image/*,.pdf"
                      onChange={(e) => handleFileUpload('aadhaar_card', e)}
                      className="text-xs text-textSecondary file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-white/10 file:text-white hover:file:bg-white/20"
                    />
                    {formData.kyc_documents.aadhaar_card && (
                      <img src={formData.kyc_documents.aadhaar_card} alt="Aadhaar Card" className="h-16 w-full object-cover rounded border border-border" />
                    )}
                  </div>

                  {/* Cancelled Cheque / Bank Proof */}
                  <div className="p-3 bg-background border border-border rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs text-textSecondary">
                      <span className="font-medium text-white flex items-center gap-1">
                        <Upload className="w-3.5 h-3.5 text-primary" /> Bank Proof / Cheque
                      </span>
                      {formData.kyc_documents.cancelled_cheque && (
                        <span className="text-emerald-400 flex items-center gap-0.5 text-[10px]">
                          <CheckCircle2 className="w-3 h-3" /> Attached
                        </span>
                      )}
                    </div>
                    <input 
                      type="file" 
                      accept="image/*,.pdf"
                      onChange={(e) => handleFileUpload('cancelled_cheque', e)}
                      className="text-xs text-textSecondary file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-white/10 file:text-white hover:file:bg-white/20"
                    />
                    {formData.kyc_documents.cancelled_cheque && (
                      <img src={formData.kyc_documents.cancelled_cheque} alt="Bank Proof" className="h-16 w-full object-cover rounded border border-border" />
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                <div>
                  <label className="block text-sm text-textSecondary mb-1">Credit Limit (₹)</label>
                  <input 
                    type="number" 
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white font-mono"
                    value={formData.credit_limit}
                    onChange={(e) => setFormData({ ...formData, credit_limit: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-textSecondary mb-1">Credit Days</label>
                  <input
                    type="number"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-white font-mono"
                    value={formData.credit_days}
                    onChange={(e) => setFormData({ ...formData, credit_days: Number(e.target.value) })}
                  />
                </div>
              </div>

              {/* TDS / TCS on trade [s.194Q, s.206C(1H)] */}
              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-white">Tax withheld on trade</p>
                  <p className="text-xs text-textSecondary">
                    Applies only once our turnover crossed Rs 10 crore and the setting is on; then on the value above Rs 50 lakh per party per year.
                    No PAN on record means the higher rate (s.206AA / s.206CC).
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-primary"
                      checked={formData.tds_applicable}
                      onChange={(e) => setFormData({ ...formData, tds_applicable: e.target.checked })}
                    />
                    <span>
                      <span className="block text-sm text-white">Deduct TDS u/s 194Q on purchases</span>
                      <span className="block text-xs text-textSecondary">We buy from this party; 0.1% above the threshold is withheld from what we pay them.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-primary"
                      checked={formData.tcs_applicable}
                      onChange={(e) => setFormData({ ...formData, tcs_applicable: e.target.checked })}
                    />
                    <span>
                      <span className="block text-sm text-white">Collect TCS u/s 206C(1H) on sales</span>
                      <span className="block text-xs text-textSecondary">We sell to this party; 0.1% above the threshold is added to their invoice.</span>
                    </span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-textSecondary mb-1">Lower-deduction certificate (s.197) %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      placeholder="None held"
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-white font-mono"
                      value={formData.lower_deduction_pct}
                      onChange={(e) => setFormData({ ...formData, lower_deduction_pct: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                    <p className="text-[11px] text-textSecondary mt-1">Leave blank when no certificate is held. 0 = nil-deduction certificate.</p>
                  </div>
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background cursor-pointer self-end">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-primary"
                      checked={formData.tds_pan_verified}
                      onChange={(e) => setFormData({ ...formData, tds_pan_verified: e.target.checked })}
                    />
                    <span>
                      <span className="block text-sm text-white">PAN verified</span>
                      <span className="block text-xs text-textSecondary">Checked against the department's PAN database.</span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-border">
                <button 
                  type="button" 
                  onClick={() => setIsDrawerOpen(false)}
                  className="px-4 py-2 border border-border rounded-md text-white hover:bg-white/5"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Saving...' : editingPartyId ? 'Update Party' : 'Save Party & KYC'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
