'use client';

import { formatCurrency } from '@/lib/utils';
import { Printer, X } from 'lucide-react';

interface TaxInvoicePrintProps {
  invoice: any;
  onClose: () => void;
}

export default function TaxInvoicePrint({ invoice, onClose }: TaxInvoicePrintProps) {
  if (!invoice) return null;

  // Seller identity is company master data. It was previously hardcoded --
  // including a placeholder GSTIN (08AAACC1234F1Z9, dummy PAN AAACC1234F) --
  // so every printed invoice carried a false GSTIN under a Rule 46 heading.
  const company = invoice.company || {};
  const seller = {
    legal_name: company.legal_name || company.trade_name || 'COMPANY NOT CONFIGURED',
    address_line1: company.address_line1 || '',
    address_line2: [company.city, company.state_name, company.pincode]
      .filter(Boolean)
      .join(', '),
    gstin: company.gstin || '',
    state_label: company.state_code
      ? `${company.state_code}${company.state_name ? ' - ' + company.state_name : ''}`
      : 'Not configured',
  };
  const sellerConfigured = Boolean(company.gstin && (company.legal_name || company.trade_name));

  const lines = invoice.lines || [
    {
      description: invoice.description || '22K Gold Jewelry / Material',
      hsn_sac_code: invoice.hsn_code || '',
      quantity: 1,
      material_value: invoice.subtotal_material_value || invoice.material_value || 0,
      making_charges: invoice.subtotal_making_charges || invoice.making_charges || 0,
      material_gst_rate: 3.0,
      making_gst_rate: 5.0
    }
  ];

  const subtotalMaterial = Number(invoice.subtotal_material_value || 0);
  const subtotalMaking = Number(invoice.subtotal_making_charges || 0);
  const totalTaxable = subtotalMaterial + subtotalMaking;
  const totalGst = Number(invoice.total_gst || 0);
  const grandTotal = Number(invoice.grand_total || (totalTaxable + totalGst));
  const isInterState = invoice.is_inter_state || false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-white text-black w-full max-w-4xl rounded-lg shadow-2xl p-8 space-y-6 relative print:p-0 print:shadow-none print:w-full">
        {/* Screen Controls */}
        <div className="flex justify-between items-center border-b pb-4 print:hidden">
          <span className="font-bold text-lg text-gray-800">GST Tax Invoice Preview [CGST Rule 46]</span>
          <div className="flex gap-3">
            <button
              onClick={() => {
                const { generateTaxInvoicePDF } = require('@/lib/vectorPdfEngine');
                generateTaxInvoicePDF(invoice, 'download');
              }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white font-medium rounded-md hover:bg-amber-700 transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" /> Download Vector PDF
            </button>
            <button
              onClick={() => {
                const { generateTaxInvoicePDF } = require('@/lib/vectorPdfEngine');
                generateTaxInvoicePDF(invoice, 'print');
              }}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-800 font-medium rounded-md hover:bg-gray-100 transition-colors"
            >
              <Printer className="w-4 h-4" /> Print PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 border rounded-md text-gray-600 hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* INVOICE CONTENT */}
        <div id="printable-voucher" className="printable-area space-y-6 text-sm">
          {/* Header */}
          <div className="text-center border-b-2 border-black pb-3">
            <h1 className="text-2xl font-bold tracking-wide uppercase">TAX INVOICE</h1>
            <p className="text-xs font-semibold text-gray-600">(Issued under Rule 46 of CGST Rules, 2017)</p>
          </div>

          {!sellerConfigured && (
            <div className="border-2 border-red-600 bg-red-50 p-3 text-center print:border-red-600">
              <p className="text-xs font-bold uppercase text-red-700">
                Not a valid tax invoice
              </p>
              <p className="text-xs text-red-700">
                Company GSTIN and legal name are not configured. Set them in company
                master data before issuing this document to a customer.
              </p>
            </div>
          )}

          {/* Seller & Invoice Details */}
          <div className="grid grid-cols-2 gap-4 border border-black p-4 rounded-sm">
            <div>
              <h2 className="font-bold text-base text-amber-900 uppercase">{seller.legal_name}</h2>
              {seller.address_line1 && <p className="text-xs">{seller.address_line1}</p>}
              {seller.address_line2 && <p className="text-xs">{seller.address_line2}</p>}
              <p className="text-xs font-mono mt-1">
                <strong>GSTIN:</strong>{' '}
                {seller.gstin
                  ? seller.gstin
                  : <span className="text-red-600 font-bold">NOT CONFIGURED</span>}
              </p>
              <p className="text-xs"><strong>State:</strong> {seller.state_label}</p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-sm font-bold font-mono">Invoice No: {invoice.invoice_no}</p>
              <p className="text-xs">Date: {new Date(invoice.invoice_date || Date.now()).toLocaleDateString('en-IN')}</p>
              <p className="text-xs">Place of Supply: {invoice.place_of_supply || (isInterState ? 'Out of State' : '08 - Rajasthan')}</p>
              <p className="text-xs">Payment Terms: {invoice.payment_terms || 'Immediate'}</p>
            </div>
          </div>

          {/* Customer Details */}
          <div className="grid grid-cols-2 gap-4 border border-black p-4 rounded-sm bg-gray-50">
            <div>
              <h3 className="font-bold text-xs uppercase text-gray-700 mb-1">Billed To (Buyer):</h3>
              <p className="font-bold text-sm text-gray-900">{invoice.customer_name || 'Customer Name'}</p>
              {invoice.customer_trade_name && <p className="text-xs italic text-gray-600">({invoice.customer_trade_name})</p>}
              <p className="text-xs text-gray-700 mt-1">
                {[invoice.customer_address1, invoice.customer_address2, invoice.customer_city, invoice.customer_state_name, invoice.customer_pincode].filter(Boolean).join(', ') || 'Jaipur, Rajasthan — 302003'}
              </p>
              {invoice.customer_phone && <p className="text-xs text-gray-600 mt-0.5">Phone: {invoice.customer_phone}</p>}
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs font-mono"><strong>GSTIN:</strong> {invoice.customer_gstin || 'Unregistered'}</p>
              {invoice.customer_pan && <p className="text-xs font-mono"><strong>PAN:</strong> {invoice.customer_pan}</p>}
              <p className="text-xs"><strong>State Code:</strong> {invoice.customer_state_code || '08'} ({invoice.customer_state_name || 'Rajasthan'})</p>
            </div>
          </div>

          {/* Item Table */}
          <table className="w-full border-collapse border border-gray-300 text-left text-xs">
            <thead>
              <tr className="bg-[#F8F4E8] text-gray-900 border-b border-gray-300 font-semibold">
                <th className="border border-gray-300 p-2 text-center w-10">#</th>
                <th className="border border-gray-300 p-2">Item Description</th>
                <th className="border border-gray-300 p-2 text-center">HSN/SAC</th>
                <th className="border border-gray-300 p-2 text-right">Gold Material (₹)</th>
                <th className="border border-gray-300 p-2 text-right">Making Charges (₹)</th>
                <th className="border border-gray-300 p-2 text-right">Taxable Subtotal (₹)</th>
                <th className="border border-gray-300 p-2 text-right">GST Rate</th>
                <th className="border border-gray-300 p-2 text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line: any, idx: number) => {
                const matVal = Number(line.material_value || 0);
                const makVal = Number(line.making_charges || 0);
                const lineTaxable = matVal + makVal;
                const matRate = Number(line.material_gst_rate || 3.0);
                const lineTax = matVal * (matRate / 100) + makVal * 0.05;
                return (
                  <tr key={idx} className="border-b border-gray-300 text-gray-800">
                    <td className="border border-gray-300 p-2 text-center">{idx + 1}</td>
                    <td className="border border-gray-300 p-2 font-medium">{line.description || 'Gold Jewelry Article'}</td>
                    <td className="border border-gray-300 p-2 text-center font-mono">{line.hsn_sac_code || <span className="text-red-600">—</span>}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(matVal)}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(makVal)}</td>
                    <td className="border border-gray-300 p-2 text-right font-semibold">{formatCurrency(lineTaxable)}</td>
                    <td className="border border-gray-300 p-2 text-right">{matRate}% / 5%</td>
                    <td className="border border-gray-300 p-2 text-right font-semibold">{formatCurrency(lineTaxable + lineTax)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals & Tax Split */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-black p-3 space-y-2">
              <h4 className="font-bold text-xs uppercase text-gray-700">Bank Account Details for NEFT/RTGS:</h4>
              <p className="text-xs">Bank Name: State Bank of India (Jaipur Main Branch)</p>
              <p className="text-xs font-mono">A/C No: 409988776611</p>
              <p className="text-xs font-mono">IFSC: SBIN0001234</p>
            </div>
            <div className="border border-black p-3 space-y-1 text-right text-xs">
              <div className="flex justify-between">
                <span>Subtotal Material Value:</span>
                <span className="font-semibold">{formatCurrency(subtotalMaterial)}</span>
              </div>
              <div className="flex justify-between">
                <span>Subtotal Making Charges:</span>
                <span className="font-semibold">{formatCurrency(subtotalMaking)}</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span>Total Taxable Amount:</span>
                <span className="font-semibold">{formatCurrency(totalTaxable)}</span>
              </div>
              {!isInterState ? (
                <>
                  <div className="flex justify-between text-gray-700">
                    <span>CGST:</span>
                    <span>{formatCurrency(totalGst / 2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-700">
                    <span>SGST:</span>
                    <span>{formatCurrency(totalGst / 2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-gray-700">
                  <span>IGST:</span>
                  <span>{formatCurrency(totalGst)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-black pt-1 text-sm font-bold">
                <span>Grand Total:</span>
                <span className="text-amber-900">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Footer & Signatory */}
          <div className="flex justify-between items-end border-t border-black pt-8 mt-6">
            <div className="text-xs text-gray-600">
              <p>Terms & Conditions:</p>
              <p>1. Goods once sold will not be taken back without original tax invoice.</p>
              <p>2. Subject to Jaipur Jurisdiction.</p>
            </div>
            <div className="text-center font-semibold text-xs border-t border-black pt-2 px-8">
              Authorized Signatory<br/>
              <span className="text-[10px] text-gray-500 font-normal">For Caratloop Manufacturing ERP</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
