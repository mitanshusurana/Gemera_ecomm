"use client";

import { useState, useEffect } from 'react';
import { Plus, Download, Printer, Trash2, Calendar, Search, Filter } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import SalesInvoiceForm from '@/components/forms/SalesInvoiceForm';
import TaxInvoicePrint from '@/components/print/TaxInvoicePrint';
import PartySelect from '@/components/ui/PartySelect';
import { formatCurrency } from '@/lib/utils';
import { apiClient } from '@/lib/api';

export default function SalesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrintInvoice, setSelectedPrintInvoice] = useState<any | null>(null);

  // Filters
  const [fromDate, setFromDate] = useState('2026-04-01');
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSalesData = async () => {
    setLoading(true);
    try {
      let url = `/sales/invoices?from_date=${fromDate}&to_date=${toDate}`;
      if (selectedCustomerId) url += `&customer_id=${selectedCustomerId}`;
      const res = await apiClient.get(url);
      let list = Array.isArray(res.data) ? res.data : res.data?.invoices || [];
      
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        list = list.filter((inv: any) => 
          (inv.invoice_no && inv.invoice_no.toLowerCase().includes(q)) ||
          (inv.customer_name && inv.customer_name.toLowerCase().includes(q))
        );
      }

      setSalesData(list);
    } catch (error) {
      console.error('Error fetching sales data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesData();
  }, [fromDate, toDate, selectedCustomerId, searchQuery]);

  const handleDeleteInvoice = async (invoiceNo: string) => {
    if (!confirm(`Are you sure you want to cancel and reverse invoice ${invoiceNo}? This will post a reversal journal entry.`)) {
      return;
    }
    try {
      await apiClient.delete(`/sales/invoices/by-no/${invoiceNo}`);
      alert(`Invoice ${invoiceNo} cancelled successfully.`);
      fetchSalesData();
    } catch (err: any) {
      console.error('Delete invoice error:', err);
      alert(err.response?.data?.detail || 'Failed to cancel invoice');
    }
  };

  const columns = [
    { header: 'Invoice No', accessorKey: 'invoice_no', cell: (item: any) => <span className="font-medium text-white">{item.invoice_no || item.invoice_number || item.id}</span> },
    { header: 'Date', accessorKey: 'invoice_date', cell: (item: any) => new Date(item.invoice_date || item.date || item.created_at).toLocaleDateString('en-IN') },
    { header: 'Customer', accessorKey: 'customer_name', cell: (item: any) => item.customer_name || item.customer || '—' },
    { header: 'Tax Amount', accessorKey: 'total_gst', cell: (item: any) => formatCurrency(item.total_gst || item.gst || item.tax_amount || 0) },
    { header: 'Total Amount', accessorKey: 'grand_total', cell: (item: any) => <span className="text-primary font-medium">{formatCurrency(item.grand_total || item.amount || item.total_amount || 0)}</span> },
    { header: 'Status', accessorKey: 'status', cell: (item: any) => {
      const status = item.payment_status === 'Paid' ? 'Paid' : (item.status || 'Posted');
      return (
        <Badge variant={status === 'Cancelled' ? 'danger' : status === 'Paid' ? 'success' : 'warning'}>
          {status}
        </Badge>
      );
    }},
    { header: 'Actions', accessorKey: 'actions', cell: (item: any) => (
      <div className="flex gap-2 items-center">
        <button 
          onClick={(e) => { e.stopPropagation(); setSelectedPrintInvoice(item); }}
          className="p-1 text-textSecondary hover:text-white transition-colors" 
          title="Print Statutory Tax Invoice"
        >
          <Printer className="w-4 h-4" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); setSelectedPrintInvoice(item); }}
          className="p-1 text-textSecondary hover:text-white transition-colors" 
          title="Download Invoice"
        >
          <Download className="w-4 h-4" />
        </button>
        {item.status !== 'Cancelled' && (
          <button 
            onClick={(e) => { e.stopPropagation(); handleDeleteInvoice(item.invoice_no); }}
            className="p-1 text-textSecondary hover:text-danger transition-colors"
            title="Cancel / Delete Invoice"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-playfair font-bold text-white">Sales Register</h1>
          <p className="text-textSecondary mt-1">[CGST Rule 56(4)] Manage B2B and B2C sales invoices with date range filters.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-background font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(212,168,67,0.3)]"
        >
          <Plus className="w-4 h-4" /> New Invoice
        </button>
      </div>

      {/* Filter Bar */}
      <div className="glass-card p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="space-y-1">
          <label className="text-xs text-textSecondary font-medium flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-primary" /> From Date
          </label>
          <input 
            type="date" 
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-textSecondary font-medium flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-primary" /> To Date
          </label>
          <input 
            type="date" 
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-textSecondary font-medium flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-primary" /> Customer Party
          </label>
          <PartySelect 
            partyType="Customer" 
            placeholder="All Customers"
            value={selectedCustomerId}
            onChange={(id) => setSelectedCustomerId(id)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-textSecondary font-medium flex items-center gap-1">
            <Search className="w-3.5 h-3.5 text-primary" /> Search Invoice / Customer
          </label>
          <input 
            type="text" 
            placeholder="Type invoice no..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyUp={(e) => e.key === 'Enter' && fetchSalesData()}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-textSecondary focus:border-primary outline-none"
          />
        </div>
      </div>

      <div className="glass-card p-6">
        {loading ? (
          <div className="animate-pulse flex flex-col space-y-4">
            <div className="h-10 bg-surface rounded w-full"></div>
            <div className="h-10 bg-surface rounded w-full"></div>
            <div className="h-10 bg-surface rounded w-full"></div>
          </div>
        ) : salesData.length === 0 ? (
          <div className="text-center py-12 text-textSecondary space-y-2">
            <p className="text-base font-semibold text-white">No sales invoices found for selected period</p>
            <p className="text-xs text-textSecondary">Try adjusting the date filters or click "New Invoice" to record a sale.</p>
          </div>
        ) : (
          <DataTable columns={columns} data={salesData} onRowClick={(item) => setSelectedPrintInvoice(item)} />
        )}
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Create Tax Invoice"
      >
        <SalesInvoiceForm onSuccess={() => { setIsModalOpen(false); fetchSalesData(); }} />
      </Modal>

      {selectedPrintInvoice && (
        <TaxInvoicePrint
          invoice={selectedPrintInvoice}
          onClose={() => setSelectedPrintInvoice(null)}
        />
      )}
    </div>
  );
}
