'use client';

import { useState, useEffect } from 'react';
import StatsCard from '@/components/ui/StatsCard';
import { IndianRupee, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ledgerApi } from '@/lib/api';

export default function OutstandingPage() {
  const [activeTab, setActiveTab] = useState('Receivables');
  const [isAgeWise, setIsAgeWise] = useState(false);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let res;
        if (isAgeWise) {
          res = await ledgerApi.getAgeWise({
            party_type: activeTab === 'Receivables' ? 'Customer' : 'Supplier',
            as_of_date: asOfDate
          });
        } else if (activeTab === 'Receivables') {
          res = await ledgerApi.getReceivables({ as_of_date: asOfDate });
        } else {
          res = await ledgerApi.getPayables({ as_of_date: asOfDate });
        }
        
        const list = Array.isArray(res.data) ? res.data : res.data?.data || res.data?.receivables || res.data?.payables || [];
        setData(list);
      } catch (err) {
        console.error('Outstanding fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTab, isAgeWise, asOfDate]);

  const totalOutstanding = data.reduce((acc, row) => acc + (Number(row.total_outstanding || row.total) || 0), 0);
  const totalD0_30 = data.reduce((acc, row) => acc + (Number(row.d0_30) || 0), 0);
  const totalD31_60 = data.reduce((acc, row) => acc + (Number(row.d31_60) || 0), 0);
  const totalD61_90 = data.reduce((acc, row) => acc + (Number(row.d61_90) || 0), 0);
  const totalD90_plus = data.reduce((acc, row) => acc + (Number(row.d90_plus) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Outstanding Analysis</h1>
          <p className="text-textSecondary mt-1">Track receivables and payables.</p>
        </div>
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm text-textSecondary mb-1">As of Date</label>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" />
          </div>
          <button 
            onClick={() => setIsAgeWise(!isAgeWise)}
            className={`px-4 py-2 border rounded-md font-medium text-sm transition-colors ${isAgeWise ? 'bg-primary/20 text-primary border-primary' : 'border-border text-white hover:bg-white/5'}`}
          >
            Age-wise View
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatsCard title="Total Receivable" value={formatCurrency(activeTab === 'Receivables' ? totalOutstanding : 0)} icon={<IndianRupee className="w-6 h-6" />} />
        <StatsCard title="Overdue (>30d)" value={formatCurrency(totalD31_60 + totalD61_90 + totalD90_plus)} icon={<AlertCircle className="w-6 h-6" />} className="border-warning/50" />
        <StatsCard title="Total Payable" value={formatCurrency(activeTab === 'Payables' ? totalOutstanding : 0)} icon={<IndianRupee className="w-6 h-6" />} />
        <StatsCard title="Overdue (>90d)" value={formatCurrency(totalD90_plus)} icon={<AlertCircle className="w-6 h-6" />} className="border-danger/50" />
      </div>

      <div className="glass-card">
        <div className="flex items-center gap-6 p-4 border-b border-border">
          {['Receivables', 'Payables'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 border-b-2 font-medium text-sm transition-colors -mb-[17px] ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-textSecondary hover:text-white'
              }`}
            >
              {tab} (Sundry {tab === 'Receivables' ? 'Debtors' : 'Creditors'})
            </button>
          ))}
        </div>

        <div className="p-4 overflow-x-auto">
          {loading ? (
             <div className="animate-pulse space-y-4 py-4">
                <div className="h-8 bg-white/10 rounded w-full"></div>
                <div className="h-8 bg-white/10 rounded w-full"></div>
             </div>
          ) : data.length === 0 ? (
             <div className="text-center py-12 text-textSecondary flex flex-col items-center gap-3">
               <AlertCircle className="w-12 h-12 text-white/20" />
               <p>No outstanding records found.</p>
             </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-textSecondary border-b border-border">
                <tr>
                  <th className="pb-3 font-medium">Party Name</th>
                  {isAgeWise ? (
                    <>
                      <th className="pb-3 font-medium text-right">0-30 days</th>
                      <th className="pb-3 font-medium text-right">31-60 days</th>
                      <th className="pb-3 font-medium text-right">61-90 days</th>
                      <th className="pb-3 font-medium text-right text-danger">>90 days</th>
                    </>
                  ) : (
                    <>
                      <th className="pb-3 font-medium">GSTIN</th>
                      <th className="pb-3 font-medium">Last Invoice</th>
                    </>
                  )}
                  <th className="pb-3 font-medium text-right">Total Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((row, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="py-3 font-medium text-white">{row.party_name || row.name}</td>
                    {isAgeWise ? (
                      <>
                        <td className="py-3 text-right text-white">{row.d0_30 ? formatCurrency(row.d0_30) : '—'}</td>
                        <td className="py-3 text-right text-white">{row.d31_60 ? formatCurrency(row.d31_60) : '—'}</td>
                        <td className="py-3 text-right text-white">{row.d61_90 ? formatCurrency(row.d61_90) : '—'}</td>
                        <td className="py-3 text-right text-danger font-medium">{row.d90_plus ? formatCurrency(row.d90_plus) : '—'}</td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 text-textSecondary">{row.gstin || 'N/A'}</td>
                        <td className="py-3 text-textSecondary">{row.lastInv || 'N/A'}</td>
                      </>
                    )}
                    <td className="py-3 text-right font-medium text-primary">{formatCurrency(row.total_outstanding || row.total || 0)}</td>
                  </tr>
                ))}
                <tr className="bg-primary/5 font-bold border-t-2 border-primary/20 text-white">
                  <td className="py-3 text-primary">TOTAL</td>
                  {isAgeWise ? (
                    <>
                      <td className="py-3 text-right">{formatCurrency(totalD0_30)}</td>
                      <td className="py-3 text-right">{formatCurrency(totalD31_60)}</td>
                      <td className="py-3 text-right">{formatCurrency(totalD61_90)}</td>
                      <td className="py-3 text-right text-danger">{formatCurrency(totalD90_plus)}</td>
                    </>
                  ) : (
                    <td colSpan={2}></td>
                  )}
                  <td className="py-3 text-right text-primary">{formatCurrency(totalOutstanding)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
