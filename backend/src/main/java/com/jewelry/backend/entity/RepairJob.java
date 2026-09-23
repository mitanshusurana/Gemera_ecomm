package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A repair or service job (resizing, polishing, stone resetting, rhodium
 * plating, chain repair, engraving, cleaning) for a customer's own piece.
 * Numbered RJ-YYYY-00001 from {@link RepairSequence}; the customer follows
 * it on the storefront by job number and phone, and every change is kept
 * in {@link RepairJobEvent}. Status transitions are enforced in
 * RepairJobService, not here.
 */
@Entity
@Table(name = "repair_jobs", indexes = {
        @Index(name = "idx_repair_jobs_job_number", columnList = "job_number", unique = true),
        @Index(name = "idx_repair_jobs_status", columnList = "status"),
        @Index(name = "idx_repair_jobs_phone", columnList = "phone")
})
@Getter
@Setter
public class RepairJob extends BaseEntity {

    public enum ItemType { RING, NECKLACE, EARRINGS, BRACELET, BANGLE, PENDANT, CHAIN, WATCH, OTHER }

    public enum ServiceType { RESIZE, POLISH, STONE_RESET, RHODIUM_PLATING, CHAIN_REPAIR, ENGRAVING, CLEANING, OTHER }

    public enum Status { REQUESTED, RECEIVED, ASSESSED, APPROVED, IN_PROGRESS, READY, DELIVERED, CANCELLED }

    public enum PaymentMode { CASH, UPI, CARD, RAZORPAY, OTHER }

    @Column(nullable = false, length = 20)
    private String jobNumber;

    /** Null for guest requests; then the contact fields below are the only identity. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false)
    private String customerName;

    @Column(nullable = false, length = 32)
    private String phone;

    private String email;

    @Column(length = 1000)
    private String itemDescription;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ItemType itemType = ItemType.OTHER;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ServiceType serviceType = ServiceType.OTHER;

    @Column(columnDefinition = "TEXT")
    private String problemDescription;

    @Column(precision = 14, scale = 2)
    private BigDecimal declaredValue;

    /** JSON array of image URLs, e.g. ["https://.../a.webp"]. */
    @Column(columnDefinition = "TEXT")
    private String photoUrls;

    @Column(length = 16)
    private String ringSize;

    @Column(length = 16)
    private String targetSize;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.REQUESTED;

    @Column(precision = 14, scale = 2)
    private BigDecimal estimateAmount;

    @Column(columnDefinition = "TEXT")
    private String estimateNote;

    private LocalDateTime estimateApprovedAt;

    private LocalDate promisedDate;

    @Column(precision = 14, scale = 2)
    private BigDecimal finalAmount;

    @Column(precision = 14, scale = 2)
    private BigDecimal paidAmount;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private PaymentMode paymentMode;

    private String paymentReference;

    /** Staff member (goldsmith, polisher) the job is with. Free text. */
    private String assignedTo;

    @Column(columnDefinition = "TEXT")
    private String internalNotes;

    private LocalDateTime receivedAt;
    private LocalDateTime readyAt;
    private LocalDateTime deliveredAt;
}
