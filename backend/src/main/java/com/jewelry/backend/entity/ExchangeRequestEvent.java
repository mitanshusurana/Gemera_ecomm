package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/** One line of an exchange request's history: the status it entered, who did it, and a note. */
@Entity
@Table(name = "exchange_request_events")
@Getter
@Setter
public class ExchangeRequestEvent extends BaseEntity {

    @ManyToOne(optional = false)
    @JoinColumn(name = "exchange_request_id")
    private ExchangeRequest exchangeRequest;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(columnDefinition = "TEXT")
    private String note;

    /** Admin e-mail, "customer", or "system". */
    private String actor;

    @Column(nullable = false)
    private LocalDateTime at = LocalDateTime.now();
}
