'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

import { formatCurrency } from '@/lib/utils';
import { Printer, X } from 'lucide-react';

import { useCompany } from '@/lib/company';

interface TaxInvoicePrintProps {
  invoice: any;
  onClose: () => void;
}

export default function TaxInvoicePrint({ invoice, onClose }: TaxInvoicePrintProps) {
  // Seller identity is company master data. It was previously hardcoded --
  // including a placeholder GSTIN (08AAACC1234F1Z9, dummy PAN AAACC1234F) --
  // so every printed invoice carried a false GSTIN under a Rule 46 heading.
  // It then read invoice.company, which nothing populated, so every invoice
  // went out headed "COMPANY NOT CONFIGURED". The company master is the source.
  const { company: masterCompany } = useCompany();

  // Rule 48(4): a B2B invoice above the mandate carries the IRP's IRN and its
  // signed QR. The QR text is the IRP's JWS; it is rendered as an image so a
  // GST officer's app can scan it. Rendering is async, hence the state.
  const irn: string | null = invoice?.e_invoice_status === 'Generated' ? invoice?.e_invoice_irn || null : null;
  const qrText: string | null = irn ? invoice?.e_invoice_qr_code || null : null;
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!qrText) { setQrDataUrl(null); return; }
    QRCode.toDataURL(qrText, { margin: 0, width: 220, errorCorrectionLevel: 'M' })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch((err) => { console.error('QR render failed', err); if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [qrText]);

  if (!invoice) return null;

  const company = invoice.company || masterCompany || {};
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

  // The lines are the invoice. When the component was handed a register row
  // with none, it synthesised one from the header totals -- "22K Gold Jewelry
  // / Material", no HSN, 3% and 5% -- so every printed invoice showed a single
  // invented line whatever had actually been sold. Rule 46 wants the HSN and
  // description of each item. No lines means the print must say so.
  const lines: any[] = Array.isArray(invoice.lines) ? invoice.lines : [];
  const linesUnavailable = lines.length === 0;

  const subtotalMaterial = Number(invoice.subtotal_material_value || 0);
  const subtotalMaking = Number(invoice.subtotal_making_charges || 0);
  const totalTaxable = subtotalMaterial + subtotalMaking;
  const totalGst = Number(invoice.total_gst || 0);
  const tcsAmount = Number(invoice.tcs_amount || 0);
  const grandTotal = Number(invoice.grand_total || (totalTaxable + totalGst + tcsAmount));
  const isInterState = invoice.is_inter_state || false;

  // Kind of document. An export is zero-rated (s.16 IGST Act): under LUT no
  // IGST is charged and the declaration below is mandatory on the face of
  // the invoice (Rule 46(c) proviso); with payment of IGST the tax shows and
  // is refunded later. A bill of supply (Rule 49) carries no tax at all.
  const isExport = invoice.invoice_type === 'Export_Invoice';
  const isBillOfSupply = invoice.invoice_type === 'Bill_of_Supply';
  const underLut = isExport && invoice.export_type === 'LUT_without_tax';
  const title = isExport ? 'EXPORT INVOICE' : isBillOfSupply ? 'BILL OF SUPPLY' : 'TAX INVOICE';
  const subtitle = isExport
    ? `(Zero-rated supply under Section 16 of the IGST Act, 2017 — ${underLut ? 'without' : 'with'} payment of IGST)`
    : isBillOfSupply ? '(Issued under Rule 49 of CGST Rules, 2017 — no tax charged)' : '(Issued under Rule 46 of CGST Rules, 2017)';
  // Both currencies on a foreign-currency invoice: the agreed figure and the
  // rupee figure the books carry, at the stored exchange rate.
  const currency: string = invoice.currency || 'INR';
  const isForeign = currency !== 'INR';
  const fx = Number(invoice.exchange_rate || 1);
  const fcFmt = (inr: number) => `${currency} ${(fx > 0 ? inr / fx : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fcGrandTotal = invoice.fc_grand_total != null ? Number(invoice.fc_grand_total) : (fx > 0 ? grandTotal / fx : 0);
  const showTax = !isBillOfSupply && !underLut;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-white text-black w-full max-w-4xl rounded-lg shadow-2xl p-8 space-y-6 relative print:p-0 print:shadow-none print:w-full">
        {/* Screen Controls */}
        <div className="flex justify-between items-center border-b pb-4 print:hidden">
          <span className="font-bold text-lg text-gray-800">
            {isExport ? 'Export Invoice Preview [s.16 IGST Act]' : isBillOfSupply ? 'Bill of Supply Preview [CGST Rule 49]' : 'GST Tax Invoice Preview [CGST Rule 46]'}
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => {
                const { generateTaxInvoicePDF } = require('@/lib/vectorPdfEngine');
                generateTaxInvoicePDF(invoice, 'download', company);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white font-medium rounded-md hover:bg-amber-700 transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" /> Download Vector PDF
            </button>
            <button
              onClick={() => {
                const { generateTaxInvoicePDF } = require('@/lib/vectorPdfEngine');
                generateTaxInvoicePDF(invoice, 'print', company);
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
            <h1 className="text-2xl font-bold tracking-wide uppercase">{title}</h1>
            <p className="text-xs font-semibold text-gray-600">{subtitle}</p>
          </div>

          {isExport && (
            <div className="border-2 border-black p-3 text-center space-y-1">
              <p className="text-sm font-bold uppercase">
                {underLut
                  ? 'Supply meant for export under LUT without payment of IGST'
                  : 'Supply meant for export on payment of IGST'}
              </p>
              {underLut && invoice.lut_no && <p className="text-xs font-mono">LUT / ARN No: {invoice.lut_no}</p>}
              <p className="text-xs text-gray-700">
                {[
                  invoice.shipping_bill_no ? `Shipping Bill No: ${invoice.shipping_bill_no}` : null,
                  invoice.shipping_bill_date ? `dated ${new Date(invoice.shipping_bill_date).toLocaleDateString('en-IN')}` : null,
                  invoice.port_code ? `Port: ${invoice.port_code}` : null,
                  invoice.buyer_country ? `Country of destination: ${invoice.buyer_country}` : null,
                ].filter(Boolean).join(' · ') || 'Shipping bill particulars to be endorsed'}
              </p>
              {isForeign && (
                <p className="text-xs text-gray-700">
                  Invoice currency {currency}; exchange rate 1 {currency} = ₹{fx.toLocaleString('en-IN', { maximumFractionDigits: 4 })}. Rupee values shown are for the books and GSTR-1.
                </p>
              )}
            </div>
          )}

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
              <p className="text-xs">Place of Supply: {isExport ? '96 - Other Country' : (invoice.place_of_supply || (isInterState ? 'Out of State' : '08 - Rajasthan'))}</p>
              <p className="text-xs">Payment Terms: {invoice.payment_terms || 'Immediate'}</p>
            </div>
          </div>

          {/* e-Invoice: IRN, acknowledgement and signed QR [Rule 48(4)] */}
          {irn && (
            <div className="flex items-center justify-between gap-4 border border-black p-3 rounded-sm">
              <div className="text-xs space-y-1 min-w-0">
                <p className="font-bold uppercase text-gray-700">e-Invoice</p>
                <p className="font-mono break-all"><strong>IRN:</strong> {irn}</p>
                <p className="font-mono">
                  <strong>Ack No:</strong> {invoice.e_invoice_ack_no || '—'}
                  {'  '}<strong className="ml-3">Ack Date:</strong>{' '}
                  {invoice.e_invoice_ack_date ? new Date(invoice.e_invoice_ack_date).toLocaleString('en-IN') : '—'}
                </p>
                {invoice.eway_bill_no && (
                  <p className="font-mono"><strong>e-Way Bill:</strong> {invoice.eway_bill_no}
                    {invoice.eway_bill_valid_upto ? ` (valid till ${new Date(invoice.eway_bill_valid_upto).toLocaleDateString('en-IN')})` : ''}
                  </p>
                )}
              </div>
              <div className="shrink-0 w-24 h-24 flex items-center justify-center border border-gray-300">
                {qrDataUrl
                  ? <img src={qrDataUrl} alt="Signed e-invoice QR" className="w-24 h-24" />
                  : <span className="text-[9px] text-gray-500 text-center px-1">{qrText ? 'Rendering QR…' : 'Signed QR not on record'}</span>}
              </div>
            </div>
          )}

          {/* Customer Details */}
          <div className="grid grid-cols-2 gap-4 border border-black p-4 rounded-sm bg-gray-50">
            <div>
              <h3 className="font-bold text-xs uppercase text-gray-700 mb-1">Billed To (Buyer):</h3>
              <p className="font-bold text-sm text-gray-900">{invoice.customer_name || 'Customer Name'}</p>
              {invoice.customer_trade_name && <p className="text-xs italic text-gray-600">({invoice.customer_trade_name})</p>}
              <p className="text-xs text-gray-700 mt-1">
                {[invoice.customer_address1, invoice.customer_address2, invoice.customer_city, invoice.customer_state_name, invoice.customer_pincode].filter(Boolean).join(', ') || '— address not on record —'}
              </p>
              {invoice.customer_phone && <p className="text-xs text-gray-600 mt-0.5">Phone: {invoice.customer_phone}</p>}
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs font-mono"><strong>GSTIN:</strong> {invoice.customer_gstin || (isExport ? 'Not applicable (overseas buyer)' : 'Unregistered')}</p>
              {invoice.customer_pan && <p className="text-xs font-mono"><strong>PAN:</strong> {invoice.customer_pan}</p>}
              {isExport
                ? <p className="text-xs"><strong>Country:</strong> {invoice.buyer_country || '—'}</p>
                : <p className="text-xs"><strong>State Code:</strong> {invoice.customer_state_code || '08'} ({invoice.customer_state_name || 'Rajasthan'})</p>}
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
              {linesUnavailable && (
                <tr>
                  <td colSpan={8} className="border border-black p-3 text-center text-xs italic text-gray-600">
                    Line items could not be loaded for this invoice. Do not issue this print; reopen the invoice and try again.
                  </td>
                </tr>
              )}
              {lines.map((line: any, idx: number) => {
                const matVal = Number(line.material_value || 0);
                const makVal = Number(line.making_charges || 0);
                const lineTaxable = matVal + makVal;
                const matRate = Number(line.material_gst_rate || 3.0);
                const makRate = Number(line.making_gst_rate ?? 5.0);
                // The stored tax on the line, not a recomputation: zero on a
                // bill of supply or an LUT export whatever the rate column says.
                const lineTax = ['igst_material', 'igst_making', 'cgst_material', 'sgst_material', 'cgst_making', 'sgst_making']
                  .reduce((s, k) => s + Number(line[k] || 0), 0);
                return (
                  <tr key={idx} className="border-b border-gray-300 text-gray-800">
                    <td className="border border-gray-300 p-2 text-center">{idx + 1}</td>
                    <td className="border border-gray-300 p-2 font-medium">
                      {line.description || 'Gold Jewelry Article'}
                      {line.lot_no && <span className="block text-[10px] font-mono text-gray-600">Lot {line.lot_no}{line.quantity ? ` · ${Number(line.quantity)} ${line.uom || 'ct'}` : ''}</span>}
                    </td>
                    <td className="border border-gray-300 p-2 text-center font-mono">{line.hsn_sac_code || <span className="text-red-600">—</span>}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(matVal)}{isForeign && <span className="block text-[10px] text-gray-600">{fcFmt(matVal)}</span>}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(makVal)}{isForeign && <span className="block text-[10px] text-gray-600">{fcFmt(makVal)}</span>}</td>
                    <td className="border border-gray-300 p-2 text-right font-semibold">{formatCurrency(lineTaxable)}</td>
                    <td className="border border-gray-300 p-2 text-right">{showTax ? `${matRate}% / ${makRate}%` : '0% (zero-rated)'}</td>
                    <td className="border border-gray-300 p-2 text-right font-semibold">{formatCurrency(lineTaxable + lineTax)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals & Tax Split */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-black p-3 space-y-2">
              {/* Only the company's own remittance details, from the company
                  master. This printed a literal bank, account number and IFSC
                  on every invoice -- details belonging to nobody. A customer
                  paying against them paid into nothing. */}
              {company.bank ? (
                <>
                  <h4 className="font-bold text-xs uppercase text-gray-700">Bank Account Details for NEFT/RTGS:</h4>
                  <p className="text-xs">
                    Bank Name: {company.bank.bank_name}
                    {company.bank.bank_branch ? ` (${company.bank.bank_branch})` : ''}
                  </p>
                  <p className="text-xs font-mono">A/C No: {company.bank.account_no}</p>
                  <p className="text-xs font-mono">IFSC: {company.bank.ifsc}</p>
                </>
              ) : (
                <p className="text-xs text-gray-500 italic">
                  Remittance details not on record. Add the bank account to the company master to print them here.
                </p>
              )}
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
              {!showTax ? (
                <div className="flex justify-between text-gray-700">
                  <span>{underLut ? 'IGST (export under LUT):' : 'GST:'}</span>
                  <span>NIL</span>
                </div>
              ) : !isInterState ? (
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
                  <span>IGST{isExport ? ' (paid, refund claimed)' : ''}:</span>
                  <span>{formatCurrency(totalGst)}</span>
                </div>
              )}
              {tcsAmount > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>TCS u/s 206C(1H){invoice.tcs_rate ? ` @ ${Number(invoice.tcs_rate)}%` : ''}:</span>
                  <span>{formatCurrency(tcsAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-black pt-1 text-sm font-bold">
                <span>Grand Total{isForeign ? ' (INR)' : ''}:</span>
                <span className="text-amber-900">{formatCurrency(grandTotal)}</span>
              </div>
              {isForeign && (
                <div className="flex justify-between text-sm font-bold">
                  <span>Grand Total ({currency}):</span>
                  <span className="text-amber-900">{currency} {fcGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
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
              <span className="text-[10px] text-gray-500 font-normal">For {company.legal_name || company.trade_name || company.name || "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
