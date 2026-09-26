package com.jewelry.backend.repository;

import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.Product;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Read-only aggregates for the admin dashboard and analytics pages
 * (docs/BUSINESS_GAPS.md, "Analytics beyond four counters").
 *
 * Every query is a database-side SUM/COUNT so the pages stay fast as the
 * order table grows; nothing here is scanned in memory. The interface is bound
 * to Order only because Spring Data needs a domain type; the JPQL spans
 * Order, OrderItem, Product, Invoice, ProductStock, RepairJob, ExchangeRequest
 * and User. Time bounds are half-open: {@code createdAt >= from AND createdAt < to}.
 */
public interface AnalyticsRepository extends Repository<Order, UUID> {

    // ---- order totals -----------------------------------------------------

    /** COUNT, SUM(total), SUM(subtotal), SUM(discount), SUM(giftCardAmount), SUM(tax), SUM(shipping). */
    @Query("SELECT COUNT(o), COALESCE(SUM(o.total), 0), COALESCE(SUM(o.subtotal), 0), COALESCE(SUM(o.discount), 0), "
            + "COALESCE(SUM(o.giftCardAmount), 0), COALESCE(SUM(o.tax), 0), COALESCE(SUM(o.shipping), 0) "
            + "FROM Order o WHERE o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to")
    List<Object[]> orderTotals(@Param("statuses") Collection<String> statuses,
                               @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("SELECT COALESCE(SUM(o.discount), 0) FROM Order o WHERE o.status IN :statuses "
            + "AND o.appliedCoupon IS NOT NULL AND o.createdAt >= :from AND o.createdAt < :to")
    BigDecimal couponDiscount(@Param("statuses") Collection<String> statuses,
                              @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** SUM(loyaltyDiscount), SUM(treasureAmount) redeemed on the period's orders. */
    @Query("SELECT COALESCE(SUM(o.loyaltyDiscount), 0), COALESCE(SUM(o.treasureAmount), 0) FROM Order o "
            + "WHERE o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to")
    List<Object[]> loyaltyTotals(@Param("statuses") Collection<String> statuses,
                                 @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** SUM(price x qty), SUM(qty) over every item of the period's orders. */
    @Query("SELECT COALESCE(SUM(i.price * i.quantity), 0), COALESCE(SUM(i.quantity), 0) "
            + "FROM OrderItem i JOIN i.order o WHERE o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to")
    List<Object[]> itemTotals(@Param("statuses") Collection<String> statuses,
                              @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** SUM((price - unitCost) x qty), SUM(price x qty) over items whose cost was known at order time. */
    @Query("SELECT COALESCE(SUM((i.price - i.unitCost) * i.quantity), 0), COALESCE(SUM(i.price * i.quantity), 0) "
            + "FROM OrderItem i JOIN i.order o WHERE i.unitCost IS NOT NULL "
            + "AND o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to")
    List<Object[]> knownCostTotals(@Param("statuses") Collection<String> statuses,
                                   @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** COUNT, SUM(refundedAmount ?? total) of orders refunded (by last update) in the period. */
    @Query("SELECT COUNT(o), COALESCE(SUM(COALESCE(o.refundedAmount, o.total)), 0) FROM Order o "
            + "WHERE o.status IN :statuses AND o.updatedAt >= :from AND o.updatedAt < :to")
    List<Object[]> refundTotals(@Param("statuses") Collection<String> statuses,
                                @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    // ---- series -----------------------------------------------------------

    /** day, COUNT(o), SUM(total). */
    @Query("SELECT CAST(o.createdAt AS LocalDate), COUNT(o), COALESCE(SUM(o.total), 0) FROM Order o "
            + "WHERE o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to "
            + "GROUP BY CAST(o.createdAt AS LocalDate) ORDER BY CAST(o.createdAt AS LocalDate)")
    List<Object[]> dailyOrders(@Param("statuses") Collection<String> statuses,
                               @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** day, SUM((price - unitCost) x qty) over items with a known cost. */
    @Query("SELECT CAST(o.createdAt AS LocalDate), COALESCE(SUM((i.price - i.unitCost) * i.quantity), 0) "
            + "FROM OrderItem i JOIN i.order o WHERE i.unitCost IS NOT NULL "
            + "AND o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to "
            + "GROUP BY CAST(o.createdAt AS LocalDate)")
    List<Object[]> dailyMargin(@Param("statuses") Collection<String> statuses,
                               @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    // ---- breakdowns: key, SUM(price x qty), SUM(qty), COUNT(DISTINCT order) --

    @Query("SELECT p.category, COALESCE(SUM(i.price * i.quantity), 0), COALESCE(SUM(i.quantity), 0), COUNT(DISTINCT o.id) "
            + "FROM OrderItem i JOIN i.order o JOIN i.product p "
            + "WHERE o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to "
            + "GROUP BY p.category ORDER BY SUM(i.price * i.quantity) DESC")
    List<Object[]> byCategory(@Param("statuses") Collection<String> statuses,
                              @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("SELECT m.metalType, COALESCE(SUM(i.price * i.quantity), 0), COALESCE(SUM(i.quantity), 0), COUNT(DISTINCT o.id) "
            + "FROM OrderItem i JOIN i.order o JOIN i.product p LEFT JOIN p.metalDetails m "
            + "WHERE o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to "
            + "GROUP BY m.metalType ORDER BY SUM(i.price * i.quantity) DESC")
    List<Object[]> byMetal(@Param("statuses") Collection<String> statuses,
                           @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** metalType, metalPurity, revenue, units, orders. */
    @Query("SELECT m.metalType, m.metalPurity, COALESCE(SUM(i.price * i.quantity), 0), COALESCE(SUM(i.quantity), 0), COUNT(DISTINCT o.id) "
            + "FROM OrderItem i JOIN i.order o JOIN i.product p LEFT JOIN p.metalDetails m "
            + "WHERE o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to "
            + "GROUP BY m.metalType, m.metalPurity ORDER BY SUM(i.price * i.quantity) DESC")
    List<Object[]> byPurity(@Param("statuses") Collection<String> statuses,
                            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** Place of supply (GST state code) from the invoice: code, SUM(total), COUNT(orders). */
    @Query("SELECT inv.placeOfSupply, COALESCE(SUM(o.total), 0), COUNT(o) FROM Invoice inv JOIN inv.order o "
            + "WHERE o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to "
            + "GROUP BY inv.placeOfSupply ORDER BY SUM(o.total) DESC")
    List<Object[]> byState(@Param("statuses") Collection<String> statuses,
                           @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("SELECT o.paymentMethod, COALESCE(SUM(o.total), 0), COUNT(o) FROM Order o "
            + "WHERE o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to "
            + "GROUP BY o.paymentMethod ORDER BY SUM(o.total) DESC")
    List<Object[]> byPaymentMethod(@Param("statuses") Collection<String> statuses,
                                   @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    // ---- products ---------------------------------------------------------

    /** id, sku, name, category, stock, SUM(qty), SUM(price x qty); best revenue first. */
    @Query("SELECT p.id, p.sku, p.name, p.category, p.stock, COALESCE(SUM(i.quantity), 0), COALESCE(SUM(i.price * i.quantity), 0) "
            + "FROM OrderItem i JOIN i.order o JOIN i.product p "
            + "WHERE o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to "
            + "GROUP BY p.id, p.sku, p.name, p.category, p.stock ORDER BY SUM(i.price * i.quantity) DESC")
    List<Object[]> topProductsByRevenue(@Param("statuses") Collection<String> statuses,
                                        @Param("from") LocalDateTime from, @Param("to") LocalDateTime to, Pageable pageable);

    /** Same columns, most units first. */
    @Query("SELECT p.id, p.sku, p.name, p.category, p.stock, COALESCE(SUM(i.quantity), 0), COALESCE(SUM(i.price * i.quantity), 0) "
            + "FROM OrderItem i JOIN i.order o JOIN i.product p "
            + "WHERE o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to "
            + "GROUP BY p.id, p.sku, p.name, p.category, p.stock ORDER BY SUM(i.quantity) DESC, SUM(i.price * i.quantity) DESC")
    List<Object[]> topProductsByUnits(@Param("statuses") Collection<String> statuses,
                                      @Param("from") LocalDateTime from, @Param("to") LocalDateTime to, Pageable pageable);

    /** product id, SUM((price - unitCost) x qty) over items with a known cost. */
    @Query("SELECT p.id, COALESCE(SUM((i.price - i.unitCost) * i.quantity), 0) "
            + "FROM OrderItem i JOIN i.order o JOIN i.product p WHERE i.unitCost IS NOT NULL "
            + "AND o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to GROUP BY p.id")
    List<Object[]> marginByProduct(@Param("statuses") Collection<String> statuses,
                                   @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    // ---- customers --------------------------------------------------------

    /** user id, first paid order date, over all time. */
    @Query("SELECT o.user.id, MIN(o.createdAt) FROM Order o WHERE o.status IN :statuses AND o.user IS NOT NULL GROUP BY o.user.id")
    List<Object[]> firstOrderByUser(@Param("statuses") Collection<String> statuses);

    @Query("SELECT DISTINCT o.user.id FROM Order o WHERE o.status IN :statuses AND o.user IS NOT NULL "
            + "AND o.createdAt >= :from AND o.createdAt < :to")
    List<UUID> customersInPeriod(@Param("statuses") Collection<String> statuses,
                                 @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("SELECT COUNT(u) FROM User u WHERE u.role = :role AND u.createdAt >= :since")
    long countUsersCreatedSince(@Param("role") String role, @Param("since") LocalDateTime since);

    // ---- repairs and old gold ---------------------------------------------

    @Query("SELECT r.status, COUNT(r) FROM RepairJob r WHERE r.createdAt >= :from AND r.createdAt < :to GROUP BY r.status")
    List<Object[]> repairsByStatus(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("SELECT e.status, COUNT(e) FROM ExchangeRequest e WHERE e.createdAt >= :from AND e.createdAt < :to GROUP BY e.status")
    List<Object[]> exchangeByStatus(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    // ---- stock ------------------------------------------------------------

    /** COUNT(skus), SUM(stock), SUM(stock x price) over warehouse stock. */
    @Query("SELECT COUNT(p), COALESCE(SUM(p.stock), 0), COALESCE(SUM(p.stock * COALESCE(p.price, 0)), 0) "
            + "FROM Product p WHERE p.stock IS NOT NULL AND p.stock > 0")
    List<Object[]> stockTotals();

    /** SUM(stock x costPrice), SUM(stock) over stock with a cost price. */
    @Query("SELECT COALESCE(SUM(p.stock * p.costPrice), 0), COALESCE(SUM(p.stock), 0) "
            + "FROM Product p WHERE p.stock IS NOT NULL AND p.stock > 0 AND p.costPrice IS NOT NULL")
    List<Object[]> stockCostTotals();

    /** In stock, older than the cutoff, and not sold since it; highest value first. */
    @Query("SELECT p FROM Product p WHERE p.stock IS NOT NULL AND p.stock > 0 "
            + "AND (p.createdAt IS NULL OR p.createdAt < :cutoff) "
            + "AND NOT EXISTS (SELECT i.id FROM OrderItem i JOIN i.order o WHERE i.product = p "
            + "AND o.status IN :statuses AND o.createdAt >= :cutoff) "
            + "ORDER BY p.stock * COALESCE(p.price, 0) DESC, p.name ASC")
    List<Product> deadStock(@Param("statuses") Collection<String> statuses, @Param("cutoff") LocalDateTime cutoff, Pageable pageable);

    /** COUNT, SUM(stock), SUM(stock x price), SUM(stock x cost) of the dead stock set. */
    @Query("SELECT COUNT(p), COALESCE(SUM(p.stock), 0), COALESCE(SUM(p.stock * COALESCE(p.price, 0)), 0), "
            + "COALESCE(SUM(p.stock * COALESCE(p.costPrice, 0)), 0) "
            + "FROM Product p WHERE p.stock IS NOT NULL AND p.stock > 0 "
            + "AND (p.createdAt IS NULL OR p.createdAt < :cutoff) "
            + "AND NOT EXISTS (SELECT i.id FROM OrderItem i JOIN i.order o WHERE i.product = p "
            + "AND o.status IN :statuses AND o.createdAt >= :cutoff)")
    List<Object[]> deadStockTotals(@Param("statuses") Collection<String> statuses, @Param("cutoff") LocalDateTime cutoff);

    /** product id, last paid sale, for the given products. */
    @Query("SELECT i.product.id, MAX(o.createdAt) FROM OrderItem i JOIN i.order o "
            + "WHERE o.status IN :statuses AND i.product.id IN :ids GROUP BY i.product.id")
    List<Object[]> lastSoldAt(@Param("statuses") Collection<String> statuses, @Param("ids") Collection<UUID> ids);

    /** store id, store name, COUNT(skus), SUM(qty), SUM(qty x price), SUM(qty x cost). */
    @Query("SELECT s.id, s.name, COUNT(ps), COALESCE(SUM(ps.quantity), 0), "
            + "COALESCE(SUM(ps.quantity * COALESCE(p.price, 0)), 0), COALESCE(SUM(ps.quantity * COALESCE(p.costPrice, 0)), 0) "
            + "FROM ProductStock ps JOIN ps.product p JOIN ps.store s WHERE ps.quantity > 0 GROUP BY s.id, s.name ORDER BY s.name")
    List<Object[]> stockByStore();

    // ---- export -----------------------------------------------------------

    @Query("SELECT o FROM Order o WHERE o.status IN :statuses AND o.createdAt >= :from AND o.createdAt < :to ORDER BY o.createdAt")
    List<Order> ordersInPeriod(@Param("statuses") Collection<String> statuses,
                               @Param("from") LocalDateTime from, @Param("to") LocalDateTime to, Pageable pageable);

    /** order id, invoice number, place of supply for orders created in the period. */
    @Query("SELECT inv.order.id, inv.invoiceNumber, inv.placeOfSupply FROM Invoice inv "
            + "WHERE inv.order.createdAt >= :from AND inv.order.createdAt < :to")
    List<Object[]> invoicesForOrders(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
