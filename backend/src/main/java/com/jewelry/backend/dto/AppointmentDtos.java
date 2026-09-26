package com.jewelry.backend.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/** Request and response shapes of AppointmentController. */
public final class AppointmentDtos {

    private AppointmentDtos() {
    }

    /**
     * Body of POST /appointments. New callers send {@code slotStart} (+ {@code storeId}
     * for a store visit); older callers still send only {@code requestedDate}.
     */
    @Data
    public static class AppointmentRequest {
        private String name;
        private String email;
        private String phone;
        private String appointmentType;
        /** Alias of appointmentType. */
        private String type;
        private LocalDateTime requestedDate;
        private LocalDateTime slotStart;
        private UUID storeId;
        private String productId;
        private String notes;
    }

    /** Body of the customer and admin reschedule endpoints. */
    @Data
    public static class RescheduleRequest {
        private LocalDateTime slotStart;
        private UUID storeId;
    }

    @Data
    public static class AppointmentDTO {
        private UUID id;
        private String name;
        private String email;
        private String phone;
        private String appointmentType;
        private String status;
        private LocalDateTime requestedDate;
        private LocalDateTime slotStart;
        private LocalDateTime slotEnd;
        private UUID storeId;
        private String storeName;
        private String storeAddress;
        private String consultant;
        private String cancellationReason;
        private String productId;
        private String notes;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }

    /** One bookable slot of a day with its remaining capacity. */
    @Data
    public static class SlotDTO {
        private LocalDateTime start;
        private LocalDateTime end;
        private int capacity;
        private int booked;
        private int remaining;
        private boolean available;
        /** Why an unavailable slot cannot be booked: FULL or TOO_SOON. */
        private String reason;
    }
}
