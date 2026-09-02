"use client";

import { useState, useEffect } from 'react';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { Download, FileJson, FileSpreadsheet, Loader2, Calendar, ShieldCheck, AlertCircle, FileText } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function GSTPage() {
  const [activeTab, setActiveTab] = useState('Output Tax');
  const [selectedPeriod, setSelectedPeriod] = useState('2026-08');
  const [loading, setLoading] = useState(true);
  
  const [outputTaxData, setOutputTaxData] = useState<any>(null);
  const [itcData, setItcData] = useState<any>(null);
  const [rcmData, setRcmData] = useState<any>(null);
  const [gstr1Data, setGstr1Data] = useState<any>(null);
  const [gstr3bData, setGstr3bData] = useState<any>(null);

  const tabs = ['Output Tax', 'ITC Register', 'RCM Register', 'GSTR-1 Staging', 'GSTR-3B Summary'];

  const fetchGstData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'Output Tax') {
        const res = await apiClient.get(`/gst/tax-register?period=${selectedPeriod}`);
        setOutputTaxData(res.data);
      } else if (activeTab === 'ITC Register') {
        const res = await apiClient.get(`/gst/itc-register?period=${selectedPeriod}`);
        setItcData(res.data);
      } else if (activeTab === 'RCM Register') {
        const res = await apiClient.get(`/gst/rcm-register?period=${selectedPeriod}`);
        setRcmData(res.data);
      } else if (activeTab === 'GSTR-1 Staging') {
        const res = await apiClient.get(`/gst/gstr1-data?period=${selectedPeriod}`);
        setGstr1Data(res.data);
      } else if (activeTab === 'GSTR-3B Summary') {
        const res = await apiClient.get(`/gst/gstr3b-summary?period=${selectedPeriod}`);
        setGstr3bData(res.data);
      }
    } catch (err) {
      console.error('Error fetching GST compliance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGstData();
  }, [activeTab, selectedPeriod]);

  const handleExportJson = async (type: 'gstr1' | 'gstr3b') => {
    try {
      const url = `/gst/export/${type}-json?period=${selectedPeriod}`;
      const res = await apiClient.get(url);
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${type.toUpperCase()}_${selectedPeriod}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      alert('Failed to export GSTN JSON file');
    }
  };

  // Dynamic Metrics Summary
  const outputTotal = outputTaxData?.summary?.total_output_tax || 0;
  const itcTotal = itcData?.summary?.total_itc || 0;
  const rcmTotal = rcmData?.summary?.total_rcm || 0;
  const netPayable = Math.max(0, outputTotal - itcTotal);

  const outputColumns = [
    { header: 'Invoice No', accessorKey: 'invoice_no', cell: (item: any) => <span className="font-medium text-white">{item.invoice_no}</span> },
    { header: 'Date', accessorKey: 'invoice_date', cell: (item: any) => new Date(item.invoice_date).toLocaleDateString('en-IN') },
    { header: 'Customer', accessorKey: 'party_name', cell: (item: any) => item.party_name || 'B2C Retail Buyer' },
    { header: 'GSTIN', accessorKey: 'party_gstin', cell: (item: any) => item.party_gstin || 'Unregistered' },
    { header: 'Material Val', accessorKey: 'taxable_material_value', cell: (item: any) => formatCurrency(item.taxable_material_value || 0) },
    { header: 'Making Val', accessorKey: 'taxable_making_value', cell: (item: any) => formatCurrency(item.taxable_making_value || 0) },
    { header: 'CGST (₹)', accessorKey: 'cgst_amount', cell: (item: any) => formatCurrency(item.cgst_amount || 0) },
    { header: 'SGST (₹)', accessorKey: 'sgst_amount', cell: (item: any) => formatCurrency(item.sgst_amount || 0) },
    { header: 'IGST (₹)', accessorKey: 'igst_amount', cell: (item: any) => formatCurrency(item.igst_amount || 0) },
    { header: 'Total Tax', accessorKey: 'total_tax', cell: (item: any) => <span className="text-primary font-semibold">{formatCurrency(item.total_tax || 0)}</span> }
  ];

  const itcColumns = [
    { header: 'Vendor Invoice', accessorKey: 'vendor_invoice_no', cell: (item: any) => <span className="font-medium text-white">{item.vendor_invoice_no}</span> },
    { header: 'Date', accessorKey: 'invoice_date', cell: (item: any) => new Date(item.invoice_date).toLocaleDateString('en-IN') },
    { header: 'Vendor', accessorKey: 'vendor_name', cell: (item: any) => item.vendor_name },
    { header: 'Vendor GSTIN', accessorKey: 'vendor_gstin', cell: (item: any) => item.vendor_gstin },
    { header: 'CGST Credit', accessorKey: 'cgst_credit', cell: (item: any) => formatCurrency(item.cgst_credit || 0) },
    { header: 'SGST Credit', accessorKey: 'sgst_credit', cell: (item: any) => formatCurrency(item.sgst_credit || 0) },
    { header: 'IGST Credit', accessorKey: 'igst_credit', cell: (item: any) => formatCurrency(item.igst_credit || 0) },
    { header: 'Total ITC', accessorKey: 'total_itc', cell: (item: any) => <span className="text-success font-semibold">{formatCurrency(item.total_itc || 0)}</span> },
    { header: 'GSTR-2B Status', accessorKey: 'gstr2b_matched', cell: (item: any) => (
      <Badge variant={item.gstr2b_matched ? 'success' : 'warning'}>
        {item.gstr2b_matched ? 'Matched' : 'Pending'}
      </Badge>
    )}
  ];

  const rcmColumns = [
    { header: 'Date', accessorKey: 'transaction_date', cell: (item: any) => new Date(item.transaction_date).toLocaleDateString('en-IN') },
    { header: 'Vendor / Individual', accessorKey: 'vendor_name', cell: (item: any) => item.vendor_name },
    { header: 'PAN', accessorKey: 'vendor_pan', cell: (item: any) => item.vendor_pan || '—' },
    { header: 'Old Gold Purchase (₹)', accessorKey: 'purchase_value', cell: (item: any) => formatCurrency(item.purchase_value || 0) },
    { header: 'CGST RCM 1.5%', accessorKey: 'cgst_rcm', cell: (item: any) => formatCurrency(item.cgst_rcm || 0) },
    { header: 'SGST RCM 1.5%', accessorKey: 'sgst_rcm', cell: (item: any) => formatCurrency(item.sgst_rcm || 0) },
    { header: 'Total RCM (₹)', accessorKey: 'total_rcm', cell: (item: any) => <span className="text-amber-400 font-semibold">{formatCurrency(item.total_rcm || 0)}</span> },
    { header: 'ITC Availed', accessorKey: 'itc_availed', cell: (item: any) => (
      <Badge variant={item.itc_availed ? 'success' : 'default'}>{item.itc_availed ? 'Availed' : 'Pending'}</Badge>
    )}
  ];

  const gstr1B2B = gstr1Data?.b2b_invoices || [];
  const gstr1Hsn = gstr1Data?.hsn_summary || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">GST Statutory Compliance [CGST-R56-4]</h1>
          <p className="text-textSecondary mt-1">Real-time Dual-Rate Tax Registers, GSTR-1 Staging & GSTR-3B Returns.</p>
        </div>
        <div className="flex gap-3 items-center">
          <input 
            type="month" 
            value={selectedPeriod} 
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-primary"
          />
          <button 
            onClick={() => handleExportJson('gstr1')}
            className="flex items-center gap-2 px-3.5 py-2 bg-surface border border-border text-white text-xs font-semibold rounded-lg hover:border-primary transition-colors"
          >
            <FileJson className="w-4 h-4 text-primary" /> Export GSTR-1 JSON
          </button>
          <button 
            onClick={() => handleExportJson('gstr3b')}
            className="flex items-center gap-2 px-3.5 py-2 bg-surface border border-border text-white text-xs font-semibold rounded-lg hover:border-primary transition-colors"
          >
            <FileJson className="w-4 h-4 text-success" /> Export GSTR-3B JSON
          </button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-card p-6">
          <h3 className="text-xs font-medium text-textSecondary uppercase tracking-wider">Total Output Tax Liability</h3>
          <p className="text-2xl font-playfair font-bold text-white mt-2">{formatCurrency(outputTotal)}</p>
        </div>
        <div className="glass-card p-6">
          <h3 className="text-xs font-medium text-textSecondary uppercase tracking-wider">Eligible Input Tax Credit (ITC)</h3>
          <p className="text-2xl font-playfair font-bold text-success mt-2">{formatCurrency(itcTotal)}</p>
        </div>
        <div className="glass-card p-6">
          <h3 className="text-xs font-medium text-textSecondary uppercase tracking-wider">RCM Liability (Old Gold)</h3>
          <p className="text-2xl font-playfair font-bold text-amber-400 mt-2">{formatCurrency(rcmTotal)}</p>
        </div>
        <div className="glass-card p-6 border-l-4 border-l-danger">
          <h3 className="text-xs font-medium text-textSecondary uppercase tracking-wider">Net Cash Tax Payable</h3>
          <p className="text-2xl font-playfair font-bold text-danger mt-2">{formatCurrency(netPayable)}</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="glass-card p-6 space-y-6">
        <div className="flex space-x-2 border-b border-border pb-4 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                activeTab === tab 
                  ? 'bg-primary/20 text-primary border border-primary/30' 
                  : 'text-textSecondary hover:bg-surface hover:text-white border border-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        
        {/* Tab Content */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-textSecondary">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <span>Fetching statutory GST records for {selectedPeriod}...</span>
          </div>
        ) : activeTab === 'Output Tax' ? (
          <div className="space-y-4">
            <div className="p-3 bg-surface border border-border rounded-lg text-xs text-textSecondary flex justify-between">
              <span>HSN 7113 (Jewelry Material) @ 3% Dual-Rate | SAC 9988 (Making Charges) @ 5% GST</span>
              <span className="text-white font-medium">Total Invoices: {outputTaxData?.records?.length || 0}</span>
            </div>
            <DataTable columns={outputColumns} data={outputTaxData?.records || []} />
          </div>
        ) : activeTab === 'ITC Register' ? (
          <div className="space-y-4">
            <div className="p-3 bg-surface border border-border rounded-lg text-xs text-textSecondary flex justify-between">
              <span>Section 16 Eligible ITC on Raw Gold, Gems, & Artisan Invoices</span>
              <span className="text-emerald-400 font-medium">Total ITC Claimable: {formatCurrency(itcTotal)}</span>
            </div>
            <DataTable columns={itcColumns} data={itcData?.records || []} />
          </div>
        ) : activeTab === 'RCM Register' ? (
          <div className="space-y-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-400 flex justify-between">
              <span>[Notification 13/2017-CT(Rate)] Reverse Charge on Purchase of Old Gold from Unregistered Individuals</span>
              <span className="font-bold">Total RCM Liability: {formatCurrency(rcmTotal)}</span>
            </div>
            <DataTable columns={rcmColumns} data={rcmData?.records || []} />
          </div>
        ) : activeTab === 'GSTR-1 Staging' ? (
          <div className="space-y-6">
            <div className="p-4 bg-surface border border-border rounded-xl flex items-center justify-between">
              <div>
                <h4 className="text-base font-playfair font-bold text-white">GSTR-1 Monthly Return Staging Tables</h4>
                <p className="text-xs text-textSecondary">Outward Supplies Schema conforming to GSTN Table 4A (B2B) and Table 12 (HSN).</p>
              </div>
              <button 
                onClick={() => handleExportJson('gstr1')}
                className="px-4 py-2 bg-primary text-black font-semibold rounded-lg text-xs hover:bg-primary/90 flex items-center gap-1.5"
              >
                <FileJson className="w-4 h-4" /> Download GSTN JSON
              </button>
            </div>

            <div className="space-y-3">
              <h5 className="text-sm font-semibold text-white">Table 4A — Taxable Outward B2B Supplies</h5>
              {gstr1B2B.length === 0 ? (
                <div className="p-6 bg-surface/50 border border-border rounded-xl text-center text-xs text-textSecondary">
                  No B2B invoices in selected period (all B2C retail).
                </div>
              ) : (
                <DataTable columns={outputColumns} data={gstr1B2B} />
              )}
            </div>

            <div className="space-y-3">
              <h5 className="text-sm font-semibold text-white">Table 12 — HSN-wise Summary of Outward Supplies</h5>
              <div className="bg-surface border border-border rounded-xl p-4">
                <table className="w-full text-left text-xs">
                  <thead className="text-textSecondary border-b border-border">
                    <tr>
                      <th className="pb-2">HSN / SAC</th>
                      <th className="pb-2">Description</th>
                      <th className="pb-2">UQC</th>
                      <th className="pb-2 text-right">Total Qty / Wt</th>
                      <th className="pb-2 text-right">Taxable Value (₹)</th>
                      <th className="pb-2 text-right">Integrated Tax (₹)</th>
                      <th className="pb-2 text-right">Central Tax (₹)</th>
                      <th className="pb-2 text-right">State Tax (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {gstr1Hsn.length === 0 ? (
                      <tr><td colSpan={8} className="py-6 text-center text-textSecondary">No HSN summary available</td></tr>
                    ) : gstr1Hsn.map((h: any, i: number) => (
                      <tr key={i} className="hover:bg-white/5">
                        <td className="py-2.5 font-mono text-primary">{h.hsn_code || '71131910'}</td>
                        <td className="py-2.5 text-white">{h.description || 'Precious Metal Jewellery'}</td>
                        <td className="py-2.5 text-textSecondary">{h.uom || 'GMS'}</td>
                        <td className="py-2.5 text-right font-mono">{h.total_qty || '—'}</td>
                        <td className="py-2.5 text-right font-mono text-white">{formatCurrency(h.taxable_value || 0)}</td>
                        <td className="py-2.5 text-right font-mono">{formatCurrency(h.igst || 0)}</td>
                        <td className="py-2.5 text-right font-mono">{formatCurrency(h.cgst || 0)}</td>
                        <td className="py-2.5 text-right font-mono">{formatCurrency(h.sgst || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-surface border border-border rounded-xl flex items-center justify-between">
              <div>
                <h4 className="text-base font-playfair font-bold text-white">GSTR-3B Monthly Consolidated Summary</h4>
                <p className="text-xs text-textSecondary">Summary of Outward Supplies, Input Tax Credit (ITC), and Tax Payment Computation.</p>
              </div>
              <button 
                onClick={() => handleExportJson('gstr3b')}
                className="px-4 py-2 bg-success text-black font-semibold rounded-lg text-xs hover:bg-success/90 flex items-center gap-1.5"
              >
                <FileJson className="w-4 h-4" /> Download GSTR-3B JSON
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Table 3.1 Outward */}
              <div className="p-4 bg-surface border border-border rounded-xl space-y-3">
                <h5 className="text-sm font-semibold text-white border-b border-border pb-2">
                  3.1 Details of Outward Supplies & Inward Supplies Liable to Reverse Charge
                </h5>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-textSecondary">(a) Outward Taxable Supplies (Jewelry):</span>
                    <span className="font-mono font-bold text-white">{formatCurrency(outputTaxData?.summary?.total_taxable || 0)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-textSecondary">Total Output Tax (CGST + SGST + IGST):</span>
                    <span className="font-mono text-primary font-bold">{formatCurrency(outputTotal)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-textSecondary">(d) Inward Supplies Liable to Reverse Charge (Old Gold):</span>
                    <span className="font-mono font-bold text-amber-400">{formatCurrency(rcmTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Table 4 Eligible ITC */}
              <div className="p-4 bg-surface border border-border rounded-xl space-y-3">
                <h5 className="text-sm font-semibold text-white border-b border-border pb-2">
                  4. Eligible Input Tax Credit (ITC)
                </h5>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-textSecondary">(A) ITC Available (All Other Inward Purchases):</span>
                    <span className="font-mono font-bold text-emerald-400">{formatCurrency(itcTotal)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-textSecondary">(B) Net ITC Available (A - Reversals):</span>
                    <span className="font-mono font-bold text-emerald-400">{formatCurrency(itcTotal)}</span>
                  </div>
                  <div className="flex justify-between py-1 pt-2 border-t border-border font-bold">
                    <span className="text-rose-400">Net Tax Payable in Cash:</span>
                    <span className="font-mono text-rose-400 text-sm">{formatCurrency(netPayable)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
