import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

/**
 * Printed where a required particular is absent.
 *
 * CGST Rule 46 lists what a tax invoice must carry: a consecutive serial
 * number, the recipient's name and address, the place of supply, the HSN. This
 * engine used to substitute plausible values for any of those that were
 * missing -- a serial number copied from a sample, "Jaipur, Rajasthan" as the
 * recipient's address, "08 - Rajasthan" as the place of supply. The customer
 * claims input tax credit against this document, so a fabricated particular is
 * worse than a visible gap: it looks correct and is not.
 */
const MISSING = '— MISSING —';

// Helper to format currency numbers cleanly in PDF
const formatPdfMoney = (val: number | string) => {
  const num = typeof val === 'number' ? val : parseFloat(val || '0');
  return `Rs. ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ─── 1. GST TAX INVOICE [CGST Rule 46] ────────────────────────────────────────
// Async because the signed e-invoice QR is rendered to a PNG first. Callers
// that do not await still get the file: the promise resolves after save().
export const generateTaxInvoicePDF = async (invoice: any, action: 'download' | 'print' = 'download', companyArg?: any) => {
  // The on-screen preview was corrected to read the company master; this
  // engine still printed a literal seller, a placeholder GSTIN
  // (08AAACC1234F1Z9) and a bank account belonging to nobody. Same source
  // now: the invoice detail carries the company, or the caller passes it.
  const company = companyArg || invoice.company || {};

  // Rule 48(4): IRN, acknowledgement and the IRP's signed QR, when generated.
  const irn: string | null = invoice.e_invoice_status === 'Generated' ? invoice.e_invoice_irn || null : null;
  let qrPng: string | null = null;
  if (irn && invoice.e_invoice_qr_code) {
    try {
      qrPng = await QRCode.toDataURL(String(invoice.e_invoice_qr_code), { margin: 0, width: 300, errorCorrectionLevel: 'M' });
    } catch (err) {
      console.error('QR render failed', err);
    }
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const width = doc.internal.pageSize.getWidth(); // 210mm
  let y = 10;

  // Gold Top Accent Line
  doc.setFillColor(212, 168, 67); // #D4A843
  doc.rect(10, y, width - 20, 2.5, 'F');
  y += 12; // Generous 12mm vertical margin below top bar

  // Kind of document: export (zero-rated, s.16 IGST Act), bill of supply
  // (Rule 49) or tax invoice (Rule 46). Foreign-currency invoices print the
  // agreed figure beside the rupee figure the books carry.
  const isExport = invoice.invoice_type === 'Export_Invoice';
  const isBillOfSupply = invoice.invoice_type === 'Bill_of_Supply';
  const underLut = isExport && invoice.export_type === 'LUT_without_tax';
  const showTax = !isBillOfSupply && !underLut;
  const currency: string = invoice.currency || 'INR';
  const isForeign = currency !== 'INR';
  const fx = parseFloat(invoice.exchange_rate || '1') || 1;
  const formatFc = (inr: number) => `${currency} ${(inr / fx).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Title Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text(isExport ? 'EXPORT INVOICE' : isBillOfSupply ? 'BILL OF SUPPLY' : 'TAX INVOICE', width / 2, y, { align: 'center' });
  y += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(
    isExport
      ? `(Zero-rated supply under Section 16 of the IGST Act, 2017 — ${underLut ? 'without' : 'with'} payment of IGST)`
      : isBillOfSupply
        ? '(Issued under Rule 49 of CGST Rules, 2017 — no tax charged)'
        : '(Issued under Rule 46 of CGST Rules, 2017 — Statutory Tax Document)',
    width / 2, y, { align: 'center' },
  );
  y += 7.5;

  if (isExport) {
    // The declaration Rule 46 requires on the face of an export invoice.
    const declH = 16 + (isForeign ? 4 : 0);
    doc.setLineWidth(0.5);
    doc.setDrawColor(30, 30, 30);
    doc.rect(10, y, width - 20, declH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(
      underLut ? 'SUPPLY MEANT FOR EXPORT UNDER LUT WITHOUT PAYMENT OF IGST' : 'SUPPLY MEANT FOR EXPORT ON PAYMENT OF IGST',
      width / 2, y + 5.5, { align: 'center' },
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 60);
    const particulars = [
      underLut && invoice.lut_no ? `LUT/ARN: ${invoice.lut_no}` : null,
      invoice.shipping_bill_no ? `Shipping Bill: ${invoice.shipping_bill_no}` : null,
      invoice.shipping_bill_date ? `dated ${new Date(invoice.shipping_bill_date).toLocaleDateString('en-IN')}` : null,
      invoice.port_code ? `Port: ${invoice.port_code}` : null,
      invoice.buyer_country ? `Destination: ${invoice.buyer_country}` : null,
    ].filter(Boolean).join('   ');
    doc.text(particulars || 'Shipping bill particulars to be endorsed', width / 2, y + 10.5, { align: 'center' });
    if (isForeign) {
      doc.text(`Invoice currency ${currency}; 1 ${currency} = Rs. ${fx.toLocaleString('en-IN', { maximumFractionDigits: 4 })}. Rupee values are for the books and GSTR-1.`, width / 2, y + 14.5, { align: 'center' });
    }
    y += declH + 4;
  }

  // Seller Details (Left) & Invoice Info (Right) Boxes
  doc.setLineWidth(0.3);
  doc.setDrawColor(210, 200, 180);
  doc.setFillColor(253, 251, 247); // Light warm cream background
  doc.rect(10, y, (width - 24) / 2, 28, 'FD');
  doc.setFillColor(253, 251, 247);
  doc.rect(10 + (width - 24) / 2 + 4, y, (width - 24) / 2, 28, 'FD');

  // Seller Info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(170, 120, 10);
  doc.text((company.legal_name || company.trade_name || company.name || '— COMPANY NOT CONFIGURED —').toUpperCase(), 13, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text(company.address_line1 || '', 13, y + 11);
  doc.text([company.city, company.state_name, company.pincode].filter(Boolean).join(', '), 13, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.text(company.gstin ? `GSTIN: ${company.gstin}` : 'GSTIN: — not configured —', 13, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(company.state_code ? `State Code: ${company.state_code}${company.state_name ? ' - ' + company.state_name : ''}` : 'State Code: —', 13, y + 24);

  // Invoice Meta
  const rightX = 10 + (width - 24) / 2 + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text(`Invoice No: ${invoice.invoice_no || MISSING}`, rightX, y + 6);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  const invDate = invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');
  doc.text(`Date: ${invDate}`, rightX, y + 11);
  doc.text(`Place of Supply: ${isExport ? '96 - Other Country' : (invoice.place_of_supply || MISSING)}`, rightX, y + 15);
  doc.text(`Payment Terms: ${invoice.payment_terms || 'Immediate'}`, rightX, y + 20);
  doc.text(`Reverse Charge (RCM): ${invoice.is_rcm ? 'YES' : 'NO'}`, rightX, y + 24);

  y += 32;

  // Buyer Box — Explicit Light Warm Cream Fill
  doc.setLineWidth(0.3);
  doc.setDrawColor(210, 200, 180);
  doc.setFillColor(253, 251, 247);
  doc.rect(10, y, width - 20, 22, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text('BILLED TO (BUYER DETAILS):', 13, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(invoice.customer_name || MISSING, 13, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  const addr = [invoice.customer_address1, invoice.customer_city, invoice.customer_state_name].filter(Boolean).join(', ') || MISSING;
  doc.text(addr, 13, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.text(`GSTIN: ${invoice.customer_gstin || (isExport ? 'N/A (overseas buyer)' : 'Unregistered')}`, width - 75, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    isExport
      ? `Country: ${invoice.buyer_country || MISSING}`
      : `State Code: ${invoice.customer_state_code || MISSING} (${invoice.customer_state_name || MISSING})`,
    width - 75, y + 15,
  );

  y += 26;

  // e-Invoice block: IRN and acknowledgement on the left, signed QR on the right.
  if (irn) {
    const blockH = 26;
    doc.setLineWidth(0.3);
    doc.setDrawColor(210, 200, 180);
    doc.setFillColor(255, 255, 255);
    doc.rect(10, y, width - 20, blockH, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text('E-INVOICE [RULE 48(4)]', 13, y + 5);

    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(30, 30, 30);
    const irnLines = doc.splitTextToSize(`IRN: ${irn}`, width - 60);
    doc.text(irnLines, 13, y + 10);
    const ackDt = invoice.e_invoice_ack_date ? new Date(invoice.e_invoice_ack_date).toLocaleString('en-IN') : '—';
    doc.text(`Ack No: ${invoice.e_invoice_ack_no || '—'}    Ack Date: ${ackDt}`, 13, y + 17);
    if (invoice.eway_bill_no) {
      const valid = invoice.eway_bill_valid_upto ? ` (valid till ${new Date(invoice.eway_bill_valid_upto).toLocaleDateString('en-IN')})` : '';
      doc.text(`e-Way Bill: ${invoice.eway_bill_no}${valid}`, 13, y + 22);
    }
    doc.setFont('helvetica', 'normal');

    if (qrPng) {
      doc.addImage(qrPng, 'PNG', width - 10 - 23, y + 1.5, 23, 23);
    } else {
      doc.setFontSize(6);
      doc.setTextColor(120, 120, 120);
      doc.text('Signed QR not on record', width - 13, y + 13, { align: 'right' });
    }
    y += blockH + 4;
  }

  // Line Items Table
  // No invented line. With no lines this printed "22K Gold Bangle / Ornament,
  // HSN 71131910, 10 g, 50,000 + 2,500" -- a fabricated item on a tax invoice.
  const lines: any[] = Array.isArray(invoice.lines) && invoice.lines.length ? invoice.lines : [];

  const tableBody = lines.length === 0
    ? [[{ content: 'LINE ITEMS NOT AVAILABLE — do not issue this document; reopen the invoice and export again.', colSpan: 8, styles: { halign: 'center', fontStyle: 'italic' } }]]
    : lines.map((l: any, i: number) => {
    const matVal = parseFloat(l.material_value || 0);
    const makVal = parseFloat(l.making_charges || 0);
    const taxable = matVal + makVal;
    return [
      (i + 1).toString(),
      l.description || MISSING,
      l.hsn_sac_code || MISSING,
      (l.quantity || 1).toString(),
      l.gross_weight ? `${l.gross_weight} gm` : '—',
      l.net_weight ? `${l.net_weight} gm` : '—',
      formatPdfMoney(matVal),
      formatPdfMoney(makVal),
      formatPdfMoney(taxable)
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Item Description', 'HSN/SAC', 'Qty', 'Gross Wt', 'Net Wt', 'Gold Material', 'Making Charges', 'Taxable Total']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [245, 238, 222], // Light cream ivory
      textColor: [40, 40, 40],   // Dark text
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
      lineWidth: 0.2,
      lineColor: [210, 200, 180]
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [40, 40, 40],
      lineWidth: 0.2,
      lineColor: [230, 225, 215]
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 42 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'center', cellWidth: 12 },
      4: { halign: 'right', cellWidth: 18 },
      5: { halign: 'right', cellWidth: 18 },
      6: { halign: 'right', cellWidth: 24 },
      7: { halign: 'right', cellWidth: 24 },
      8: { halign: 'right', cellWidth: 24 }
    },
    margin: { left: 10, right: 10 }
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Tax Summary & Bank Details Side-by-Side
  // No invented totals: a missing figure prints as zero, not as a sample value.
  const matTotal = parseFloat(invoice.subtotal_material_value || invoice.taxable_material_value || 0);
  const makTotal = parseFloat(invoice.subtotal_making_charges || invoice.taxable_making_value || 0);
  const totalTaxable = matTotal + makTotal;
  const totalGst = parseFloat(invoice.total_gst || 0);
  const tcsAmount = parseFloat(invoice.tcs_amount || 0);
  const grandTotal = parseFloat(invoice.grand_total || (totalTaxable + totalGst + tcsAmount));
  const isInterState = invoice.is_inter_state || false;
  const boxH = 34 + (tcsAmount > 0 ? 5 : 0) + (isForeign ? 6 : 0);

  // Bank Box (Left)
  doc.setLineWidth(0.3);
  doc.setDrawColor(210, 200, 180);
  doc.setFillColor(253, 251, 247);
  doc.rect(10, y, 95, boxH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text('BANK DETAILS FOR DIRECT REMITTANCE / RTGS:', 13, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  if (company.bank && company.bank.account_no && company.bank.ifsc) {
    // Only what the company entered in its own master. This printed a literal
    // SBI account and IFSC on every invoice -- a customer paying against them
    // paid into nothing.
    doc.text(`Bank Name: ${company.bank.bank_name || ''}${company.bank.bank_branch ? ' (' + company.bank.bank_branch + ')' : ''}`, 13, y + 11);
    doc.text(`Account Name: ${company.legal_name || company.name || ''}`, 13, y + 16);
    doc.text(`Account No: ${company.bank.account_no}`, 13, y + 21);
    doc.text(`IFSC Code: ${company.bank.ifsc}`, 13, y + 26);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.text('Remittance details not on record. Add the bank account to the company master.', 13, y + 11);
    doc.setFont('helvetica', 'normal');
  }

  // Totals Box (Right)
  doc.setFillColor(253, 251, 247);
  doc.rect(110, y, width - 120, boxH, 'FD');
  let ty = y + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  
  doc.text('Gold/Precious Material (3% GST):', 113, ty);
  doc.text(formatPdfMoney(matTotal), width - 13, ty, { align: 'right' });
  ty += 5;

  doc.text('Craftsmanship / Making (5% GST):', 113, ty);
  doc.text(formatPdfMoney(makTotal), width - 13, ty, { align: 'right' });
  ty += 5;

  if (!showTax) {
    doc.text(underLut ? 'IGST (export under LUT):' : 'GST:', 113, ty);
    doc.text('NIL', width - 13, ty, { align: 'right' });
    ty += 5;
  } else if (isInterState) {
    doc.text(isExport ? 'IGST (paid, refund claimed):' : 'IGST Tax (Material 3% + Making 5%):', 113, ty);
    doc.text(formatPdfMoney(totalGst), width - 13, ty, { align: 'right' });
    ty += 5;
  } else {
    doc.text('CGST Tax (Material 1.5% + Making 2.5%):', 113, ty);
    doc.text(formatPdfMoney(totalGst / 2), width - 13, ty, { align: 'right' });
    ty += 5;
    doc.text('SGST Tax (Material 1.5% + Making 2.5%):', 113, ty);
    doc.text(formatPdfMoney(totalGst / 2), width - 13, ty, { align: 'right' });
    ty += 5;
  }

  if (tcsAmount > 0) {
    doc.text(`TCS u/s 206C(1H)${invoice.tcs_rate ? ' @ ' + Number(invoice.tcs_rate) + '%' : ''}:`, 113, ty);
    doc.text(formatPdfMoney(tcsAmount), width - 13, ty, { align: 'right' });
    ty += 5;
  }

  doc.setLineWidth(0.4);
  doc.line(113, ty - 1, width - 13, ty - 1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(170, 120, 10);
  doc.text(isForeign ? 'Grand Total (INR):' : 'Grand Total Payable:', 113, ty + 3);
  doc.text(formatPdfMoney(grandTotal), width - 13, ty + 3, { align: 'right' });
  if (isForeign) {
    const fcGrand = invoice.fc_grand_total != null ? parseFloat(invoice.fc_grand_total) : grandTotal / fx;
    doc.text(`Grand Total (${currency}):`, 113, ty + 9);
    doc.text(`${currency} ${fcGrand.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, width - 13, ty + 9, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(`Material ${formatFc(matTotal)}; making ${formatFc(makTotal)}`, 113, ty + 13);
  }

  y += boxH + 6;

  // Footer Signatory
  doc.setLineWidth(0.2);
  doc.line(10, y, width - 10, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('1. Goods once sold will not be taken back without original statutory tax invoice.', 10, y);
  doc.text('2. All disputes subject to Jaipur jurisdiction.', 10, y + 4);
  doc.text('3. Itemized values reflect statutory GST classification components.', 10, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text(`For ${company.legal_name || company.trade_name || company.name || '—'}`, width - 10, y, { align: 'right' });
  doc.text('Authorized Signatory', width - 10, y + 10, { align: 'right' });

  const filename = `Tax_Invoice_${invoice.invoice_no || 'CL'}.pdf`;
  if (action === 'download') {
    doc.save(filename);
  } else {
    window.open(doc.output('bloburl'), '_blank');
  }
};


// ─── 2. STATUTORY PURCHASE VOUCHER [CGST Rule 56(4)] ─────────────────────────
export const generatePurchaseVoucherPDF = (voucher: any, action: 'download' | 'print' = 'download', companyArg?: any) => {
  const company = companyArg || voucher.company || {};
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  let y = 10;

  // Gold Header Accent
  doc.setFillColor(212, 168, 67);
  doc.rect(10, y, width - 20, 2.5, 'F');
  y += 12;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(30, 30, 30);
  doc.text('STATUTORY PURCHASE VOUCHER / INWARD BILL', width / 2, y, { align: 'center' });
  y += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('(Issued under CGST Rule 56(4) — Commodity Inward & Input Tax Credit Register)', width / 2, y, { align: 'center' });
  y += 7.5;

  // Buyer Details (Left) & Voucher Info (Right)
  doc.setLineWidth(0.3);
  doc.setDrawColor(210, 200, 180);
  doc.setFillColor(253, 251, 247);
  doc.rect(10, y, (width - 24) / 2, 26, 'FD');
  doc.setFillColor(253, 251, 247);
  doc.rect(10 + (width - 24) / 2 + 4, y, (width - 24) / 2, 26, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(170, 120, 10);
  doc.text((company.legal_name || company.trade_name || company.name || '— COMPANY NOT CONFIGURED —').toUpperCase(), 13, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text(company.address_line1 || '', 13, y + 11);
  doc.text([company.city, company.state_name, company.pincode].filter(Boolean).join(', '), 13, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.text(`${company.gstin ? `GSTIN: ${company.gstin}` : 'GSTIN: — not configured —'} | ${company.state_code ? `State Code: ${company.state_code}${company.state_name ? ' - ' + company.state_name : ''}` : 'State Code: —'}`, 13, y + 20);

  const rightX = 10 + (width - 24) / 2 + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text(`Bill No: ${voucher.bill_no || MISSING}`, rightX, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Vendor Inv No: ${voucher.vendor_inv_no || MISSING}`, rightX, y + 11);
  doc.text(`Bill Date: ${voucher.bill_date || new Date().toLocaleDateString('en-IN')}`, rightX, y + 15);
  doc.text(`Place of Supply: ${voucher.place_of_supply || MISSING}`, rightX, y + 20);

  y += 30;

  // Vendor Box
  doc.setFillColor(253, 251, 247);
  doc.rect(10, y, width - 20, 20, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text('VENDOR / SUPPLIER (SUNDRY CREDITORS):', 13, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(voucher.vendor_name || MISSING, 13, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(voucher.address_line1 || MISSING, 13, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.text(`GSTIN: ${voucher.vendor_gstin || 'Unregistered / Exempt'}`, width - 75, y + 10);

  y += 24;

  // Items Table — Cream Headers
  // No invented item. With none this printed "Emerald Gemstone Lot, HSN
  // 71131910, 10 g, 3,000" on a statutory purchase voucher.
  const items: any[] = Array.isArray(voucher.items) && voucher.items.length ? voucher.items : [];

  const tableBody = items.length === 0
    ? [[{ content: 'LINE ITEMS NOT AVAILABLE — reopen the bill and export again.', colSpan: 7, styles: { halign: 'center', fontStyle: 'italic' } }]]
    : items.map((item: any, idx: number) => [
    (idx + 1).toString(),
    item.material_name || item.description || MISSING,
    item.hsn_sac_code || MISSING,
    (item.quantity || 1).toString(),
    `${item.gross_weight || 0} gm`,
    `${item.net_weight || 0} gm`,
    formatPdfMoney(item.rate || 0),
    formatPdfMoney(item.amount || item.material_value || 0)
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Item Description', 'HSN/SAC', 'Qty', 'Gross Wt', 'Net Wt', 'Rate', 'Taxable Amount']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [245, 238, 222], textColor: [40, 40, 40], fontSize: 8, fontStyle: 'bold', halign: 'center', lineWidth: 0.2, lineColor: [210, 200, 180] },
    bodyStyles: { fontSize: 8, textColor: [40, 40, 40], lineWidth: 0.2, lineColor: [230, 225, 215] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 54 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'center', cellWidth: 12 },
      4: { halign: 'right', cellWidth: 20 },
      5: { halign: 'right', cellWidth: 20 },
      6: { halign: 'right', cellWidth: 28 },
      7: { halign: 'right', cellWidth: 28 }
    },
    margin: { left: 10, right: 10 }
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Totals Box
  doc.setFillColor(253, 251, 247);
  doc.rect(width - 95, y, 85, 28, 'FD');
  let ty = y + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Subtotal Taxable Value:', width - 92, ty);
  doc.text(formatPdfMoney(voucher.subtotal_value || 3000), width - 13, ty, { align: 'right' });
  ty += 5;

  doc.text('CGST Input Tax (1.5%):', width - 92, ty);
  doc.text(formatPdfMoney(voucher.cgst_amount || 3.75), width - 13, ty, { align: 'right' });
  ty += 5;

  doc.text('SGST Input Tax (1.5%):', width - 92, ty);
  doc.text(formatPdfMoney(voucher.sgst_amount || 3.75), width - 13, ty, { align: 'right' });
  ty += 5;

  doc.line(width - 92, ty - 1, width - 13, ty - 1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(170, 120, 10);
  doc.text('Grand Total Payable:', width - 92, ty + 3);
  doc.text(formatPdfMoney(voucher.grand_total || 3007.5), width - 13, ty + 3, { align: 'right' });

  y += 34;

  doc.line(10, y, width - 10, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('1. Inward stock verified against physical weighment & assay.', 10, y);
  doc.text('2. Input Tax Credit (ITC) claimed under CGST Section 16(2).', 10, y + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text(`For ${company.legal_name || company.trade_name || company.name || '—'}`, width - 10, y, { align: 'right' });
  doc.text('Authorized Signatory', width - 10, y + 10, { align: 'right' });

  const filename = `Purchase_Voucher_${voucher.bill_no || 'PI'}.pdf`;
  if (action === 'download') {
    doc.save(filename);
  } else {
    window.open(doc.output('bloburl'), '_blank');
  }
};


// ─── 3. PARTY SUB-LEDGER ACCOUNT STATEMENT [S44AA] ───────────────────────────
export const generatePartyLedgerPDF = (party: any, entries: any[], fromDate: string, toDate: string, action: 'download' | 'print' = 'download') => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  let y = 10;

  // Gold Header Accent
  doc.setFillColor(212, 168, 67);
  doc.rect(10, y, width - 20, 2.5, 'F');
  y += 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(30, 30, 30);
  doc.text('PARTY SUB-LEDGER ACCOUNT STATEMENT', width / 2, y, { align: 'center' });
  y += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`[S44AA Compliant] Statement Period: ${fromDate} to ${toDate}`, width / 2, y, { align: 'center' });
  y += 7.5;

  // Party Header Box
  doc.setFillColor(253, 251, 247);
  doc.rect(10, y, width - 20, 20, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(party.name || 'Party Sub-Ledger Account', 13, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(`GSTIN: ${party.gstin || 'Unregistered / Exempt'}`, 13, y + 12);
  doc.text(`PAN: ${party.pan || 'N/A'}`, 70, y + 12);
  doc.text(`Credit Limit: ${party.creditLimit ? formatPdfMoney(party.creditLimit) : '—'}`, 130, y + 12);

  y += 24;

  const tableBody = entries.map((e: any) => [
    e.date || '—',
    e.voucher_type || '—',
    e.voucher_no || e.bill_ref || '—',
    e.particulars || 'Journal Line Entry',
    e.debit > 0 ? formatPdfMoney(e.debit) : '—',
    e.credit > 0 ? formatPdfMoney(e.credit) : '—',
    formatPdfMoney(e.running_balance || 0)
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Voucher Type', 'Voucher No', 'Particulars', 'Debit', 'Credit', 'Running Balance']],
    body: [
      ['—', 'Opening Balance', '—', 'Opening Ledger Balance', '—', '—', formatPdfMoney(0)],
      ...tableBody
    ],
    theme: 'grid',
    headStyles: { fillColor: [245, 238, 222], textColor: [40, 40, 40], fontSize: 8, fontStyle: 'bold', halign: 'center', lineWidth: 0.2, lineColor: [210, 200, 180] },
    bodyStyles: { fontSize: 8, textColor: [40, 40, 40], lineWidth: 0.2, lineColor: [230, 225, 215] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 20 },
      1: { halign: 'center', cellWidth: 24 },
      2: { halign: 'center', cellWidth: 30 },
      3: { cellWidth: 50 },
      4: { halign: 'right', cellWidth: 22 },
      5: { halign: 'right', cellWidth: 22 },
      6: { halign: 'right', cellWidth: 22 }
    },
    margin: { left: 10, right: 10 }
  });

  const filename = `Party_Ledger_Statement_${party.name || 'Account'}.pdf`;
  if (action === 'download') {
    doc.save(filename);
  } else {
    window.open(doc.output('bloburl'), '_blank');
  }
};


// ─── 4. APPROVAL MEMO / JANGAD ───────────────────────────────────────────────
// Goods sent on approval. Not a tax invoice and not a supply: no GST is
// charged and title stays with the sender until a tax invoice is raised for
// whatever the party keeps. The memo is the record of what went out, to whom,
// at what value, and by when it is due back.
export const generateApprovalMemoPDF = (memo: any, action: 'download' | 'print' = 'download', companyArg?: any) => {
  const company = companyArg || memo.company || {};
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  let y = 10;

  const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString('en-IN') : MISSING);
  const fmtQty = (q: any) => {
    const n = typeof q === 'number' ? q : parseFloat(q || '0');
    return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  };
  const fmtWt = (w: any) => (w === null || w === undefined || w === '' ? '—' : `${parseFloat(w).toFixed(3)} g`);

  // Gold top accent
  doc.setFillColor(212, 168, 67);
  doc.rect(10, y, width - 20, 2.5, 'F');
  y += 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text('APPROVAL MEMO (JANGAD)', width / 2, y, { align: 'center' });
  y += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('Goods sent on approval — not a tax invoice, not a supply. No GST charged.', width / 2, y, { align: 'center' });
  y += 7.5;

  // Sender (left) & memo meta (right)
  doc.setLineWidth(0.3);
  doc.setDrawColor(210, 200, 180);
  doc.setFillColor(253, 251, 247);
  doc.rect(10, y, (width - 24) / 2, 28, 'FD');
  doc.rect(10 + (width - 24) / 2 + 4, y, (width - 24) / 2, 28, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(170, 120, 10);
  doc.text((company.legal_name || company.trade_name || company.name || '— COMPANY NOT CONFIGURED —').toUpperCase(), 13, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text(company.address_line1 || '', 13, y + 11);
  doc.text([company.city, company.state_name, company.pincode].filter(Boolean).join(', '), 13, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.text(company.gstin ? `GSTIN: ${company.gstin}` : 'GSTIN: — not configured —', 13, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(company.phone ? `Phone: ${company.phone}` : '', 13, y + 24);

  const rightX = 10 + (width - 24) / 2 + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text(`Memo No: ${memo.memo_no || MISSING}`, rightX, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text(`Memo Date: ${fmtDate(memo.memo_date)}`, rightX, y + 11);
  doc.text(`Due Back By: ${fmtDate(memo.due_date)}`, rightX, y + 15);
  doc.text(`Status: ${String(memo.status || 'Open').replace('_', ' ')}`, rightX, y + 20);
  doc.text(`Financial Year: ${memo.fiscal_year || '—'}`, rightX, y + 24);

  y += 32;

  // Party box
  doc.setFillColor(253, 251, 247);
  doc.rect(10, y, width - 20, 22, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text('SENT ON APPROVAL TO:', 13, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(memo.party_name || MISSING, 13, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  const partyAddr = [memo.party_address1, memo.party_address2, memo.party_city, memo.party_state_name, memo.party_pincode]
    .filter(Boolean)
    .join(', ') || MISSING;
  doc.text(partyAddr, 13, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.text(`GSTIN: ${memo.party_gstin || 'Unregistered'}`, width - 75, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(memo.party_phone ? `Phone: ${memo.party_phone}` : '', width - 75, y + 15);

  y += 26;

  // Lines: the stored memo lines, never derived client-side.
  const lines: any[] = Array.isArray(memo.lines) && memo.lines.length ? memo.lines : [];
  const tableBody = lines.length === 0
    ? [[{ content: 'LINE ITEMS NOT AVAILABLE — reopen the memo and export again.', colSpan: 9, styles: { halign: 'center', fontStyle: 'italic' } }]]
    : lines.map((l: any, i: number) => {
        const qty = parseFloat(l.quantity || 0);
        const rate = parseFloat(l.rate || 0);
        const value = l.value !== undefined && l.value !== null ? parseFloat(l.value) : qty * rate;
        const outstanding = l.outstanding_quantity !== undefined && l.outstanding_quantity !== null
          ? parseFloat(l.outstanding_quantity)
          : qty - parseFloat(l.quantity_returned || 0) - parseFloat(l.quantity_invoiced || 0);
        return [
          (i + 1).toString(),
          [l.material_code, l.description || l.material_name].filter(Boolean).join(' — ') || MISSING,
          l.hsn_code || '—',
          `${fmtQty(qty)}${l.uom ? ' ' + l.uom : ''}`,
          fmtWt(l.gross_weight),
          fmtWt(l.net_weight),
          formatPdfMoney(rate),
          formatPdfMoney(value),
          fmtQty(outstanding),
        ];
      });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Item / Description', 'HSN', 'Qty', 'Gross Wt', 'Net Wt', 'Rate', 'Approval Value', 'Still Out']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [245, 238, 222],
      textColor: [40, 40, 40],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
      lineWidth: 0.2,
      lineColor: [210, 200, 180],
    },
    bodyStyles: { fontSize: 8, textColor: [40, 40, 40], lineWidth: 0.2, lineColor: [230, 225, 215] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 52 },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'right', cellWidth: 18 },
      4: { halign: 'right', cellWidth: 18 },
      5: { halign: 'right', cellWidth: 18 },
      6: { halign: 'right', cellWidth: 22 },
      7: { halign: 'right', cellWidth: 24 },
      8: { halign: 'right', cellWidth: 14 },
    },
    margin: { left: 10, right: 10 },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Terms (left) & totals (right)
  const totalQty = lines.reduce((s: number, l: any) => s + parseFloat(l.quantity || 0), 0);
  const totalValue = memo.total_value !== undefined && memo.total_value !== null
    ? parseFloat(memo.total_value)
    : lines.reduce((s: number, l: any) => s + parseFloat(l.value || 0), 0);
  const outstandingValue = memo.outstanding_value !== undefined && memo.outstanding_value !== null
    ? parseFloat(memo.outstanding_value)
    : lines.reduce((s: number, l: any) => s + parseFloat(l.outstanding_value || 0), 0);

  doc.setLineWidth(0.3);
  doc.setDrawColor(210, 200, 180);
  doc.setFillColor(253, 251, 247);
  doc.rect(10, y, 95, 34, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text('TERMS OF APPROVAL:', 13, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(7.5);
  doc.text('Goods sent on approval only. Title does not pass until invoiced.', 13, y + 11);
  doc.text(`Goods to be returned or approved on or before ${fmtDate(memo.due_date)}.`, 13, y + 16);
  doc.text("Goods remain at the receiver's risk while in their custody.", 13, y + 21);
  doc.text('Values are for identification and insurance; GST applies on the tax invoice only.', 13, y + 26);
  if (memo.narration) {
    doc.text(String(memo.narration).slice(0, 90), 13, y + 31);
  }

  doc.setFillColor(253, 251, 247);
  doc.rect(110, y, width - 120, 34, 'FD');
  let ty = y + 6;
  doc.setFontSize(8);
  doc.text('Total Quantity:', 113, ty);
  doc.text(fmtQty(memo.total_quantity ?? totalQty), width - 13, ty, { align: 'right' });
  ty += 5;
  doc.text('Total Approval Value:', 113, ty);
  doc.text(formatPdfMoney(totalValue), width - 13, ty, { align: 'right' });
  ty += 5;
  doc.text('Value Still Out:', 113, ty);
  doc.text(formatPdfMoney(outstandingValue), width - 13, ty, { align: 'right' });
  ty += 5;
  doc.setLineWidth(0.4);
  doc.line(113, ty - 1, width - 13, ty - 1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(170, 120, 10);
  doc.text('Memo Value (no GST):', 113, ty + 3);
  doc.text(formatPdfMoney(totalValue), width - 13, ty + 3, { align: 'right' });

  y += 40;

  // Signature boxes
  doc.setLineWidth(0.2);
  doc.setDrawColor(210, 200, 180);
  const boxW = (width - 20 - 8) / 3;
  const labels = ['Prepared By', "Receiver's Signature & Stamp", `For ${company.legal_name || company.trade_name || company.name || '—'}`];
  const subs = ['', 'Received the above goods on approval', 'Authorised Signatory'];
  labels.forEach((label, i) => {
    const bx = 10 + i * (boxW + 4);
    doc.rect(bx, y, boxW, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 30, 30);
    doc.text(label, bx + boxW / 2, y + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    if (subs[i]) doc.text(subs[i], bx + boxW / 2, y + 21, { align: 'center' });
  });

  y += 30;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Goods sent on approval only. Title does not pass until invoiced.', width / 2, y, { align: 'center' });

  const filename = `Approval_Memo_${(memo.memo_no || 'APM').replace(/\//g, '-')}.pdf`;
  if (action === 'download') {
    doc.save(filename);
  } else {
    window.open(doc.output('bloburl'), '_blank');
  }
};

// ─── 5. JOB WORK DELIVERY CHALLAN [CGST s.143, Rule 45, Rule 55] ──────────────
// Goods to a karigar are not a supply; they travel on a delivery challan with
// the s.143 declaration. Lines are the challan's stored lines (GET
// /job-work/challans/{id}), never derived here.
export const generateJobWorkChallanPDF = (challan: any, action: 'download' | 'print' = 'download', companyArg?: any) => {
  const company = companyArg || challan.company || {};
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  let y = 10;

  const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString('en-IN') : MISSING);
  const fmtQty = (q: any) => {
    const n = typeof q === 'number' ? q : parseFloat(q || '0');
    return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  };
  const fmtWt = (w: any) => (w === null || w === undefined || w === '' ? '—' : `${parseFloat(w).toFixed(3)} g`);
  const fmtPurity = (p: any) => (p === null || p === undefined || p === '' ? '—' : `${(parseFloat(p) * 100).toFixed(1)}%`);

  doc.setFillColor(212, 168, 67);
  doc.rect(10, y, width - 20, 2.5, 'F');
  y += 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text('DELIVERY CHALLAN — JOB WORK', width / 2, y, { align: 'center' });
  y += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('Issued under Rule 45 and Rule 55 of the CGST Rules, 2017 for goods sent for job work under section 143. Not a tax invoice. No GST charged.', width / 2, y, { align: 'center', maxWidth: width - 30 });
  y += 7.5;

  // Principal (left) & challan meta (right)
  doc.setLineWidth(0.3);
  doc.setDrawColor(210, 200, 180);
  doc.setFillColor(253, 251, 247);
  doc.rect(10, y, (width - 24) / 2, 28, 'FD');
  doc.rect(10 + (width - 24) / 2 + 4, y, (width - 24) / 2, 28, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(170, 120, 10);
  doc.text((company.legal_name || company.trade_name || company.name || '— COMPANY NOT CONFIGURED —').toUpperCase(), 13, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text('PRINCIPAL (SENDER)', 13, y + 2.5);
  doc.text(company.address_line1 || '', 13, y + 11);
  doc.text([company.city, company.state_name, company.pincode].filter(Boolean).join(', '), 13, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.text(company.gstin ? `GSTIN: ${company.gstin}` : 'GSTIN: — not configured —', 13, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(company.state_code ? `State Code: ${company.state_code}` : '', 13, y + 24);

  const rightX = 10 + (width - 24) / 2 + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text(`Challan No: ${challan.challan_no || MISSING}`, rightX, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text(`Challan Date: ${fmtDate(challan.challan_date)}`, rightX, y + 11);
  doc.text(`Return Due By: ${fmtDate(challan.return_due_date)}`, rightX, y + 15);
  doc.text(`Goods: ${challan.goods_type === 'CapitalGoods' ? 'Capital goods (3 years)' : 'Inputs (1 year)'}`, rightX, y + 20);
  doc.text(`Place of Supply: ${challan.place_of_supply || MISSING}  ·  ${challan.is_inter_state ? 'Inter-state' : 'Intra-state'}`, rightX, y + 24);

  y += 32;

  // Job worker box
  doc.setFillColor(253, 251, 247);
  doc.rect(10, y, width - 20, 24, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text('JOB WORKER (KARIGAR) — CONSIGNEE:', 13, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(challan.job_worker_name || MISSING, 13, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  const workerAddr = [challan.job_worker_address1, challan.job_worker_address2, challan.job_worker_city, challan.job_worker_state_name, challan.job_worker_pincode]
    .filter(Boolean)
    .join(', ') || MISSING;
  doc.text(workerAddr, 13, y + 15, { maxWidth: 110 });
  doc.text(challan.nature_of_work ? `Nature of work: ${challan.nature_of_work}` : 'Nature of work: —', 13, y + 20);
  doc.setFont('helvetica', 'bold');
  doc.text(`GSTIN: ${challan.job_worker_gstin || 'Unregistered'}`, width - 75, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(challan.job_worker_pan ? `PAN: ${challan.job_worker_pan}` : '', width - 75, y + 15);
  doc.text(challan.job_worker_phone ? `Phone: ${challan.job_worker_phone}` : '', width - 75, y + 20);

  y += 28;

  const lines: any[] = Array.isArray(challan.lines) && challan.lines.length ? challan.lines : [];
  const tableBody = lines.length === 0
    ? [[{ content: 'LINE ITEMS NOT AVAILABLE — reopen the challan and print again.', colSpan: 9, styles: { halign: 'center', fontStyle: 'italic' } }]]
    : lines.map((l: any, i: number) => [
        (i + 1).toString(),
        [l.material_code, l.description || l.material_name].filter(Boolean).join(' — ') || MISSING,
        l.hsn_code || '—',
        `${fmtQty(l.quantity_sent)}${l.uom ? ' ' + l.uom : ''}`,
        fmtWt(l.gross_weight),
        fmtWt(l.net_weight),
        fmtPurity(l.purity),
        formatPdfMoney(l.taxable_value || 0),
        fmtQty(l.quantity_outstanding ?? l.quantity_sent),
      ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Description of goods', 'HSN', 'Qty', 'Gross Wt', 'Net Wt', 'Purity', 'Value (no GST)', 'Still Out']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [245, 238, 222], textColor: [40, 40, 40], fontSize: 8, fontStyle: 'bold', halign: 'center', lineWidth: 0.2, lineColor: [210, 200, 180] },
    bodyStyles: { fontSize: 8, textColor: [40, 40, 40], lineWidth: 0.2, lineColor: [230, 225, 215] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 50 },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'right', cellWidth: 18 },
      4: { halign: 'right', cellWidth: 18 },
      5: { halign: 'right', cellWidth: 18 },
      6: { halign: 'right', cellWidth: 14 },
      7: { halign: 'right', cellWidth: 26 },
      8: { halign: 'right', cellWidth: 16 },
    },
    margin: { left: 10, right: 10 },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  const totalQty = lines.reduce((s: number, l: any) => s + parseFloat(l.quantity_sent || 0), 0);
  const totalValue = challan.total_value !== undefined && challan.total_value !== null
    ? parseFloat(challan.total_value)
    : lines.reduce((s: number, l: any) => s + parseFloat(l.taxable_value || 0), 0);

  // Declaration (left) & totals (right)
  doc.setLineWidth(0.3);
  doc.setDrawColor(210, 200, 180);
  doc.setFillColor(253, 251, 247);
  doc.rect(10, y, 118, 40, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text('DECLARATION UNDER SECTION 143 OF THE CGST ACT, 2017:', 13, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(7);
  const declaration = [
    'The goods described above are sent for job work without payment of tax under section 143 of the CGST Act, 2017 and',
    'Rule 45 of the CGST Rules, 2017. Ownership of the goods remains with the principal at all times.',
    `The inputs are to be returned to the principal, or supplied from the job worker's premises with the principal's`,
    `authority, within the period prescribed in section 143(1) (on or before ${fmtDate(challan.return_due_date)}). If not so`,
    'returned, the goods shall be deemed to have been supplied by the principal to the job worker on the date they were',
    'sent out, and tax with interest shall be payable accordingly (section 143(3)). This challan will be reported in FORM ITC-04.',
  ];
  declaration.forEach((line, i) => doc.text(line, 13, y + 10 + i * 4.2));
  if (challan.remarks) {
    doc.setFont('helvetica', 'italic');
    doc.text(String(challan.remarks).slice(0, 120), 13, y + 37);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFillColor(253, 251, 247);
  doc.rect(132, y, width - 142, 40, 'FD');
  let ty = y + 6;
  doc.setFontSize(8);
  doc.setTextColor(40, 40, 40);
  doc.text('Total Quantity:', 135, ty);
  doc.text(fmtQty(challan.total_quantity ?? totalQty), width - 13, ty, { align: 'right' });
  ty += 5;
  doc.text('Lines:', 135, ty);
  doc.text(String(lines.length), width - 13, ty, { align: 'right' });
  ty += 5;
  doc.text('Taxable value (for ITC-04):', 135, ty);
  doc.text(formatPdfMoney(totalValue), width - 13, ty, { align: 'right' });
  ty += 5;
  doc.text('GST charged:', 135, ty);
  doc.text('NIL — not a supply', width - 13, ty, { align: 'right' });
  ty += 6;
  doc.setLineWidth(0.4);
  doc.line(135, ty - 1, width - 13, ty - 1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(170, 120, 10);
  doc.text('Challan Value:', 135, ty + 3);
  doc.text(formatPdfMoney(totalValue), width - 13, ty + 3, { align: 'right' });

  y += 46;

  doc.setLineWidth(0.2);
  doc.setDrawColor(210, 200, 180);
  const boxW = (width - 20 - 8) / 3;
  const labels = ['Prepared By', "Job Worker's Signature & Stamp", `For ${company.legal_name || company.trade_name || company.name || '—'}`];
  const subs = ['', 'Received the above goods for job work', 'Authorised Signatory'];
  labels.forEach((label, i) => {
    const bx = 10 + i * (boxW + 4);
    doc.rect(bx, y, boxW, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 30, 30);
    doc.text(label, bx + boxW / 2, y + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    if (subs[i]) doc.text(subs[i], bx + boxW / 2, y + 21, { align: 'center' });
  });

  y += 30;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Triplicate: Original for consignee · Duplicate for transporter · Triplicate for consignor (Rule 55(2)).', width / 2, y, { align: 'center' });

  const filename = `Job_Work_Challan_${(challan.challan_no || 'JW').replace(/\//g, '-')}.pdf`;
  if (action === 'download') {
    doc.save(filename);
  } else {
    window.open(doc.output('bloburl'), '_blank');
  }
};
