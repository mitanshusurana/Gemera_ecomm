package com.jewelry.backend.service;

import com.jewelry.backend.entity.Certificate;
import com.jewelry.backend.repository.CertificateRepository;
import com.lowagie.text.Document;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;

@Service
public class CertificateService {

    @Autowired
    private CertificateRepository certificateRepository;

    public Certificate getCertificate(String reportNumber) {
        return certificateRepository.findByReportNumber(reportNumber)
                .orElseThrow(() -> new RuntimeException("Certificate not found"));
    }

    public byte[] downloadCertificate(String reportNumber) {
        Certificate cert = getCertificate(reportNumber);

        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document document = new Document();
            PdfWriter.getInstance(document, out);
            document.open();

            document.add(new Paragraph("Certificate of Authenticity"));
            document.add(new Paragraph("Report Number: " + cert.getReportNumber()));
            document.add(new Paragraph("Lab: " + cert.getLab()));
            document.add(new Paragraph("Date: " + cert.getDateIssued()));
            document.add(new Paragraph("Product: " + cert.getProductName()));
            document.add(new Paragraph("Carat: " + cert.getCarat()));
            document.add(new Paragraph("Color: " + cert.getColor()));
            document.add(new Paragraph("Clarity: " + cert.getClarity()));
            document.add(new Paragraph("Cut: " + cert.getCut()));
            document.add(new Paragraph("Shape: " + cert.getShape()));

            document.close();
            return out.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Error generating PDF", e);
        }
    }
}
