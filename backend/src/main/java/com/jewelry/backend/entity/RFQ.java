package com.jewelry.backend.entity;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "rfq_requests")
@Data
@EqualsAndHashCode(callSuper = true)
public class RFQ extends BaseEntity {
    @ManyToOne
    @com.fasterxml.jackson.annotation.JsonIgnore
    private User user;

    @com.fasterxml.jackson.annotation.JsonProperty("userId")
    public java.util.UUID getUserId() {
        return user != null ? user.getId() : null;
    }

    @Column(unique = true)
    private String rfqNumber;

    private String status; // PENDING, QUOTED, ACCEPTED, REJECTED, NEGOTIATING, CANCELLED
    private String email;
    private String companyName;
    private BigDecimal estimatedBudget;
    private String deliveryTimeline;
    private String additionalNotes;

    private LocalDateTime expiresAt;

    @OneToMany(mappedBy = "rfq", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonManagedReference
    @ToString.Exclude
    private List<RFQItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "rfq", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonManagedReference
    @ToString.Exclude
    private List<RFQQuote> quotes = new ArrayList<>();
}
