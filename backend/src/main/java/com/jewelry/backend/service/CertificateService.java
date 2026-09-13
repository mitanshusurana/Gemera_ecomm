package com.jewelry.backend.service;

import com.jewelry.backend.dto.CertificateDetailDTO;
import com.jewelry.backend.entity.Certificate;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.repository.CertificateRepository;
import com.jewelry.backend.repository.ProductRepository;
import com.lowagie.text.Document;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.PdfWriter;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Service
public class CertificateService {

    @Autowired
    private CertificateRepository certificateRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private EntityMapper entityMapper;

    public Certificate getCertificate(String reportNumber) {
        return findCertificate(reportNumber)
                .orElseThrow(() -> new RuntimeException("Certificate not found"));
    }

    /**
     * Verification lookup (OPERATIONS-CONTRACT.md section 2): the
     * {@code certificates} table first; when it misses, the report number is
     * matched against {@code Product.labReportNumber} (case-insensitive,
     * trimmed) and the detail is built from the product. 404 only when both miss.
     */
    @Transactional(readOnly = true)
    public CertificateDetailDTO getCertificateDetail(String reportNumber) {
        String normalized = reportNumber == null ? "" : reportNumber.trim();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("A report number is required.");
        }

        Optional<Certificate> certificate = findCertificate(normalized);
        if (certificate.isPresent()) {
            return entityMapper.toCertificateDetailDTO(certificate.get());
        }

        List<Product> products = productRepository.findByLabReportNumberNormalized(normalized);
        if (products.isEmpty()) {
            throw new EntityNotFoundException("Certificate not found");
        }
        return fromProduct(products.get(0));
    }

    private Optional<Certificate> findCertificate(String reportNumber) {
        if (reportNumber == null) {
            return Optional.empty();
        }
        Optional<Certificate> exact = certificateRepository.findByReportNumber(reportNumber);
        if (exact.isPresent()) {
            return exact;
        }
        String trimmed = reportNumber.trim();
        return trimmed.equals(reportNumber)
                ? Optional.empty()
                : certificateRepository.findByReportNumber(trimmed);
    }

    static CertificateDetailDTO fromProduct(Product product) {
        CertificateDetailDTO dto = new CertificateDetailDTO();
        dto.setProductId(product.getId());
        dto.setReportNumber(product.getLabReportNumber() == null ? null : product.getLabReportNumber().trim());
        dto.setLab(product.getCertificateLab());
        dto.setProductName(product.getName());

        BigDecimal carat = product.getCaratWeight() != null
                ? product.getCaratWeight()
                : product.getTotalCaratWeight();
        dto.setCarat(carat == null ? null : carat.doubleValue());

        dto.setColor(firstText(product.getColorTradeTerm(), product.getColorHue()));
        dto.setClarity(product.getClarity());
        dto.setCut(product.getCut());
        dto.setShape(product.getShape());

        String image = product.getCertificateImage();
        if ((image == null || image.isBlank())
                && product.getImages() != null && !product.getImages().isEmpty()) {
            image = product.getImages().get(0);
        }
        dto.setImageUrl(image);
        return dto;
    }

    private static String firstText(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) {
            return primary;
        }
        return (fallback == null || fallback.isBlank()) ? null : fallback;
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
