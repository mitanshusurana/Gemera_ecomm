package com.jewelry.backend.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** Request and response shapes of ReturnController. */
public final class ReturnDtos {

    private ReturnDtos() {
    }

    /** Body of POST /orders/{id}/returns. */
    @Data
    public static class CreateReturnRequest {
        private List<LineRequest> lines;
        /** DAMAGED, WRONG_ITEM, NOT_AS_DESCRIBED, SIZE, CHANGED_MIND, OTHER. */
        private String reason;
        private String reasonNote;
        /** REFUND, STORE_CREDIT or EXCHANGE. */
        private String resolution;
        /** EXCHANGE only: the replacement pieces. */
        private List<ExchangeItemRequest> exchangeItems;
    }

    @Data
    public static class LineRequest {
        private UUID orderItemId;
        private int quantity;
    }

    @Data
    public static class ExchangeItemRequest {
        private UUID productId;
        private int quantity;
    }

    /** Body of PUT /admin/returns/{id}/receive. */
    @Data
    public static class ReceiveRequest {
        private List<ReceiveLine> lines;
        private String note;
    }

    @Data
    public static class ReceiveLine {
        private UUID lineId;
        private Boolean received;
        private String condition;
    }

    /** What can still be returned on an order (GET /orders/{id}/returns/eligibility). */
    @Data
    public static class EligibilityDTO {
        private UUID orderId;
        private String orderNumber;
        private boolean eligible;
        private String reason;
        private LocalDate windowEnds;
        private int windowDays;
        private List<EligibleLineDTO> lines;
    }

    @Data
    public static class EligibleLineDTO {
        private UUID orderItemId;
        private UUID productId;
        private String name;
        private String sku;
        private String image;
        private int quantity;
        private int returnableQuantity;
        private BigDecimal unitPrice;
        private boolean returnable;
        private String reason;
    }

    @Data
    public static class ReturnLineDTO {
        private UUID id;
        private UUID orderItemId;
        private UUID productId;
        private String name;
        private String sku;
        private String image;
        private int quantity;
        private BigDecimal unitPrice;
        private String condition;
        private Boolean received;
    }

    @Data
    public static class ReturnRequestDTO {
        private UUID id;
        private String rmaNumber;
        private UUID orderId;
        private String orderNumber;
        private String orderStatus;
        private String status;
        private String reason;
        private String reasonNote;
        private String resolution;
        private BigDecimal refundAmount;
        private BigDecimal restockingFee;
        private BigDecimal refundedViaGateway;
        private String razorpayRefundId;
        private UUID exchangeOrderId;
        private String exchangeOrderNumber;
        private String exchangeOrderStatus;
        private String storeCreditGiftCardCode;
        private List<ExchangeItemDTO> exchangeItems;
        private String adminNote;
        private String customerName;
        private String customerEmail;
        private String customerPhone;
        private List<ReturnLineDTO> lines;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private LocalDateTime approvedAt;
        private LocalDateTime receivedAt;
        private LocalDateTime resolvedAt;
        private LocalDateTime closedAt;
        /** Customer view: whether "Cancel request" still applies. */
        private boolean cancellable;
    }

    @Data
    public static class ExchangeItemDTO {
        private UUID productId;
        private String name;
        private String sku;
        private BigDecimal price;
        private int quantity;
    }
}
