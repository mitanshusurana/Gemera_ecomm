package com.jewelry.backend.service;

import com.jewelry.backend.dto.AnalyticsDtos.Breakdown;
import com.jewelry.backend.dto.AnalyticsDtos.BreakdownRow;
import com.jewelry.backend.dto.AnalyticsDtos.Metric;
import com.jewelry.backend.dto.AnalyticsDtos.Overview;
import com.jewelry.backend.dto.AnalyticsDtos.Period;
import com.jewelry.backend.dto.AnalyticsDtos.Series;
import com.jewelry.backend.dto.AnalyticsDtos.SeriesPoint;
import com.jewelry.backend.dto.AnalyticsDtos.StockReport;
import com.jewelry.backend.dto.AnalyticsDtos.StockRow;
import com.jewelry.backend.dto.AnalyticsDtos.StoreStock;
import com.jewelry.backend.dto.AnalyticsDtos.TopProduct;
import com.jewelry.backend.dto.AnalyticsDtos.TopProducts;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.OrderItem;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.repository.AnalyticsRepository;
import com.jewelry.backend.util.GstStateCodes;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.UUID;

/**
 * Sales, margin, customer and stock figures for the admin dashboard and the
 * analytics page (docs/BUSINESS_GAPS.md, "Analytics beyond four counters").
 *
 * A sale is an order in {@link #SOLD_STATUSES}, dated by its creation. Every
 * figure comes from a database aggregate in {@link AnalyticsRepository}; the
 * only in-memory work is bucketing daily rows into weeks or months and
 * regrouping categories into item types.
 *
 * Margin uses OrderItem.unitCost, the product's cost snapshotted at order
 * time. Orders that pre-date cost prices have no unitCost; their revenue is
 * reported separately as "unknown cost" instead of being counted as margin.
 */
@Service
public class AnalyticsService {

    public static final List<String> SOLD_STATUSES = List.of("PAID", "PROCESSING", "SHIPPED", "DELIVERED", "COMPLETED");
    private static final List<String> REFUND_STATUSES = List.of("REFUNDED", "RETURNED");

    /** Longest range a single request may cover. */
    private static final int MAX_DAYS = 731;
    private static final int DEFAULT_DAYS = 30;
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("yyyy-MM");

    @Autowired
    private AnalyticsRepository analytics;

    @Autowired
    private InventoryAlertService inventoryAlertService;

    @Autowired
    private ProductRulesService productRulesService;

    // ------------------------------------------------------------------
    // Ranges
    // ------------------------------------------------------------------

    /** Inclusive calendar range with half-open timestamps for the queries. */
    public record Range(LocalDate from, LocalDate to) {
        public LocalDateTime start() {
            return from.atStartOfDay();
        }

        public LocalDateTime endExclusive() {
            return to.plusDays(1).atStartOfDay();
        }

        public int days() {
            return (int) ChronoUnit.DAYS.between(from, to) + 1;
        }

        /** Same length, ending the day before this range starts. */
        public Range previous() {
            LocalDate prevTo = from.minusDays(1);
            return new Range(prevTo.minusDays(days() - 1L), prevTo);
        }

        public Period period() {
            return new Period(from, to, days());
        }
    }

    /** Defaults: to = today, from = 29 days earlier. Swaps a reversed pair and caps the length. */
    public static Range range(LocalDate from, LocalDate to) {
        LocalDate end = to != null ? to : LocalDate.now();
        LocalDate start = from != null ? from : end.minusDays(DEFAULT_DAYS - 1L);
        if (start.isAfter(end)) {
            LocalDate swap = start;
            start = end;
            end = swap;
        }
        if (ChronoUnit.DAYS.between(start, end) >= MAX_DAYS) {
            start = end.minusDays(MAX_DAYS - 1L);
        }
        return new Range(start, end);
    }

    // ------------------------------------------------------------------
    // Overview
    // ------------------------------------------------------------------

    /** Totals for a period: count, revenue, subtotal, discount, gift card, tax, shipping, units, margin figures. */
    private record Totals(long orders, BigDecimal revenue, BigDecimal subtotal, BigDecimal discount, BigDecimal giftCard,
                          BigDecimal tax, BigDecimal shipping, BigDecimal itemRevenue, long units,
                          BigDecimal margin, BigDecimal knownCostRevenue, BigDecimal couponDiscount,
                          BigDecimal loyaltyDiscount, BigDecimal treasureRedeemed) {
        BigDecimal averageOrderValue() {
            return orders == 0 ? BigDecimal.ZERO : revenue.divide(BigDecimal.valueOf(orders), 2, RoundingMode.HALF_UP);
        }
    }

    private Totals totals(Range r) {
        Object[] o = first(analytics.orderTotals(SOLD_STATUSES, r.start(), r.endExclusive()), 7);
        Object[] items = first(analytics.itemTotals(SOLD_STATUSES, r.start(), r.endExclusive()), 2);
        Object[] known = first(analytics.knownCostTotals(SOLD_STATUSES, r.start(), r.endExclusive()), 2);
        BigDecimal coupon = nz(analytics.couponDiscount(SOLD_STATUSES, r.start(), r.endExclusive()));
        Object[] loyalty = first(analytics.loyaltyTotals(SOLD_STATUSES, r.start(), r.endExclusive()), 2);
        return new Totals(lng(o[0]), bd(o[1]), bd(o[2]), bd(o[3]), bd(o[4]), bd(o[5]), bd(o[6]),
                bd(items[0]), lng(items[1]), bd(known[0]), bd(known[1]), coupon, bd(loyalty[0]), bd(loyalty[1]));
    }

    @Transactional(readOnly = true)
    public Overview overview(LocalDate from, LocalDate to) {
        Range cur = range(from, to);
        Range prev = cur.previous();
        Totals c = totals(cur);
        Totals p = totals(prev);

        BigDecimal unknownRevenue = c.itemRevenue().subtract(c.knownCostRevenue()).max(BigDecimal.ZERO);
        BigDecimal unknownShare = percent(unknownRevenue, c.itemRevenue());
        BigDecimal marginPercent = percent(c.margin(), c.knownCostRevenue());

        Object[] refunds = first(analytics.refundTotals(REFUND_STATUSES, cur.start(), cur.endExclusive()), 2);

        long[] customers = newVsReturning(cur);

        return new Overview(
                cur.period(), prev.period(),
                metric(c.revenue(), p.revenue()),
                metric(BigDecimal.valueOf(c.orders()), BigDecimal.valueOf(p.orders())),
                metric(c.averageOrderValue(), p.averageOrderValue()),
                metric(BigDecimal.valueOf(c.units()), BigDecimal.valueOf(p.units())),
                metric(c.margin(), p.margin()),
                marginPercent,
                c.knownCostRevenue(),
                unknownRevenue,
                unknownShare,
                c.couponDiscount(),
                c.loyaltyDiscount(),
                c.discount().subtract(c.couponDiscount()).subtract(c.loyaltyDiscount()).max(BigDecimal.ZERO),
                c.giftCard(),
                c.treasureRedeemed(),
                c.tax(),
                c.shipping(),
                customers[0], customers[1],
                lng(refunds[0]), bd(refunds[1]),
                statusCounts(analytics.repairsByStatus(cur.start(), cur.endExclusive())),
                statusCounts(analytics.exchangeByStatus(cur.start(), cur.endExclusive())),
                orderRows(analytics.byPaymentMethod(SOLD_STATUSES, cur.start(), cur.endExclusive()), "paymentMethod"));
    }

    /** {new, returning}: a customer is new when their first paid order ever falls inside the period. */
    private long[] newVsReturning(Range r) {
        List<UUID> inPeriod = analytics.customersInPeriod(SOLD_STATUSES, r.start(), r.endExclusive());
        if (inPeriod.isEmpty()) {
            return new long[] {0, 0};
        }
        Map<UUID, LocalDateTime> first = new HashMap<>();
        for (Object[] row : analytics.firstOrderByUser(SOLD_STATUSES)) {
            if (row[0] instanceof UUID id) {
                first.put(id, toLocalDateTime(row[1]));
            }
        }
        long fresh = 0;
        for (UUID id : inPeriod) {
            LocalDateTime firstOrder = first.get(id);
            if (firstOrder == null || !firstOrder.isBefore(r.start())) {
                fresh++;
            }
        }
        return new long[] {fresh, inPeriod.size() - fresh};
    }

    private static Map<String, Long> statusCounts(List<Object[]> rows) {
        Map<String, Long> out = new TreeMap<>();
        for (Object[] row : rows) {
            out.put(row[0] == null ? "UNKNOWN" : String.valueOf(row[0]), lng(row[1]));
        }
        return out;
    }

    // ------------------------------------------------------------------
    // Series
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Series series(LocalDate from, LocalDate to, String granularity) {
        Range cur = range(from, to);
        Range prev = cur.previous();
        String g = normalizeGranularity(granularity);
        return new Series(g, cur.period(), prev.period(), points(cur, g), points(prev, g));
    }

    private static String normalizeGranularity(String granularity) {
        String g = granularity == null ? "day" : granularity.trim().toLowerCase(Locale.ROOT);
        return switch (g) {
            case "week", "month" -> g;
            default -> "day";
        };
    }

    /** Zero-filled buckets over the whole range so the chart has a point per day/week/month. */
    private List<SeriesPoint> points(Range r, String granularity) {
        Map<String, long[]> orders = new LinkedHashMap<>();
        Map<String, BigDecimal[]> money = new LinkedHashMap<>();
        for (LocalDate d = r.from(); !d.isAfter(r.to()); d = d.plusDays(1)) {
            String key = bucket(d, granularity);
            orders.putIfAbsent(key, new long[1]);
            money.putIfAbsent(key, new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO});
        }
        for (Object[] row : analytics.dailyOrders(SOLD_STATUSES, r.start(), r.endExclusive())) {
            String key = bucket(toLocalDate(row[0]), granularity);
            orders.computeIfAbsent(key, k -> new long[1])[0] += lng(row[1]);
            BigDecimal[] m = money.computeIfAbsent(key, k -> new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO});
            m[0] = m[0].add(bd(row[2]));
        }
        for (Object[] row : analytics.dailyMargin(SOLD_STATUSES, r.start(), r.endExclusive())) {
            String key = bucket(toLocalDate(row[0]), granularity);
            BigDecimal[] m = money.computeIfAbsent(key, k -> new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO});
            m[1] = m[1].add(bd(row[1]));
        }
        List<SeriesPoint> out = new ArrayList<>(orders.size());
        for (Map.Entry<String, long[]> e : orders.entrySet()) {
            BigDecimal[] m = money.get(e.getKey());
            out.add(new SeriesPoint(e.getKey(), e.getValue()[0], m[0], m[1]));
        }
        return out;
    }

    private static String bucket(LocalDate day, String granularity) {
        return switch (granularity) {
            case "week" -> day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString();
            case "month" -> day.format(MONTH);
            default -> day.toString();
        };
    }

    // ------------------------------------------------------------------
    // Breakdowns
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Breakdown breakdown(String dimension, LocalDate from, LocalDate to) {
        Range r = range(from, to);
        String dim = dimension == null ? "category" : dimension.trim();
        List<BreakdownRow> rows = switch (dim) {
            case "category" -> itemRows(analytics.byCategory(SOLD_STATUSES, r.start(), r.endExclusive()), "Uncategorised");
            case "metal" -> itemRows(analytics.byMetal(SOLD_STATUSES, r.start(), r.endExclusive()), "No metal");
            case "purity" -> purityRows(analytics.byPurity(SOLD_STATUSES, r.start(), r.endExclusive()));
            case "itemType" -> itemTypeRows(analytics.byCategory(SOLD_STATUSES, r.start(), r.endExclusive()));
            case "state" -> orderRows(analytics.byState(SOLD_STATUSES, r.start(), r.endExclusive()), "state");
            case "paymentMethod" -> orderRows(analytics.byPaymentMethod(SOLD_STATUSES, r.start(), r.endExclusive()), "paymentMethod");
            default -> throw new IllegalArgumentException(
                    "Unknown dimension '" + dim + "'. Use category, metal, purity, itemType, state or paymentMethod.");
        };
        BigDecimal total = rows.stream().map(BreakdownRow::revenue).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new Breakdown(dim, r.period(), total, withShares(rows, total));
    }

    /** Rows shaped (key, revenue, units, orders) from an OrderItem join. */
    private static List<BreakdownRow> itemRows(List<Object[]> raw, String nullLabel) {
        List<BreakdownRow> rows = new ArrayList<>(raw.size());
        for (Object[] row : raw) {
            String key = row[0] == null || String.valueOf(row[0]).isBlank() ? null : String.valueOf(row[0]);
            rows.add(new BreakdownRow(key == null ? "" : key, key == null ? nullLabel : key,
                    bd(row[1]), lng(row[2]), lng(row[3]), null));
        }
        return rows;
    }

    /** Rows shaped (metalType, metalPurity, revenue, units, orders). */
    private static List<BreakdownRow> purityRows(List<Object[]> raw) {
        List<BreakdownRow> rows = new ArrayList<>(raw.size());
        for (Object[] row : raw) {
            String metal = row[0] == null || String.valueOf(row[0]).isBlank() ? "" : String.valueOf(row[0]).trim();
            String purity = row[1] == null || String.valueOf(row[1]).isBlank() ? "" : String.valueOf(row[1]).trim();
            String key = (metal + "|" + purity);
            String label = metal.isEmpty() && purity.isEmpty() ? "No metal"
                    : (metal + " " + purity).trim();
            rows.add(new BreakdownRow(key, label, bd(row[2]), lng(row[3]), lng(row[4]), null));
        }
        return rows;
    }

    /** Category rows regrouped by the item type each category resolves to. */
    private List<BreakdownRow> itemTypeRows(List<Object[]> byCategory) {
        Map<String, String> typeByCategory = new HashMap<>();
        Map<String, BigDecimal> revenue = new LinkedHashMap<>();
        Map<String, long[]> counts = new LinkedHashMap<>();
        for (Object[] row : byCategory) {
            String category = row[0] == null ? "" : String.valueOf(row[0]);
            String type = typeByCategory.computeIfAbsent(category, c -> {
                String resolved = productRulesService.resolveItemType(c);
                return resolved == null ? "UNKNOWN" : resolved;
            });
            revenue.merge(type, bd(row[1]), BigDecimal::add);
            long[] c = counts.computeIfAbsent(type, k -> new long[2]);
            c[0] += lng(row[2]);
            c[1] += lng(row[3]);
        }
        List<BreakdownRow> rows = new ArrayList<>();
        for (Map.Entry<String, BigDecimal> e : revenue.entrySet()) {
            long[] c = counts.get(e.getKey());
            rows.add(new BreakdownRow(e.getKey(), itemTypeLabel(e.getKey()), e.getValue(), c[0], c[1], null));
        }
        rows.sort((a, b) -> b.revenue().compareTo(a.revenue()));
        return rows;
    }

    private static String itemTypeLabel(String type) {
        return switch (type) {
            case ProductRulesService.JEWELLERY -> "Jewellery";
            case ProductRulesService.LOOSE_GEMSTONE -> "Loose gemstones";
            case ProductRulesService.GEMSTONE_LOT -> "Gemstone lots";
            case ProductRulesService.ROUGH -> "Rough";
            case ProductRulesService.IDOL_CARVING -> "Idols and carvings";
            case ProductRulesService.STRAND_BEADS -> "Strands and beads";
            case ProductRulesService.COMPONENT -> "Components";
            case ProductRulesService.SET -> "Sets";
            default -> "Unknown type";
        };
    }

    /** Rows shaped (key, revenue, orders) from an Order-level group; units are not meaningful here. */
    private static List<BreakdownRow> orderRows(List<Object[]> raw, String kind) {
        List<BreakdownRow> rows = new ArrayList<>(raw.size());
        for (Object[] row : raw) {
            String key = row[0] == null || String.valueOf(row[0]).isBlank() ? "" : String.valueOf(row[0]).trim();
            String label;
            if (key.isEmpty()) {
                label = "state".equals(kind) ? "No invoice yet" : "Unknown";
            } else if ("state".equals(kind)) {
                String name = GstStateCodes.nameFor(key);
                label = name != null ? name + " (" + key + ")" : key;
            } else {
                label = key.replace('_', ' ');
            }
            rows.add(new BreakdownRow(key, label, bd(row[1]), 0, lng(row[2]), null));
        }
        BigDecimal total = rows.stream().map(BreakdownRow::revenue).reduce(BigDecimal.ZERO, BigDecimal::add);
        return withShares(rows, total);
    }

    private static List<BreakdownRow> withShares(List<BreakdownRow> rows, BigDecimal total) {
        List<BreakdownRow> out = new ArrayList<>(rows.size());
        for (BreakdownRow r : rows) {
            out.add(new BreakdownRow(r.key(), r.label(), r.revenue(), r.units(), r.orders(), percent(r.revenue(), total)));
        }
        return out;
    }

    // ------------------------------------------------------------------
    // Products
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public TopProducts topProducts(String by, LocalDate from, LocalDate to, int limit) {
        Range r = range(from, to);
        String sort = "units".equalsIgnoreCase(by) ? "units" : "revenue";
        Pageable page = PageRequest.of(0, Math.min(Math.max(limit, 1), 500));
        List<Object[]> raw = "units".equals(sort)
                ? analytics.topProductsByUnits(SOLD_STATUSES, r.start(), r.endExclusive(), page)
                : analytics.topProductsByRevenue(SOLD_STATUSES, r.start(), r.endExclusive(), page);
        Map<UUID, BigDecimal> margin = marginByProduct(r);
        List<TopProduct> rows = new ArrayList<>(raw.size());
        for (Object[] row : raw) {
            UUID id = (UUID) row[0];
            rows.add(new TopProduct(id, str(row[1]), str(row[2]), str(row[3]), intOrNull(row[4]),
                    lng(row[5]), bd(row[6]), margin.get(id)));
        }
        return new TopProducts(sort, r.period(), rows);
    }

    private Map<UUID, BigDecimal> marginByProduct(Range r) {
        Map<UUID, BigDecimal> out = new HashMap<>();
        for (Object[] row : analytics.marginByProduct(SOLD_STATUSES, r.start(), r.endExclusive())) {
            if (row[0] instanceof UUID id) {
                out.put(id, bd(row[1]));
            }
        }
        return out;
    }

    // ------------------------------------------------------------------
    // Stock
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public StockReport stock(int deadAfterDays, int limit) {
        int days = Math.min(Math.max(deadAfterDays, 1), 3650);
        int cap = Math.min(Math.max(limit, 1), 500);
        LocalDateTime cutoff = LocalDate.now().minusDays(days).atStartOfDay();

        Object[] totals = first(analytics.stockTotals(), 3);
        Object[] cost = first(analytics.stockCostTotals(), 2);
        Object[] dead = first(analytics.deadStockTotals(SOLD_STATUSES, cutoff), 4);

        List<Product> deadProducts = analytics.deadStock(SOLD_STATUSES, cutoff, PageRequest.of(0, cap));
        Map<UUID, LocalDateTime> lastSold = new HashMap<>();
        if (!deadProducts.isEmpty()) {
            List<UUID> ids = deadProducts.stream().map(Product::getId).toList();
            for (Object[] row : analytics.lastSoldAt(SOLD_STATUSES, ids)) {
                if (row[0] instanceof UUID id) {
                    lastSold.put(id, toLocalDateTime(row[1]));
                }
            }
        }
        List<StockRow> deadRows = deadProducts.stream().map(p -> stockRow(p, lastSold.get(p.getId()))).toList();

        List<StockRow> lowRows = inventoryAlertService.findLowStock().stream()
                .limit(cap)
                .map(p -> stockRow(p, null))
                .toList();

        List<StoreStock> stores = new ArrayList<>();
        for (Object[] row : analytics.stockByStore()) {
            stores.add(new StoreStock((UUID) row[0], str(row[1]), lng(row[2]), lng(row[3]), bd(row[4]), bd(row[5])));
        }

        long pieces = lng(totals[1]);
        long piecesWithCost = lng(cost[1]);
        return new StockReport(days,
                lng(totals[0]), pieces, bd(totals[2]), bd(cost[0]), Math.max(0, pieces - piecesWithCost),
                lng(dead[0]), lng(dead[1]), bd(dead[2]), bd(dead[3]),
                deadRows, lowRows, stores);
    }

    private static StockRow stockRow(Product p, LocalDateTime lastSoldAt) {
        int stock = p.getStock() == null ? 0 : p.getStock();
        BigDecimal price = nz(p.getPrice());
        BigDecimal qty = BigDecimal.valueOf(stock);
        return new StockRow(p.getId(), p.getSku(), p.getName(), p.getCategory(), p.getStock(),
                p.getPrice(), p.getCostPrice(),
                price.multiply(qty),
                p.getCostPrice() == null ? null : p.getCostPrice().multiply(qty),
                lastSoldAt, p.getCreatedAt(), p.getReorderPointAlert());
    }

    // ------------------------------------------------------------------
    // CSV export
    // ------------------------------------------------------------------

    /** File name stem for the export, e.g. orders_2026-08-25_2026-09-23. */
    public String exportFileName(String report, LocalDate from, LocalDate to) {
        Range r = range(from, to);
        return ("products".equalsIgnoreCase(report) ? "products" : "orders") + "_" + r.from() + "_" + r.to() + ".csv";
    }

    @Transactional(readOnly = true)
    public String exportCsv(String report, LocalDate from, LocalDate to) {
        Range r = range(from, to);
        if ("products".equalsIgnoreCase(report)) {
            return productsCsv(r);
        }
        if ("orders".equalsIgnoreCase(report)) {
            return ordersCsv(r);
        }
        throw new IllegalArgumentException("Unknown report '" + report + "'. Use orders or products.");
    }

    private String ordersCsv(Range r) {
        Map<UUID, String[]> invoices = new HashMap<>();
        for (Object[] row : analytics.invoicesForOrders(r.start(), r.endExclusive())) {
            if (row[0] instanceof UUID id) {
                invoices.put(id, new String[] {str(row[1]), str(row[2])});
            }
        }
        StringBuilder sb = new StringBuilder();
        csvRow(sb, "order_number", "date", "status", "customer_email", "customer_name", "items", "units",
                "subtotal", "discount", "coupon", "gift_card", "tax", "shipping", "total",
                "cost_known", "margin_known", "payment_method", "invoice_number", "place_of_supply");
        List<Order> orders = analytics.ordersInPeriod(SOLD_STATUSES, r.start(), r.endExclusive(), PageRequest.of(0, 20000));
        for (Order o : orders) {
            long units = 0;
            BigDecimal knownCost = BigDecimal.ZERO;
            BigDecimal knownRevenue = BigDecimal.ZERO;
            List<OrderItem> items = o.getItems() == null ? List.of() : o.getItems();
            for (OrderItem i : items) {
                units += i.getQuantity();
                if (i.getUnitCost() != null) {
                    BigDecimal q = BigDecimal.valueOf(i.getQuantity());
                    knownCost = knownCost.add(i.getUnitCost().multiply(q));
                    knownRevenue = knownRevenue.add(nz(i.getPrice()).multiply(q));
                }
            }
            String[] inv = invoices.get(o.getId());
            String customerName = o.getUser() == null ? "" : ((nz(o.getUser().getFirstName()) + " " + nz(o.getUser().getLastName())).trim());
            String state = inv == null ? "" : inv[1];
            String stateName = GstStateCodes.nameFor(state);
            csvRow(sb, o.getOrderNumber(), o.getCreatedAt() == null ? "" : o.getCreatedAt().toLocalDate().toString(),
                    o.getStatus(), o.getUser() == null ? "" : o.getUser().getEmail(), customerName,
                    String.valueOf(items.size()), String.valueOf(units),
                    money(o.getSubtotal()), money(o.getDiscount()), nz(o.getAppliedCoupon()), money(o.getGiftCardAmount()),
                    money(o.getTax()), money(o.getShipping()), money(o.getTotal()),
                    money(knownCost), money(knownRevenue.subtract(knownCost)),
                    nz(o.getPaymentMethod()), inv == null ? "" : inv[0],
                    stateName != null ? stateName + " (" + state + ")" : state);
        }
        return sb.toString();
    }

    private String productsCsv(Range r) {
        Map<UUID, BigDecimal> margin = marginByProduct(r);
        StringBuilder sb = new StringBuilder();
        csvRow(sb, "sku", "name", "category", "units_sold", "revenue", "margin_known", "stock_left");
        for (Object[] row : analytics.topProductsByRevenue(SOLD_STATUSES, r.start(), r.endExclusive(), Pageable.unpaged())) {
            UUID id = (UUID) row[0];
            csvRow(sb, str(row[1]), str(row[2]), str(row[3]), String.valueOf(lng(row[5])), money(bd(row[6])),
                    margin.containsKey(id) ? money(margin.get(id)) : "", row[4] == null ? "" : String.valueOf(row[4]));
        }
        return sb.toString();
    }

    private static void csvRow(StringBuilder sb, String... cells) {
        for (int i = 0; i < cells.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(csvCell(cells[i]));
        }
        sb.append("\r\n");
    }

    private static String csvCell(String value) {
        if (value == null) {
            return "";
        }
        boolean quote = value.indexOf(',') >= 0 || value.indexOf('"') >= 0 || value.indexOf('\n') >= 0 || value.indexOf('\r') >= 0;
        String escaped = value.replace("\"", "\"\"");
        return quote ? "\"" + escaped + "\"" : escaped;
    }

    private static String money(BigDecimal v) {
        return v == null ? "" : v.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static Metric metric(BigDecimal current, BigDecimal previous) {
        BigDecimal cur = nz(current);
        BigDecimal prev = nz(previous);
        BigDecimal delta = prev.signum() == 0 ? null
                : cur.subtract(prev).multiply(BigDecimal.valueOf(100)).divide(prev, 1, RoundingMode.HALF_UP);
        return new Metric(cur, prev, delta);
    }

    /** part / whole x 100 to one decimal; null when whole is 0. */
    private static BigDecimal percent(BigDecimal part, BigDecimal whole) {
        if (whole == null || whole.signum() == 0 || part == null) {
            return null;
        }
        return part.multiply(BigDecimal.valueOf(100)).divide(whole, 1, RoundingMode.HALF_UP);
    }

    /** First row of an aggregate result, or a row of nulls of the given width when the query returned nothing. */
    private static Object[] first(List<Object[]> rows, int width) {
        if (rows == null || rows.isEmpty() || rows.get(0) == null) {
            return new Object[width];
        }
        Object[] row = rows.get(0);
        if (row.length >= width) {
            return row;
        }
        Object[] padded = new Object[width];
        System.arraycopy(row, 0, padded, 0, row.length);
        return padded;
    }

    private static BigDecimal bd(Object v) {
        if (v == null) {
            return BigDecimal.ZERO;
        }
        if (v instanceof BigDecimal b) {
            return b;
        }
        if (v instanceof Number n) {
            return new BigDecimal(n.toString());
        }
        return new BigDecimal(v.toString());
    }

    private static long lng(Object v) {
        if (v == null) {
            return 0;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        return Long.parseLong(v.toString());
    }

    private static Integer intOrNull(Object v) {
        return v instanceof Number n ? n.intValue() : null;
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String nz(String v) {
        return v == null ? "" : v;
    }

    private static LocalDate toLocalDate(Object v) {
        if (v instanceof LocalDate d) {
            return d;
        }
        if (v instanceof java.sql.Date d) {
            return d.toLocalDate();
        }
        if (v instanceof Timestamp t) {
            return t.toLocalDateTime().toLocalDate();
        }
        if (v instanceof LocalDateTime dt) {
            return dt.toLocalDate();
        }
        if (v instanceof java.util.Date d) {
            return new java.sql.Date(d.getTime()).toLocalDate();
        }
        return LocalDate.parse(Objects.requireNonNull(v).toString().substring(0, 10));
    }

    private static LocalDateTime toLocalDateTime(Object v) {
        if (v instanceof LocalDateTime dt) {
            return dt;
        }
        if (v instanceof Timestamp t) {
            return t.toLocalDateTime();
        }
        if (v instanceof java.util.Date d) {
            return new Timestamp(d.getTime()).toLocalDateTime();
        }
        return v == null ? null : LocalDateTime.parse(v.toString().replace(' ', 'T'));
    }
}
