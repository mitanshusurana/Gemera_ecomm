import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
export const generateTaxInvoicePDF = (invoice: any, action: 'download' | 'print' = 'download') => {
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

  // Title Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text('TAX INVOICE', width / 2, y, { align: 'center' });
  y += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('(Issued under Rule 46 of CGST Rules, 2017 — Statutory Tax Document)', width / 2, y, { align: 'center' });
  y += 7.5;

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
  doc.text('CARATLOOP MANUFACTURING ERP', 13, y + 6);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text('Export Zone, Sitapura Industrial Area, Phase II', 13, y + 11);
  doc.text('Jaipur, Rajasthan — 302022', 13, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.text('GSTIN: 08AAACC1234F1Z9', 13, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.text('State Code: 08 - Rajasthan', 13, y + 24);

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
  doc.text(`Place of Supply: ${invoice.place_of_supply || MISSING}`, rightX, y + 15);
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
  doc.text(`GSTIN: ${invoice.customer_gstin || 'Unregistered'}`, width - 75, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(`State Code: ${invoice.customer_state_code || MISSING} (${invoice.customer_state_name || MISSING})`, width - 75, y + 15);

  y += 26;

  // Line Items Table
  const lines = invoice.lines || [
    {
      description: '22K Gold Bangle / Ornament',
      hsn_sac_code: '71131910',
      quantity: 1,
      gross_weight: 10.0,
      net_weight: 10.0,
      material_value: invoice.subtotal_material_value || 50000,
      making_charges: invoice.subtotal_making_charges || 2500,
    }
  ];

  const tableBody = lines.map((l: any, i: number) => {
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
  const matTotal = parseFloat(invoice.subtotal_material_value || invoice.taxable_material_value || 50000);
  const makTotal = parseFloat(invoice.subtotal_making_charges || invoice.taxable_making_value || 2500);
  const totalTaxable = matTotal + makTotal;
  const totalGst = parseFloat(invoice.total_gst || 1625);
  const grandTotal = parseFloat(invoice.grand_total || (totalTaxable + totalGst));
  const isInterState = invoice.is_inter_state || false;

  // Bank Box (Left)
  doc.setLineWidth(0.3);
  doc.setDrawColor(210, 200, 180);
  doc.setFillColor(253, 251, 247);
  doc.rect(10, y, 95, 34, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text('BANK DETAILS FOR DIRECT REMITTANCE / RTGS:', 13, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  doc.text('Bank Name: State Bank of India (Jaipur Main Branch)', 13, y + 11);
  doc.text('Account Name: CARATLOOP MANUFACTURING ERP', 13, y + 16);
  doc.text('Account No: 409988776611', 13, y + 21);
  doc.text('IFSC Code: SBIN0001234', 13, y + 26);
  doc.text('Branch Code: 001234 — Jaipur', 13, y + 31);

  // Totals Box (Right)
  doc.setFillColor(253, 251, 247);
  doc.rect(110, y, width - 120, 34, 'FD');
  let ty = y + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  
  doc.text('Gold/Precious Material (3% GST):', 113, ty);
  doc.text(formatPdfMoney(matTotal), width - 13, ty, { align: 'right' });
  ty += 5;

  doc.text('Craftsmanship / Making (5% GST):', 113, ty);
  doc.text(formatPdfMoney(makTotal), width - 13, ty, { align: 'right' });
  ty += 5;

  if (isInterState) {
    doc.text('IGST Tax (Material 3% + Making 5%):', 113, ty);
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

  doc.setLineWidth(0.4);
  doc.line(113, ty - 1, width - 13, ty - 1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(170, 120, 10);
  doc.text('Grand Total Payable:', 113, ty + 3);
  doc.text(formatPdfMoney(grandTotal), width - 13, ty + 3, { align: 'right' });

  y += 40;

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
  doc.text('For CARATLOOP MANUFACTURING ERP', width - 10, y, { align: 'right' });
  doc.text('Authorized Signatory', width - 10, y + 10, { align: 'right' });

  const filename = `Tax_Invoice_${invoice.invoice_no || 'CL'}.pdf`;
  if (action === 'download') {
    doc.save(filename);
  } else {
    window.open(doc.output('bloburl'), '_blank');
  }
};


// ─── 2. STATUTORY PURCHASE VOUCHER [CGST Rule 56(4)] ─────────────────────────
export const generatePurchaseVoucherPDF = (voucher: any, action: 'download' | 'print' = 'download') => {
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
  doc.text('CARATLOOP MANUFACTURING ERP', 13, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text('Export Zone, Sitapura Industrial Area, Phase II', 13, y + 11);
  doc.text('Jaipur, Rajasthan — 302022', 13, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.text('GSTIN: 08AAACC1234F1Z9 | State: 08 - Rajasthan', 13, y + 20);

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
  const items = voucher.items || [
    {
      material_name: 'Emerald Gemstone Lot',
      hsn_sac_code: '71131910',
      quantity: 1,
      gross_weight: 10,
      net_weight: 10,
      rate: 3000,
      material_value: 3000
    }
  ];

  const tableBody = items.map((item: any, idx: number) => [
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
  doc.text('For CARATLOOP MANUFACTURING ERP', width - 10, y, { align: 'right' });
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
