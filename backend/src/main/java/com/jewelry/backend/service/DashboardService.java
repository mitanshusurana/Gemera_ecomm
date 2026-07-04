package com.jewelry.backend.service;

import com.jewelry.backend.dto.DashboardStatsDTO;
import com.jewelry.backend.repository.OrderRepository;
import com.jewelry.backend.repository.RFQRepository;
import com.jewelry.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Service
public class DashboardService {
    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RFQRepository rfqRepository;

    public DashboardStatsDTO getStats() {
        DashboardStatsDTO stats = new DashboardStatsDTO();

        // Calculate total sales (sum of all completed orders)
        BigDecimal totalSales = orderRepository.findAll().stream()
                .filter(o -> "COMPLETED".equals(o.getStatus()) || "DELIVERED".equals(o.getStatus()) || "PAID".equals(o.getStatus()) || "PROCESSING".equals(o.getStatus()) || "SHIPPED".equals(o.getStatus()))
                .map(o -> o.getTotal() != null ? o.getTotal() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        stats.setTotalSales(totalSales);
        stats.setTotalOrders(orderRepository.count());
        stats.setTotalCustomers(userRepository.count());
        
        // Count new customers this month
        LocalDateTime startOfMonth = LocalDateTime.now().withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0);
        long newCustomers = userRepository.findAll().stream()
                .filter(u -> u.getCreatedAt() != null && u.getCreatedAt().isAfter(startOfMonth))
                .count();
        stats.setNewCustomersThisMonth(newCustomers);

        stats.setTotalRfqs(rfqRepository.count());
        
        long unreadRfqs = rfqRepository.findAll().stream()
                .filter(r -> "PENDING".equals(r.getStatus()) || "NEW".equals(r.getStatus()))
                .count();
        stats.setUnreadRfqs(unreadRfqs);

        return stats;
    }
}
