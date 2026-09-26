package com.jewelry.backend.service;

import com.jewelry.backend.dto.LoyaltySummaryDTO;
import com.jewelry.backend.dto.LoyaltyTransactionDTO;
import com.jewelry.backend.entity.LoyaltyTransaction;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.LoyaltyTransactionRepository;
import com.jewelry.backend.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Loyalty points that are earned, burned, expired and adjusted through a
 * ledger ({@link LoyaltyTransaction}); {@code User.loyaltyPoints} is kept
 * equal to the sum of that ledger and is what the checkout reads.
 *
 * Settings (global_settings, read with defaults on every call so the admin
 * can change them without a restart): loyaltyPointsPer100, loyaltyPointValue
 * (rupees per point), loyaltyMaxRedeemPct (of the subtotal), loyaltyExpiryMonths,
 * loyaltyReferralBonus. Tiers come from lifetime earned points:
 * SILVER below 2000, GOLD from 2000, PLATINUM from 10000.
 */
@Service
public class LoyaltyService {

    private static final Logger LOGGER = Logger.getLogger(LoyaltyService.class.getName());

    public static final String SETTING_POINTS_PER_100 = "loyaltyPointsPer100";
    public static final String SETTING_POINT_VALUE = "loyaltyPointValue";
    public static final String SETTING_MAX_REDEEM_PCT = "loyaltyMaxRedeemPct";
    public static final String SETTING_EXPIRY_MONTHS = "loyaltyExpiryMonths";
    public static final String SETTING_REFERRAL_BONUS = "loyaltyReferralBonus";

    static final int DEFAULT_POINTS_PER_100 = 1;
    static final BigDecimal DEFAULT_POINT_VALUE = new BigDecimal("0.25");
    static final BigDecimal DEFAULT_MAX_REDEEM_PCT = new BigDecimal("10");
    static final int DEFAULT_EXPIRY_MONTHS = 12;
    static final int DEFAULT_REFERRAL_BONUS = 200;

    public static final String TIER_SILVER = "SILVER";
    public static final String TIER_GOLD = "GOLD";
    public static final String TIER_PLATINUM = "PLATINUM";
    static final long GOLD_FROM = 2000;
    static final long PLATINUM_FROM = 10000;

    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int EXPIRING_SOON_DAYS = 30;

    @Autowired
    LoyaltyTransactionRepository transactionRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    GlobalSettingRepository globalSettingRepository;

    // ------------------------------------------------------------------
    // Settings
    // ------------------------------------------------------------------

    public int pointsPer100() {
        return intSetting(SETTING_POINTS_PER_100, DEFAULT_POINTS_PER_100, 0);
    }

    /** Rupees one point is worth at checkout. */
    public BigDecimal pointValue() {
        BigDecimal v = decimalSetting(SETTING_POINT_VALUE);
        return v == null || v.signum() <= 0 ? DEFAULT_POINT_VALUE : v;
    }

    /** Largest share of the subtotal points may pay for, in percent. */
    public BigDecimal maxRedeemPct() {
        BigDecimal v = decimalSetting(SETTING_MAX_REDEEM_PCT);
        if (v == null || v.signum() < 0) return DEFAULT_MAX_REDEEM_PCT;
        return v.min(HUNDRED);
    }

    public int expiryMonths() {
        return intSetting(SETTING_EXPIRY_MONTHS, DEFAULT_EXPIRY_MONTHS, 1);
    }

    public int referralBonus() {
        return intSetting(SETTING_REFERRAL_BONUS, DEFAULT_REFERRAL_BONUS, 0);
    }

    // ------------------------------------------------------------------
    // Balance, tiers, redemption maths
    // ------------------------------------------------------------------

    public static int balance(User user) {
        return user == null || user.getLoyaltyPoints() == null ? 0 : Math.max(0, user.getLoyaltyPoints());
    }

    public long lifetimeEarned(User user) {
        return user == null || user.getId() == null ? 0 : transactionRepository.lifetimeEarned(user);
    }

    public static String tierFor(long lifetimeEarned) {
        if (lifetimeEarned >= PLATINUM_FROM) return TIER_PLATINUM;
        if (lifetimeEarned >= GOLD_FROM) return TIER_GOLD;
        return TIER_SILVER;
    }

    public String tierOf(User user) {
        return tierFor(lifetimeEarned(user));
    }

    /** Rupee value of {@code points}, 2 dp. */
    public BigDecimal valueOf(int points) {
        return pointValue().multiply(BigDecimal.valueOf(Math.max(points, 0))).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * The most points a cart with {@code subtotal} may burn: the balance,
     * capped so their value stays within loyaltyMaxRedeemPct of the subtotal.
     */
    public int maxRedeemablePoints(User user, BigDecimal subtotal) {
        int available = balance(user);
        if (available <= 0 || subtotal == null || subtotal.signum() <= 0) {
            return 0;
        }
        BigDecimal capValue = subtotal.multiply(maxRedeemPct()).divide(HUNDRED, 2, RoundingMode.DOWN);
        int capPoints = capValue.divide(pointValue(), 0, RoundingMode.DOWN).intValue();
        return Math.max(0, Math.min(available, capPoints));
    }

    // ------------------------------------------------------------------
    // Order hooks
    // ------------------------------------------------------------------

    /**
     * Earns points for a settled order: floor((subtotal - discount) / 100) x
     * loyaltyPointsPer100, expiring after loyaltyExpiryMonths. Idempotent per
     * order, so the checkout, the webhook and a COD delivery may all call it.
     * Also pays the referral bonus when this is the referee's first paid order.
     */
    @Transactional(rollbackFor = Exception.class)
    public void earnForOrder(Order order) {
        if (order == null || order.getUser() == null || order.getId() == null) {
            return;
        }
        User user = userRepository.findById(order.getUser().getId()).orElse(null);
        if (user == null) {
            return;
        }
        if (!transactionRepository.existsByOrderIdAndType(order.getId(), LoyaltyTransaction.TYPE_EARN)) {
            BigDecimal base = nz(order.getSubtotal()).subtract(nz(order.getDiscount()));
            int points = 0;
            if (base.signum() > 0) {
                points = base.divide(HUNDRED, 0, RoundingMode.DOWN).intValue() * pointsPer100();
            }
            if (points > 0) {
                record(user, LoyaltyTransaction.TYPE_EARN, points, order.getId(), order.getOrderNumber(),
                        LocalDateTime.now().plusMonths(expiryMonths()),
                        "Earned on order " + order.getOrderNumber());
            }
        }
        awardReferralBonus(user, order);
    }

    /**
     * Burns the points the cart applied, inside the order transaction. The
     * balance is re-checked here so a stale cart cannot overspend.
     */
    @Transactional(rollbackFor = Exception.class)
    public void redeemForOrder(Order order) {
        if (order == null || order.getUser() == null || order.getLoyaltyPointsRedeemed() == null
                || order.getLoyaltyPointsRedeemed() <= 0) {
            return;
        }
        if (transactionRepository.existsByOrderIdAndType(order.getId(), LoyaltyTransaction.TYPE_REDEEM)) {
            return;
        }
        User user = userRepository.findById(order.getUser().getId())
                .orElseThrow(() -> new EntityNotFoundException("User not found"));
        int points = order.getLoyaltyPointsRedeemed();
        if (balance(user) < points) {
            throw new IllegalArgumentException("Your points balance no longer covers the points applied. Please remove them and try again.");
        }
        record(user, LoyaltyTransaction.TYPE_REDEEM, -points, order.getId(), order.getOrderNumber(), null,
                "Redeemed on order " + order.getOrderNumber() + " (" + order.getLoyaltyDiscount() + " off)");
    }

    /**
     * Order CANCELLED / REFUNDED: takes back what the order earned (ADJUST,
     * negative, floored at a zero balance) and returns what it burned (ADJUST,
     * positive). Both idempotent.
     */
    @Transactional(rollbackFor = Exception.class)
    public void reverseForOrder(Order order, String reason) {
        if (order == null || order.getUser() == null || order.getId() == null) {
            return;
        }
        User user = userRepository.findById(order.getUser().getId()).orElse(null);
        if (user == null) {
            return;
        }
        List<LoyaltyTransaction> existing = transactionRepository.findByOrderId(order.getId());
        boolean earnReversed = existing.stream().anyMatch(t -> LoyaltyTransaction.TYPE_ADJUST.equals(t.getType()) && t.getPoints() < 0);
        boolean redeemReturned = existing.stream().anyMatch(t -> LoyaltyTransaction.TYPE_ADJUST.equals(t.getType()) && t.getPoints() > 0);
        String why = reason == null || reason.isBlank() ? "order " + order.getOrderNumber() + " reversed" : reason.trim();

        if (!earnReversed) {
            int earned = existing.stream()
                    .filter(t -> LoyaltyTransaction.TYPE_EARN.equals(t.getType()))
                    .mapToInt(LoyaltyTransaction::getPoints).sum();
            int takeBack = Math.min(earned, balance(user));
            if (takeBack > 0) {
                record(user, LoyaltyTransaction.TYPE_ADJUST, -takeBack, order.getId(), order.getOrderNumber(), null,
                        "Points from order " + order.getOrderNumber() + " taken back: " + why);
            }
        }
        if (!redeemReturned) {
            int redeemed = existing.stream()
                    .filter(t -> LoyaltyTransaction.TYPE_REDEEM.equals(t.getType()))
                    .mapToInt(t -> -t.getPoints()).sum();
            if (redeemed > 0) {
                record(user, LoyaltyTransaction.TYPE_ADJUST, redeemed, order.getId(), order.getOrderNumber(),
                        LocalDateTime.now().plusMonths(expiryMonths()),
                        "Points returned from order " + order.getOrderNumber() + ": " + why);
            }
        }
    }

    /** Referral: both sides get loyaltyReferralBonus once, on the referee's first paid order. */
    private void awardReferralBonus(User referee, Order order) {
        if (referee.getReferredBy() == null || Boolean.TRUE.equals(referee.getReferralBonusPaid())) {
            return;
        }
        int bonus = referralBonus();
        User referrer = userRepository.findById(referee.getReferredBy().getId()).orElse(null);
        referee.setReferralBonusPaid(true);
        userRepository.save(referee);
        if (bonus <= 0 || referrer == null) {
            return;
        }
        LocalDateTime expires = LocalDateTime.now().plusMonths(expiryMonths());
        record(referee, LoyaltyTransaction.TYPE_REFERRAL, bonus, order.getId(), referrer.getEmail(), expires,
                "Welcome bonus: you joined with " + displayName(referrer) + "'s referral code");
        record(referrer, LoyaltyTransaction.TYPE_REFERRAL, bonus, order.getId(), referee.getEmail(), expires,
                "Referral bonus: " + displayName(referee) + " placed a first order");
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    @Transactional(rollbackFor = Exception.class)
    public LoyaltyTransaction adjust(UUID userId, int points, String note, String actor) {
        if (points == 0) {
            throw new IllegalArgumentException("Enter a non-zero number of points.");
        }
        if (note == null || note.isBlank()) {
            throw new IllegalArgumentException("A note explaining the adjustment is required.");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("Customer not found"));
        if (points < 0 && balance(user) + points < 0) {
            throw new IllegalArgumentException("The customer only has " + balance(user) + " points.");
        }
        return record(user, LoyaltyTransaction.TYPE_ADJUST, points, null,
                actor == null || actor.isBlank() ? "admin" : actor,
                points > 0 ? LocalDateTime.now().plusMonths(expiryMonths()) : null,
                note.trim());
    }

    // ------------------------------------------------------------------
    // Expiry (nightly)
    // ------------------------------------------------------------------

    /** 02:30 every night: lapse the unspent remainder of every lot past its expiry date. */
    @Scheduled(cron = "0 30 2 * * *")
    public void expireDuePoints() {
        LocalDateTime now = LocalDateTime.now();
        List<UUID> userIds;
        try {
            userIds = transactionRepository.userIdsWithDueLots(now);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Loyalty expiry: could not list due lots", e);
            return;
        }
        int users = 0;
        for (UUID userId : userIds) {
            try {
                expireForUser(userId, now);
                users++;
            } catch (Exception e) {
                LOGGER.log(Level.WARNING, "Loyalty expiry failed for user " + userId, e);
            }
        }
        if (users > 0) {
            LOGGER.info("Loyalty expiry processed " + users + " customer(s)");
        }
    }

    /**
     * FIFO: the points a customer has spent (or lost) are taken from the
     * oldest lots first; whatever is left of a lot past its expiry lapses.
     */
    @Transactional(rollbackFor = Exception.class)
    public void expireForUser(UUID userId, LocalDateTime now) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return;
        }
        List<LoyaltyTransaction> ledger = transactionRepository.findByUserOrderByCreatedAtAsc(user);
        long consumed = ledger.stream().filter(t -> t.getPoints() < 0).mapToLong(t -> -t.getPoints()).sum();
        for (LoyaltyTransaction lot : ledger) {
            if (lot.getPoints() <= 0) {
                continue;
            }
            long take = Math.min(lot.getPoints(), consumed);
            consumed -= take;
            long remaining = lot.getPoints() - take;
            if (lot.getExpiresAt() != null && !lot.isExpiryProcessed() && !lot.getExpiresAt().isAfter(now)) {
                lot.setExpiryProcessed(true);
                transactionRepository.save(lot);
                if (remaining > 0) {
                    int lapse = (int) Math.min(remaining, balance(user));
                    if (lapse > 0) {
                        record(user, LoyaltyTransaction.TYPE_EXPIRE, -lapse, lot.getOrderId(), lot.getReference(), null,
                                "Points earned on " + lot.getCreatedAt().toLocalDate() + " expired");
                    }
                    // What this lot lost is now consumption that lands on it first.
                    consumed += remaining - Math.max(lapse, 0);
                }
            }
        }
    }

    /** Unspent points in lots that lapse within the next 30 days, and the earliest such date. */
    ExpiringSoon expiringSoon(User user) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime horizon = now.plusDays(EXPIRING_SOON_DAYS);
        List<LoyaltyTransaction> ledger = transactionRepository.findByUserOrderByCreatedAtAsc(user);
        long consumed = ledger.stream().filter(t -> t.getPoints() < 0).mapToLong(t -> -t.getPoints()).sum();
        long soon = 0;
        LocalDateTime earliest = null;
        for (LoyaltyTransaction lot : ledger) {
            if (lot.getPoints() <= 0) continue;
            long take = Math.min(lot.getPoints(), consumed);
            consumed -= take;
            long remaining = lot.getPoints() - take;
            if (remaining > 0 && lot.getExpiresAt() != null && !lot.isExpiryProcessed()
                    && lot.getExpiresAt().isAfter(now) && !lot.getExpiresAt().isAfter(horizon)) {
                soon += remaining;
                if (earliest == null || lot.getExpiresAt().isBefore(earliest)) {
                    earliest = lot.getExpiresAt();
                }
            }
        }
        return new ExpiringSoon((int) Math.min(soon, balance(user)), earliest);
    }

    record ExpiringSoon(int points, LocalDateTime at) {
    }

    // ------------------------------------------------------------------
    // Referral codes
    // ------------------------------------------------------------------

    /** The user's share code, generated (and saved) on first use. */
    @Transactional(rollbackFor = Exception.class)
    public String referralCodeFor(User user) {
        if (user.getReferralCode() != null && !user.getReferralCode().isBlank()) {
            return user.getReferralCode();
        }
        String code = generateReferralCode(user);
        user.setReferralCode(code);
        userRepository.save(user);
        return code;
    }

    /** FIRSTNAME-XXXX, letters only from the name (max 6), unique across users. */
    public String generateReferralCode(User user) {
        String first = user.getFirstName() == null ? "" : user.getFirstName();
        String base = first.toUpperCase(Locale.ROOT).replaceAll("[^A-Z]", "");
        if (base.isEmpty()) {
            base = "CL";
        }
        if (base.length() > 6) {
            base = base.substring(0, 6);
        }
        for (int attempt = 0; attempt < 50; attempt++) {
            StringBuilder sb = new StringBuilder(base).append('-');
            for (int i = 0; i < 4; i++) {
                sb.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
            }
            String candidate = sb.toString();
            if (userRepository.findByReferralCodeIgnoreCase(candidate).isEmpty()) {
                return candidate;
            }
        }
        return base + "-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase(Locale.ROOT);
    }

    /** The referrer for a code typed at registration; empty for blank or unknown codes. */
    public Optional<User> findReferrer(String code) {
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        return userRepository.findByReferralCodeIgnoreCase(code.trim());
    }

    // ------------------------------------------------------------------
    // Summary / mapping
    // ------------------------------------------------------------------

    @Transactional(rollbackFor = Exception.class)
    public LoyaltySummaryDTO summary(User user, int page, int size) {
        LoyaltySummaryDTO dto = new LoyaltySummaryDTO();
        int balance = balance(user);
        long lifetime = lifetimeEarned(user);
        String tier = tierFor(lifetime);
        dto.setBalance(balance);
        dto.setBalanceValue(valueOf(balance));
        dto.setLifetimeEarned(lifetime);
        dto.setTier(tier);
        if (TIER_SILVER.equals(tier)) {
            dto.setNextTier(TIER_GOLD);
            dto.setNextTierAt(GOLD_FROM);
            dto.setPointsToNextTier(Math.max(0, GOLD_FROM - lifetime));
            dto.setTierFloor(0);
        } else if (TIER_GOLD.equals(tier)) {
            dto.setNextTier(TIER_PLATINUM);
            dto.setNextTierAt(PLATINUM_FROM);
            dto.setPointsToNextTier(Math.max(0, PLATINUM_FROM - lifetime));
            dto.setTierFloor(GOLD_FROM);
        } else {
            dto.setNextTier(null);
            dto.setNextTierAt(null);
            dto.setPointsToNextTier(0);
            dto.setTierFloor(PLATINUM_FROM);
        }
        ExpiringSoon soon = expiringSoon(user);
        dto.setExpiringSoon(soon.points());
        dto.setExpiringSoonAt(soon.at());
        dto.setPointValue(pointValue());
        dto.setPointsPer100(pointsPer100());
        dto.setMaxRedeemPct(maxRedeemPct());
        dto.setExpiryMonths(expiryMonths());
        dto.setReferralBonus(referralBonus());
        dto.setReferralCode(referralCodeFor(user));
        dto.setReferredByName(user.getReferredBy() == null ? null : displayName(user.getReferredBy()));
        Page<LoyaltyTransaction> history = transactionRepository.findByUserOrderByCreatedAtDesc(
                user, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)));
        dto.setHistory(history.map(this::toDTO));
        return dto;
    }

    public LoyaltyTransactionDTO toDTO(LoyaltyTransaction t) {
        LoyaltyTransactionDTO dto = new LoyaltyTransactionDTO();
        dto.setId(t.getId());
        dto.setType(t.getType());
        dto.setPoints(t.getPoints());
        dto.setBalanceAfter(t.getBalanceAfter());
        dto.setOrderId(t.getOrderId());
        dto.setReference(t.getReference());
        dto.setExpiresAt(t.getExpiresAt());
        dto.setNote(t.getNote());
        dto.setCreatedAt(t.getCreatedAt());
        return dto;
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    /** Writes one ledger row and moves the user's balance with it (never below zero). */
    private LoyaltyTransaction record(User user, String type, int points, UUID orderId, String reference,
                                      LocalDateTime expiresAt, String note) {
        int after = Math.max(0, balance(user) + points);
        user.setLoyaltyPoints(after);
        userRepository.save(user);

        LoyaltyTransaction t = new LoyaltyTransaction();
        t.setUser(user);
        t.setType(type);
        t.setPoints(points);
        t.setBalanceAfter(after);
        t.setOrderId(orderId);
        t.setReference(reference);
        t.setExpiresAt(points > 0 ? expiresAt : null);
        t.setNote(note);
        return transactionRepository.save(t);
    }

    private int intSetting(String key, int fallback, int min) {
        BigDecimal v = decimalSetting(key);
        if (v == null) return fallback;
        int i = v.setScale(0, RoundingMode.DOWN).intValue();
        return i < min ? fallback : i;
    }

    private BigDecimal decimalSetting(String key) {
        return globalSettingRepository.findBySettingKey(key)
                .map(s -> s.getSettingValue())
                .filter(v -> v != null && !v.isBlank())
                .map(v -> {
                    try {
                        return new BigDecimal(v.trim());
                    } catch (NumberFormatException e) {
                        return null;
                    }
                })
                .orElse(null);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String displayName(User user) {
        String first = user.getFirstName() == null ? "" : user.getFirstName().trim();
        String last = user.getLastName() == null ? "" : user.getLastName().trim();
        String name = (first + " " + last).trim();
        return name.isEmpty() ? "a friend" : name;
    }
}
