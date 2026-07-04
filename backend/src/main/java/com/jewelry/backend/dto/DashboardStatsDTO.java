package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class DashboardStatsDTO {
    private BigDecimal totalSales;
    private long totalOrders;
    private long totalCustomers;
    private long newCustomersThisMonth;
    private long totalRfqs;
    private long unreadRfqs;
}
