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

/**
 * One line of a repair job's history: a status change, an estimate, an
 * assignment or a payment. {@code visibleToCustomer} decides whether the
 * storefront tracking page shows it; internal notes stay false.
 */
@Entity
@Table(name = "repair_job_events", indexes = {
        @Index(name = "idx_repair_job_events_job", columnList = "job_id")
})
@Getter
@Setter
public class RepairJobEvent extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "job_id", nullable = false)
    private RepairJob job;

    /** Status of the job after this event. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RepairJob.Status status;

    @Column(columnDefinition = "TEXT")
    private String note;

    /** "Customer", the admin's email, or "System". */
    private String actor;

    @Column(nullable = false)
    private boolean visibleToCustomer = true;
}
