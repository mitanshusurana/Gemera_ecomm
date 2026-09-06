'use client';

import { FileJson, FileSpreadsheet, Download, ShieldCheck, Calendar, Loader2 } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { useState, useEffect } from 'react';
import api, { gstExportApi } from '@/lib/api';
import { previousPeriod } from '@/lib/fiscal';

export default function GstExportsPage() {
  const [period, setPeriod] = useState(previousPeriod());
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/gst/tax-register?period=${period}`);
      const list = Array.isArray(data) ? data : data?.records || [];
      setSummary(list);
    } catch (err) {
      console.error('Error fetching GST tax register for export summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [period]);

  const handleDownload = async (type: string, ext: string) => {
    setDownloading(type);
    try {
      let res;
      if (type === 'gstr1') res = await gstExportApi.gstr1Json(period);
      else if (type === 'gstr3b') res = await gstExportApi.gstr3bJson(period);
      else if (type === 'gstr1_excel') res = await gstExportApi.gstr1Excel(period);
      else res = await api.get('/gst/export/hsn-summary', { params: { period }, responseType: 'blob' });
      
      const blob = res.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GST_${type.toUpperCase()}_${period}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Export download failed:', err);
      alert(err.response?.data?.detail || `Failed to export ${type.toUpperCase()} file for period ${period}`);
    } finally {
      setDownloading(null);
    }
  };

  const totalTaxable = summary.reduce((acc, r) => acc + (Number(r.taxable_material_value || 0) + Number(r.taxable_making_value || 0)), 0);
  const totalCgst = summary.reduce((acc, r) => acc + Number(r.cgst_amount || 0), 0);
  const totalSgst = summary.reduce((acc, r) => acc + Number(r.sgst_amount || 0), 0);
  const totalIgst = summary.reduce((acc, r) => acc + Number(r.igst_amount || 0), 0);
  const totalTax = totalCgst + totalSgst + totalIgst;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-playfair font-bold text-white">GST Exports & Filing Center</h1>
            <Badge variant="success" className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              MCA Rule 11(g) Compliant
            </Badge>
          </div>
          <p className="text-textSecondary mt-1">Export official JSON returns and spreadsheets ready for direct GST Portal upload.</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <input 
            type="month" 
            value={period} 
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-primary font-medium"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6 flex flex-col h-full">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <FileJson className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">GSTR-1 Official JSON Export</h3>
              <p className="text-sm text-textSecondary">B2B invoices (Table 4A), B2CS retail, and HSN Table 12 schema — ready to upload on GST portal.</p>
            </div>
          </div>
          <div className="mt-auto flex flex-col sm:flex-row gap-3 pt-4">
            <button 
              onClick={() => handleDownload('gstr1', 'json')} 
              disabled={downloading === 'gstr1'}
              className="flex-1 flex justify-center items-center gap-2 px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm"
            >
              {downloading === 'gstr1' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download GSTR-1 JSON
            </button>
            <button 
              onClick={() => handleDownload('gstr1_excel', 'xlsx')} 
              disabled={downloading === 'gstr1_excel'}
              className="flex-1 flex justify-center items-center gap-2 px-4 py-2 border border-border text-white font-medium rounded-lg hover:bg-white/5 disabled:opacity-50 text-sm"
            >
              {downloading === 'gstr1_excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Download Excel
            </button>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col h-full">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <FileJson className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">GSTR-3B JSON Export</h3>
              <p className="text-sm text-textSecondary">Consolidated return summary with Section 16 eligible ITC, RCM, and computed cash liability.</p>
            </div>
          </div>
          <div className="mt-auto pt-4">
            <button 
              onClick={() => handleDownload('gstr3b', 'json')} 
              disabled={downloading === 'gstr3b'}
              className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-emerald-500 text-black font-semibold rounded-lg hover:bg-emerald-400 disabled:opacity-50 text-sm"
            >
              {downloading === 'gstr3b' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download GSTR-3B JSON
            </button>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col h-full">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">HSN Table 12 Summary</h3>
              <p className="text-sm text-textSecondary">HSN 7113 / SAC 9988 commodity & service supply breakdown for Table 12 compliance.</p>
            </div>
          </div>
          <div className="mt-auto pt-4">
            <button 
              onClick={() => handleDownload('hsn', 'xlsx')} 
              disabled={downloading === 'hsn'}
              className="w-full flex justify-center items-center gap-2 px-4 py-2 border border-border text-white font-medium rounded-lg hover:bg-white/5 disabled:opacity-50 text-sm"
            >
              {downloading === 'hsn' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download HSN Summary Excel
            </button>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col h-full opacity-75">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center text-textSecondary flex-shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-bold text-white">e-Way Bill Integration</h3>
                <Badge variant="warning" className="text-[10px]">Provisions Ready</Badge>
              </div>
              <p className="text-sm text-textSecondary">e-Way Bill is currently exempt for gold & precious jewelry (HSN 7113/7114) nationally under CGST Rule 138(14). System is ready for imitation jewelry (HSN 7117).</p>
            </div>
          </div>
          <div className="mt-auto pt-4">
            <button disabled className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-surface border border-border text-textSecondary font-medium rounded-lg cursor-not-allowed text-sm">
              NIC e-Way API Ready (Exempt for HSN 7113)
            </button>
          </div>
        </div>
      </div>

      <div className="glass-card mt-8">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h3 className="text-lg font-bold text-white">GST Summary for Return Filing ({period})</h3>
          <span className="text-xs text-textSecondary">{summary.length} registered invoices</span>
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-textSecondary border-b border-border">
              <tr>
                <th className="pb-3 font-medium">Description</th>
                <th className="pb-3 font-medium text-right">Taxable Value (₹)</th>
                <th className="pb-3 font-medium text-right">CGST (₹)</th>
                <th className="pb-3 font-medium text-right">SGST (₹)</th>
                <th className="pb-3 font-medium text-right">IGST (₹)</th>
                <th className="pb-3 font-medium text-right">Total Tax (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center text-textSecondary">Loading export preview...</td></tr>
              ) : summary.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-textSecondary">No outward tax invoices recorded for period {period}</td></tr>
              ) : (
                <>
                  <tr className="hover:bg-white/5">
                    <td className="py-3 font-medium text-white">Outward Taxable Supplies (HSN 7113 / SAC 9988)</td>
                    <td className="py-3 text-right text-white font-mono">{formatCurrency(totalTaxable)}</td>
                    <td className="py-3 text-right text-white font-mono">{formatCurrency(totalCgst)}</td>
                    <td className="py-3 text-right text-white font-mono">{formatCurrency(totalSgst)}</td>
                    <td className="py-3 text-right text-white font-mono">{formatCurrency(totalIgst)}</td>
                    <td className="py-3 text-right text-primary font-mono font-bold">{formatCurrency(totalTax)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
