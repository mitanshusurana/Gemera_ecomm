package com.jewelry.backend.service;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.jewelry.backend.entity.RepairJob;
import com.jewelry.backend.util.IndianMoney;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.time.format.DateTimeFormatter;
import java.util.EnumMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * A5 repair job card with OpenPDF (the library InvoicePdfRenderer and
 * CertificateService already use): the store copy on top, a dashed cut line,
 * and a tear-off customer receipt stub with the tracking URL as a QR code
 * (ZXing) and in plain text. Amounts print as "Rs." because the built-in
 * Helvetica has no rupee glyph.
 */
@Component
public class RepairJobCardRenderer {

    private static final Logger LOGGER = Logger.getLogger(RepairJobCardRenderer.class.getName());
    private static final int QR_PIXELS = 220;

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd MMM yyyy");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd MMM yyyy, HH:mm");

    private static final Font BRAND = new Font(Font.HELVETICA, 13, Font.BOLD);
    private static final Font TITLE = new Font(Font.HELVETICA, 10, Font.BOLD, new Color(0x8a, 0x6d, 0x1f));
    private static final Font JOB_NO = new Font(Font.HELVETICA, 16, Font.BOLD);
    private static final Font LABEL = new Font(Font.HELVETICA, 7, Font.BOLD, new Color(0x6e, 0x6e, 0x73));
    private static final Font BODY = new Font(Font.HELVETICA, 8.5f);
    private static final Font BODY_BOLD = new Font(Font.HELVETICA, 8.5f, Font.BOLD);
    private static final Font SMALL = new Font(Font.HELVETICA, 6.5f, Font.NORMAL, new Color(0x6e, 0x6e, 0x73));

    /** Store identity printed on both halves. */
    public record Branding(String storeName, String storePhone, String storeAddress) {
    }

    public byte[] render(RepairJob job, Branding branding, String trackingUrl) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A5, 28, 28, 24, 24);
            PdfWriter writer = PdfWriter.getInstance(document, out);
            document.open();

            // ----- store copy -----
            document.add(header(branding, "REPAIR JOB CARD", job));
            document.add(detailsTable(job, true));

            Paragraph terms = new Paragraph(
                    "Terms: the piece is accepted on the description above and the declared value stated by the customer. "
                    + "Work starts only after the estimate is approved. Uncollected items after 90 days from the ready date "
                    + "are stored at the customer's risk. Please bring this card or the receipt stub to collect the piece.",
                    SMALL);
            terms.setSpacingBefore(6);
            document.add(terms);

            Paragraph signatures = new Paragraph("\nReceived by: ____________________          Customer signature: ____________________", BODY);
            signatures.setSpacingBefore(10);
            document.add(signatures);

            // ----- cut line -----
            float y = writer.getVerticalPosition(true) - 14;
            PdfContentByte cb = writer.getDirectContent();
            cb.saveState();
            cb.setLineDash(4f, 3f, 0f);
            cb.setLineWidth(0.6f);
            cb.setColorStroke(new Color(0x9a, 0x9a, 0x9a));
            cb.moveTo(document.left(), y);
            cb.lineTo(document.right(), y);
            cb.stroke();
            cb.restoreState();

            Paragraph cut = new Paragraph("- - - - - - - - - - - - - - - - - - - -  cut here  - - - - - - - - - - - - - - - - - - - -", SMALL);
            cut.setAlignment(Element.ALIGN_CENTER);
            cut.setSpacingBefore(16);
            cut.setSpacingAfter(8);
            document.add(cut);

            // ----- customer stub -----
            document.add(header(branding, "CUSTOMER RECEIPT", job));
            document.add(detailsTable(job, false));

            Phrase track = new Phrase();
            track.add(new Phrase("Track this job online: ", LABEL));
            track.add(new Phrase(trackingUrl, BODY_BOLD));
            track.add(new Phrase("\nScan the code or enter the address. You will be asked for the phone number given at the counter; "
                    + "the estimate can be approved and paid from the same page.", SMALL));

            PdfPTable trackTable = new PdfPTable(new float[]{78, 22});
            trackTable.setWidthPercentage(100);
            trackTable.setSpacingBefore(6);
            PdfPCell textCell = borderless(track, Element.ALIGN_LEFT);
            textCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
            trackTable.addCell(textCell);
            Image qr = qrCode(trackingUrl);
            PdfPCell qrCell;
            if (qr != null) {
                qr.scaleToFit(64, 64);
                qrCell = new PdfPCell(qr, false);
                qrCell.setHorizontalAlignment(Element.ALIGN_RIGHT);
            } else {
                qrCell = borderless(new Phrase("", SMALL), Element.ALIGN_RIGHT);
            }
            qrCell.setBorder(Rectangle.NO_BORDER);
            qrCell.setPadding(0);
            trackTable.addCell(qrCell);
            document.add(trackTable);

            document.close();
            return out.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Error generating repair job card", e);
        }
    }

    private PdfPTable header(Branding branding, String title, RepairJob job) {
        PdfPTable table = new PdfPTable(new float[]{58, 42});
        table.setWidthPercentage(100);
        table.setSpacingAfter(6);

        Phrase left = new Phrase();
        left.add(new Phrase(nz(branding.storeName(), "Caratloop") + "\n", BRAND));
        left.add(new Phrase(title + "\n", TITLE));
        if (!isBlank(branding.storeAddress())) left.add(new Phrase(branding.storeAddress() + "\n", SMALL));
        if (!isBlank(branding.storePhone())) left.add(new Phrase("Tel " + branding.storePhone(), SMALL));
        table.addCell(borderless(left, Element.ALIGN_LEFT));

        Phrase right = new Phrase();
        right.add(new Phrase(job.getJobNumber() + "\n", JOB_NO));
        right.add(new Phrase("Booked " + (job.getCreatedAt() == null ? "-" : job.getCreatedAt().format(DATE_TIME)) + "\n", BODY));
        right.add(new Phrase("Status: " + job.getStatus().name().replace('_', ' '), BODY_BOLD));
        table.addCell(borderless(right, Element.ALIGN_RIGHT));
        return table;
    }

    private PdfPTable detailsTable(RepairJob job, boolean storeCopy) {
        PdfPTable table = new PdfPTable(new float[]{27, 73});
        table.setWidthPercentage(100);

        row(table, "Customer", job.getCustomerName() + "\n" + nz(job.getPhone(), "") + (isBlank(job.getEmail()) ? "" : "  |  " + job.getEmail()));
        String item = RepairNotificationService.itemLabel(job.getItemType()) + " - " + nz(job.getItemDescription(), "");
        if (!isBlank(job.getRingSize()) || !isBlank(job.getTargetSize())) {
            item += "\nSize " + nz(job.getRingSize(), "?") + (isBlank(job.getTargetSize()) ? "" : "  ->  " + job.getTargetSize());
        }
        row(table, "Item", item);
        row(table, "Service", RepairNotificationService.serviceLabel(job.getServiceType()));
        if (storeCopy) {
            row(table, "Problem / instructions", nz(job.getProblemDescription(), "-"));
        }
        row(table, "Declared value", job.getDeclaredValue() == null ? "Not declared" : IndianMoney.rs(job.getDeclaredValue()));
        String estimate = job.getEstimateAmount() == null ? "Quote on assessment" : IndianMoney.rs(job.getEstimateAmount());
        if (storeCopy && !isBlank(job.getEstimateNote())) estimate += "\n" + job.getEstimateNote();
        if (job.getEstimateApprovedAt() != null) estimate += "\nApproved " + job.getEstimateApprovedAt().format(DATE_TIME);
        row(table, "Estimate", estimate);
        row(table, "Promised date", job.getPromisedDate() == null ? "To be confirmed" : job.getPromisedDate().format(DATE));
        if (storeCopy) {
            row(table, "Assigned to", nz(job.getAssignedTo(), "-"));
            if (job.getFinalAmount() != null || job.getPaidAmount() != null) {
                row(table, "Payment", "Bill " + IndianMoney.rs(job.getFinalAmount()) + "   Paid " + IndianMoney.rs(job.getPaidAmount())
                        + (job.getPaymentMode() == null ? "" : "   " + job.getPaymentMode().name())
                        + (isBlank(job.getPaymentReference()) ? "" : "   Ref " + job.getPaymentReference()));
            }
        }
        return table;
    }

    /** QR of the tracking URL; null (card still prints) if encoding fails. */
    private static Image qrCode(String url) {
        if (isBlank(url)) return null;
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
            hints.put(EncodeHintType.MARGIN, 1);
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            BitMatrix matrix = new QRCodeWriter().encode(url, BarcodeFormat.QR_CODE, QR_PIXELS, QR_PIXELS, hints);
            BufferedImage image = MatrixToImageWriter.toBufferedImage(matrix);
            return Image.getInstance(image, null);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Job card QR code could not be rendered: " + e.getMessage());
            return null;
        }
    }

    private static void row(PdfPTable table, String label, String value) {
        PdfPCell l = new PdfPCell(new Phrase(label.toUpperCase(), LABEL));
        l.setBackgroundColor(new Color(0xf5, 0xf5, 0xf7));
        l.setBorderColor(new Color(0xe0, 0xe0, 0xe0));
        l.setPadding(4);
        l.setVerticalAlignment(Element.ALIGN_MIDDLE);
        table.addCell(l);
        PdfPCell v = new PdfPCell(new Phrase(value == null ? "" : value, BODY));
        v.setBorderColor(new Color(0xe0, 0xe0, 0xe0));
        v.setPadding(4);
        table.addCell(v);
    }

    private static PdfPCell borderless(Phrase phrase, int align) {
        PdfPCell cell = new PdfPCell(phrase);
        cell.setBorder(Rectangle.NO_BORDER);
        cell.setHorizontalAlignment(align);
        cell.setPadding(2);
        return cell;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String nz(String s, String fallback) {
        return isBlank(s) ? fallback : s;
    }
}
