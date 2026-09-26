package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * A booked consultation: store visit, try-at-home or video call.
 *
 * {@code slotStart}/{@code slotEnd} are the booked slot (see
 * AppointmentService for the slot rules); {@code requestedDate} is kept equal
 * to slotStart for the reminder job and for callers that pre-date slots.
 * Status: PENDING, CONFIRMED, COMPLETED, NO_SHOW, CANCELLED.
 */
@Entity
@Table(name = "appointments")
@Data
@EqualsAndHashCode(callSuper = true)
public class Appointment extends BaseEntity {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_CONFIRMED = "CONFIRMED";
    public static final String STATUS_COMPLETED = "COMPLETED";
    public static final String STATUS_NO_SHOW = "NO_SHOW";
    public static final String STATUS_CANCELLED = "CANCELLED";

    public static final String TYPE_STORE_VISIT = "STORE_VISIT";
    public static final String TYPE_TRY_AT_HOME = "TRY_AT_HOME";
    public static final String TYPE_VIDEO_CONSULT = "VIDEO_CONSULT";

    private String name;
    private String email;
    private String phone;

    private String appointmentType;
    private String status = STATUS_PENDING;

    private LocalDateTime requestedDate;
    private String productId;

    private String notes;

    // Null for VIDEO_CONSULT and TRY_AT_HOME; required for STORE_VISIT.
    @ManyToOne
    @JoinColumn(name = "store_id")
    private Store store;

    private LocalDateTime slotStart;
    private LocalDateTime slotEnd;

    // Staff member the visit is assigned to (free text, set by the admin).
    private String consultant;

    private String cancellationReason;
}
