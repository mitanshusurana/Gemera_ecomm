package com.jewelry.backend.service;

import com.jewelry.backend.dto.DashboardStatsDTO;
import com.jewelry.backend.repository.AnalyticsRepository;
import com.jewelry.backend.repository.OrderRepository;
import com.jewelry.backend.repository.RFQRepository;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.security.StaffPermissions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * The six counters behind GET /api/v1/admin/dashboard/stats. Every figure is
 * a database aggregate; the earlier version loaded every order, user and RFQ
 * into memory to count them. The richer figures live in {@link AnalyticsService}.
 */
@Service
public class DashboardService {
    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RFQRepository rfqRepository;

    @Autowired
    private AnalyticsRepository analyticsRepository;

    @Transactional(readOnly = true)
    public DashboardStatsDTO getStats() {
        DashboardStatsDTO stats = new DashboardStatsDTO();

        stats.setTotalSales(orderRepository.sumTotalByStatusIn(AnalyticsService.SOLD_STATUSES));
        stats.setTotalOrders(orderRepository.count());
        stats.setTotalCustomers(userRepository.countByRole(StaffPermissions.ROLE_USER));

        LocalDateTime startOfMonth = LocalDate.now().withDayOfMonth(1).atStartOfDay();
        stats.setNewCustomersThisMonth(analyticsRepository.countUsersCreatedSince(StaffPermissions.ROLE_USER, startOfMonth));

        stats.setTotalRfqs(rfqRepository.count());
        stats.setUnreadRfqs(rfqRepository.countByStatusIn(List.of("PENDING", "NEW")));

        return stats;
    }
}
