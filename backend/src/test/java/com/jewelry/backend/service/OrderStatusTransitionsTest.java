package com.jewelry.backend.service;

import org.junit.jupiter.api.Test;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** The order status machine in {@link OrderService#ALLOWED_TRANSITIONS}; no Spring context. */
class OrderStatusTransitionsTest {

    private static final Map<String, Set<String>> T = OrderService.ALLOWED_TRANSITIONS;

    @Test
    void everyStatusInTheMapIsInDisplayOrderAndViceVersa() {
        assertThat(T.keySet()).containsExactlyInAnyOrderElementsOf(OrderService.STATUS_ORDER);
        for (Set<String> targets : T.values()) {
            assertThat(OrderService.STATUS_ORDER).containsAll(targets);
        }
    }

    @Test
    void cancelledAndRefundedAreTerminal() {
        assertThat(T.get("CANCELLED")).isEmpty();
        assertThat(T.get("REFUNDED")).isEmpty();
        assertThat(OrderService.nextStatuses("CANCELLED")).isEmpty();
        assertThat(OrderService.nextStatuses("REFUNDED")).isEmpty();
    }

    @Test
    void nothingIsReachableFromCancelledOrRefunded() {
        assertThat(reachableFrom("CANCELLED")).isEmpty();
        assertThat(reachableFrom("REFUNDED")).isEmpty();
    }

    @Test
    void returnedIsEnteredOnlyFromDeliveredOrCompleted() {
        Set<String> sources = new HashSet<>();
        T.forEach((from, to) -> {
            if (to.contains("RETURNED")) {
                sources.add(from);
            }
        });
        assertThat(sources).containsExactlyInAnyOrder("DELIVERED", "COMPLETED");
    }

    @Test
    void returnedLeadsOnlyToRefunded() {
        assertThat(T.get("RETURNED")).containsExactly("REFUNDED");
    }

    @Test
    void codOrdersCanLeaveConfirmed() {
        // createOrder assigns CONFIRMED to cash-on-delivery orders; the map
        // once had no entry for it, so a COD order could never move.
        assertThat(T.get("CONFIRMED")).containsExactlyInAnyOrder("PROCESSING", "CANCELLED");
    }

    @Test
    void shippedCannotBeCancelledOnlyDelivered() {
        assertThat(T.get("SHIPPED")).containsExactly("DELIVERED");
    }

    @Test
    void refundedIsReachableFromEveryPaidPath() {
        assertThat(reachableFrom("PAID")).contains("REFUNDED");
        assertThat(reachableFrom("PENDING_PAYMENT")).contains("PAID", "SHIPPED", "DELIVERED", "COMPLETED", "RETURNED", "REFUNDED", "CANCELLED");
    }

    @Test
    void nextStatusesFollowsDisplayOrder() {
        assertThat(OrderService.nextStatuses("PAID")).containsExactly("PROCESSING", "CANCELLED", "REFUNDED");
        assertThat(OrderService.nextStatuses("DELIVERED")).containsExactly("COMPLETED", "RETURNED");
        assertThat(OrderService.nextStatuses("PENDING_PAYMENT")).containsExactly("PAID", "CANCELLED");
    }

    @Test
    void nextStatusesNormalisesInputAndDefaultsToPendingPayment() {
        assertThat(OrderService.nextStatuses(" paid ")).isEqualTo(OrderService.nextStatuses("PAID"));
        assertThat(OrderService.nextStatuses(null)).isEqualTo(OrderService.nextStatuses("PENDING_PAYMENT"));
        assertThat(OrderService.nextStatuses("NOT_A_STATUS")).isEmpty();
    }

    @Test
    void noStatusTransitionsToItself() {
        T.forEach((from, to) -> assertThat(to).as(from).doesNotContain(from));
    }

    private static Set<String> reachableFrom(String start) {
        Set<String> seen = new HashSet<>();
        Deque<String> queue = new ArrayDeque<>(List.of(start));
        while (!queue.isEmpty()) {
            for (String next : T.getOrDefault(queue.poll(), Set.of())) {
                if (seen.add(next)) {
                    queue.add(next);
                }
            }
        }
        return seen;
    }
}
