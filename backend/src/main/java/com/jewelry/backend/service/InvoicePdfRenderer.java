package com.jewelry.backend.service;

import com.jewelry.backend.entity.Invoice;
import com.jewelry.backend.entity.InvoiceLine;
import com.jewelry.backend.util.AmountInWords;
import com.jewelry.backend.util.GstStateCodes;
import com.jewelry.backend.util.IndianMoney;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;

/**
 * Renders an Invoice as an A4 "TAX INVOICE" PDF with OpenPDF, the same
 * library CertificateService already uses. Amounts print as "Rs." because
 * the built-in Helvetica has no rupee glyph and the project ships no
 * Unicode font.
 */
@Component
public class InvoicePdfRenderer {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd MMM yyyy");

    private static final Font TITLE = new Font(Font.HELVETICA, 16, Font.BOLD);
    private static final Font HEADING = new Font(Font.HELVETICA, 10, Font.BOLD);
    private static final Font BODY = new Font(Font.HELVETICA, 9);
    private static final Font BODY_BOLD = new Font(Font.HELVETICA, 9, Font.BOLD);
    private static final Font SMALL = new Font(Font.HELVETICA, 7.5f);
    private static final Font TABLE_HEAD = new Font(Font.HELVETICA, 7.5f, Font.BOLD);
    private static final Font TABLE_BODY = new Font(Font.HELVETICA, 7.5f);

    public byte[] render(Invoice invoice) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 36, 36, 36, 36);
            PdfWriter.getInstance(document, out);
            document.open();

            Paragraph title = new Paragraph("TAX INVOICE", TITLE);
            title.setAlignment(Element.ALIGN_CENTER);
            title.setSpacingAfter(10);
            document.add(title);

            document.add(headerTable(invoice));
            document.add(partiesTable(invoice));
            document.add(linesTable(invoice));
            document.add(totalsTable(invoice));

            Paragraph words = new Paragraph("Amount in words: " + AmountInWords.inr(invoice.getGrandTotal()), BODY_BOLD);
            words.setSpacingBefore(8);
            document.add(words);

            Paragraph payment = new Paragraph("Payment: " + nz(invoice.getPaymentSummary()), BODY);
            payment.setSpacingBefore(4);
            document.add(payment);

            Paragraph footer = new Paragraph(
                    "This is a computer-generated invoice; no signature required. E&OE.", SMALL);
            footer.setAlignment(Element.ALIGN_CENTER);
            footer.setSpacingBefore(24);
            document.add(footer);

            document.close();
            return out.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Error generating invoice PDF", e);
        }
    }

    /** Seller block on the left, invoice number and date on the right. */
    private PdfPTable headerTable(Invoice invoice) {
        PdfPTable table = new PdfPTable(new float[]{60, 40});
        table.setWidthPercentage(100);
        table.setSpacingAfter(8);

        Phrase seller = new Phrase();
        seller.add(new Phrase(nz(invoice.getSellerLegalName()) + "\n", HEADING));
        if (invoice.getSellerAddress() != null) {
            seller.add(new Phrase(invoice.getSellerAddress() + "\n", BODY));
        }
        seller.add(new Phrase("GSTIN: " + orDash(invoice.getSellerGstin()) + "\n", BODY));
        seller.add(new Phrase("PAN: " + orDash(invoice.getSellerPan()) + "\n", BODY));
        seller.add(new Phrase("State code: " + orDash(invoice.getSellerStateCode())
                + stateName(invoice.getSellerStateCode()), BODY));
        table.addCell(borderless(seller, Element.ALIGN_LEFT));

        Phrase meta = new Phrase();
        meta.add(new Phrase("Invoice No: ", BODY));
        meta.add(new Phrase(nz(invoice.getInvoiceNumber()) + "\n", BODY_BOLD));
        meta.add(new Phrase("Invoice date: ", BODY));
        meta.add(new Phrase((invoice.getInvoiceDate() == null ? "-" : invoice.getInvoiceDate().format(DATE)) + "\n", BODY_BOLD));
        if (invoice.getOrder() != null && invoice.getOrder().getOrderNumber() != null) {
            meta.add(new Phrase("Order: " + invoice.getOrder().getOrderNumber() + "\n", BODY));
        }
        meta.add(new Phrase("Place of supply: " + orDash(invoice.getPlaceOfSupply())
                + stateName(invoice.getPlaceOfSupply()) + "\n", BODY));
        meta.add(new Phrase("Supply type: " + (invoice.isInterState() ? "Inter-state" : "Intra-state"), BODY));
        table.addCell(borderless(meta, Element.ALIGN_RIGHT));
        return table;
    }

    private PdfPTable partiesTable(Invoice invoice) {
        PdfPTable table = new PdfPTable(1);
        table.setWidthPercentage(100);
        table.setSpacingAfter(8);

        Phrase buyer = new Phrase();
        buyer.add(new Phrase("Bill to\n", HEADING));
        buyer.add(new Phrase(nz(invoice.getBuyerName()) + "\n", BODY_BOLD));
        if (invoice.getBuyerAddress() != null) {
            buyer.add(new Phrase(invoice.getBuyerAddress() + "\n", BODY));
        }
        if (invoice.getBuyerGstin() != null) {
            buyer.add(new Phrase("GSTIN: " + invoice.getBuyerGstin() + "\n", BODY));
        }
        if (invoice.getBuyerPan() != null) {
            buyer.add(new Phrase("PAN: " + invoice.getBuyerPan() + "\n", BODY));
        }
        if (invoice.getBuyerStateCode() != null) {
            buyer.add(new Phrase("State code: " + invoice.getBuyerStateCode() + stateName(invoice.getBuyerStateCode()), BODY));
        }
        PdfPCell cell = new PdfPCell(buyer);
        cell.setPadding(6);
        table.addCell(cell);
        return table;
    }

    private PdfPTable linesTable(Invoice invoice) {
        boolean inter = invoice.isInterState();
        float[] widths = inter
                ? new float[]{4, 26, 7, 5, 10, 9, 10, 6, 10, 11}
                : new float[]{4, 24, 7, 5, 9, 8, 10, 6, 9, 9, 10};
        PdfPTable table = new PdfPTable(widths);
        table.setWidthPercentage(100);
        table.setHeaderRows(1);

        head(table, "No");
        head(table, "Description");
        head(table, "HSN/SAC");
        head(table, "Qty");
        head(table, "Rate");
        head(table, "Discount");
        head(table, "Taxable");
        head(table, "GST%");
        if (inter) {
            head(table, "IGST");
        } else {
            head(table, "CGST");
            head(table, "SGST");
        }
        head(table, "Total");

        for (InvoiceLine line : invoice.getLines()) {
            text(table, String.valueOf(line.getLineNo()), Element.ALIGN_CENTER);
            String description = nz(line.getDescription());
            if (line.getSku() != null) {
                description += "\nSKU " + line.getSku();
            }
            text(table, description, Element.ALIGN_LEFT);
            text(table, nz(line.getHsnCode()), Element.ALIGN_CENTER);
            text(table, String.valueOf(line.getQuantity()), Element.ALIGN_CENTER);
            amount(table, line.getUnitPrice());
            amount(table, line.getDiscount());
            amount(table, line.getTaxableValue());
            text(table, percent(line.getGstRate()), Element.ALIGN_RIGHT);
            if (inter) {
                amount(table, line.getIgst());
            } else {
                amount(table, line.getCgst());
                amount(table, line.getSgst());
            }
            amount(table, line.getLineTotal());
        }
        return table;
    }

    private PdfPTable totalsTable(Invoice invoice) {
        PdfPTable table = new PdfPTable(new float[]{70, 30});
        table.setWidthPercentage(45);
        table.setHorizontalAlignment(Element.ALIGN_RIGHT);
        table.setSpacingBefore(8);

        totalRow(table, "Taxable value", invoice.getTaxableValue(), false);
        if (invoice.isInterState()) {
            totalRow(table, "IGST", invoice.getIgst(), false);
        } else {
            totalRow(table, "CGST", invoice.getCgst(), false);
            totalRow(table, "SGST", invoice.getSgst(), false);
        }
        if (invoice.getShipping() != null && invoice.getShipping().signum() != 0) {
            totalRow(table, "Shipping", invoice.getShipping(), false);
        }
        if (invoice.getRoundOff() != null && invoice.getRoundOff().signum() != 0) {
            totalRow(table, "Round off", invoice.getRoundOff(), false);
        }
        totalRow(table, "Grand total", invoice.getGrandTotal(), true);
        return table;
    }

    // ----- cell helpers -----

    private static PdfPCell borderless(Phrase phrase, int align) {
        PdfPCell cell = new PdfPCell(phrase);
        cell.setBorder(Rectangle.NO_BORDER);
        cell.setHorizontalAlignment(align);
        cell.setPadding(2);
        return cell;
    }

    private static void head(PdfPTable table, String label) {
        PdfPCell cell = new PdfPCell(new Phrase(label, TABLE_HEAD));
        cell.setHorizontalAlignment(Element.ALIGN_CENTER);
        cell.setBackgroundColor(new java.awt.Color(235, 235, 235));
        cell.setPadding(4);
        table.addCell(cell);
    }

    private static void text(PdfPTable table, String value, int align) {
        PdfPCell cell = new PdfPCell(new Phrase(value, TABLE_BODY));
        cell.setHorizontalAlignment(align);
        cell.setPadding(3);
        table.addCell(cell);
    }

    private static void amount(PdfPTable table, BigDecimal value) {
        text(table, IndianMoney.format(value), Element.ALIGN_RIGHT);
    }

    private static void totalRow(PdfPTable table, String label, BigDecimal value, boolean bold) {
        Font font = bold ? BODY_BOLD : BODY;
        PdfPCell labelCell = new PdfPCell(new Phrase(label, font));
        labelCell.setHorizontalAlignment(Element.ALIGN_RIGHT);
        labelCell.setPadding(3);
        table.addCell(labelCell);
        PdfPCell valueCell = new PdfPCell(new Phrase(IndianMoney.rs(value), font));
        valueCell.setHorizontalAlignment(Element.ALIGN_RIGHT);
        valueCell.setPadding(3);
        table.addCell(valueCell);
    }

    private static String percent(BigDecimal rate) {
        return rate == null ? "0.00%" : rate.stripTrailingZeros().scale() <= 0
                ? rate.setScale(0, java.math.RoundingMode.HALF_UP).toPlainString() + "%"
                : rate.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString() + "%";
    }

    private static String stateName(String code) {
        String name = GstStateCodes.nameFor(code);
        return name == null ? "" : " (" + name + ")";
    }

    private static String orDash(String s) {
        return s == null || s.isBlank() ? "-" : s;
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
