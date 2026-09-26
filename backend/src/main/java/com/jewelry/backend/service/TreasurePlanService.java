package com.jewelry.backend.service;

import com.jewelry.backend.config.EmailTemplateSeeder;
import com.jewelry.backend.dto.CreateRazorpayOrderRequest;
import com.jewelry.backend.dto.RazorpayOrderResponse;
import com.jewelry.backend.dto.TreasureEnrollRequest;
import com.jewelry.backend.dto.TreasureInstallmentConfirmRequest;
import com.jewelry.backend.dto.TreasureInstallmentDTO;
import com.jewelry.backend.dto.TreasureInstallmentOrderResponse;
import com.jewelry.backend.dto.TreasurePlanConfigDTO;
import com.jewelry.backend.dto.TreasureRedeemableDTO;
import com.jewelry.backend.dto.TreasureChestAccountDTO;
import com.jewelry.backend.dto.VerifyPaymentRequest;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.TreasureChestAccount;
import com.jewelry.backend.entity.TreasureInstallment;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.OrderRepository;
import com.jewelry.backend.repository.TreasureChestAccountRepository;
import com.jewelry.backend.repository.TreasureInstallmentRepository;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.util.EmailText;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Treasure Chest plan: enrolment, installment payments and maturity
 * (FINISH-CONTRACT.md section 2).
 *
 * Every payment, whether the customer paid through Razorpay (confirm endpoint
 * or webhook) or the admin recorded cash, goes through {@link #applyPayment}
 * so counters, balance, bonus, emails and history stay consistent.
 * Validation failures are {@link IllegalArgumentException} (400), missing
 * rows {@link EntityNotFoundException} (404), an unconfigured gateway
 * {@link IllegalStateException} (503).
 */
@Service
public class TreasurePlanService {

    private static final Logger LOGGER = Logger.getLogger(TreasurePlanService.class.getName());

    public static final BigDecimal MIN_AMOUNT = new BigDecimal("1000");
    public static final BigDecimal MAX_AMOUNT = new BigDecimal("100000");
    public static final int DURATION_MONTHS = 11;
    public static final int BONUS_MONTHS = 1;

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_MATURED = "MATURED";
    /** Matured balance spent in full at checkout (OrderService.createOrder). */
    public static final String STATUS_REDEEMED = "REDEEMED";
    public static final String STATUS_CLOSED = "CLOSED";

    public static final String BASIS_BALANCE = "BALANCE";
    public static final String BASIS_GOLD = "GOLD";

    private static final String CURRENCY = "INR";
    private static final String DEFAULT_PLAN_NAME = "Treasure Chest";
    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("d MMMM yyyy");

    @Autowired
    TreasureChestAccountRepository treasureChestAccountRepository;

    @Autowired
    TreasureInstallmentRepository treasureInstallmentRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    PaymentService paymentService;

    @Autowired
    EmailService emailService;

    @Autowired
    MetalRateService metalRateService;

    @Autowired
    ErpSyncService erpSyncService;

    @Autowired
    OrderRepository orderRepository;

    @Value("${app.frontend-url:http://localhost:4200}")
    private String frontendUrl;

    // ------------------------------------------------------------------
    // Configuration and derived amounts
    // ------------------------------------------------------------------

    public TreasurePlanConfigDTO getConfig() {
        TreasurePlanConfigDTO config = new TreasurePlanConfigDTO();
        config.setMinAmount(MIN_AMOUNT);
        config.setMaxAmount(MAX_AMOUNT);
        config.setDurationMonths(DURATION_MONTHS);
        config.setBonusMonths(BONUS_MONTHS);
        return config;
    }

    /** installmentAmount x bonus months: what the plan adds on maturity. */
    public static BigDecimal bonusAmount(TreasureChestAccount account) {
        if (account == null) return null;
        return money(account.getInstallmentAmount()).multiply(BigDecimal.valueOf(BONUS_MONTHS));
    }

    /** installmentAmount x totalInstallments + bonus: the balance on maturity. */
    public static BigDecimal maturityAmount(TreasureChestAccount account) {
        if (account == null) return null;
        return money(account.getInstallmentAmount())
                .multiply(BigDecimal.valueOf(account.getTotalInstallments()))
                .add(bonusAmount(account));
    }

    // ------------------------------------------------------------------
    // Accounts
    // ------------------------------------------------------------------

    public TreasureChestAccount getAccount(String userEmail) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new EntityNotFoundException("User not found"));
        return treasureChestAccountRepository.findByUser(user)
                .orElseThrow(() -> new EntityNotFoundException("Account not found"));
    }

    public Iterable<TreasureChestAccount> getAllAccounts() {
        return treasureChestAccountRepository.findAll();
    }

    @Transactional(rollbackFor = Exception.class)
    public TreasureChestAccount enroll(String userEmail, TreasureEnrollRequest request) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new EntityNotFoundException("User not found"));

        if (treasureChestAccountRepository.findByUser(user).isPresent()) {
            throw new IllegalArgumentException("You are already enrolled in a Treasure Chest plan.");
        }
        if (request == null) {
            throw new IllegalArgumentException("An installment amount is required.");
        }
        BigDecimal amount = normalizeAmount(request.getInstallmentAmount());
        String planName = request.getPlanName() == null || request.getPlanName().isBlank()
                ? DEFAULT_PLAN_NAME
                : request.getPlanName().trim();
        if (planName.length() > 120) {
            throw new IllegalArgumentException("planName may not exceed 120 characters.");
        }

        TreasureChestAccount account = new TreasureChestAccount();
        account.setUser(user);
        account.setPlanName(planName);
        account.setInstallmentAmount(amount);
        account.setCurrentBalance(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
        account.setStatus(STATUS_ACTIVE);
        account.setStartDate(LocalDate.now());
        account.setInstallmentsPaid(0);
        account.setTotalInstallments(DURATION_MONTHS);
        account.setNextDueDate(LocalDate.now().plusMonths(1));

        return treasureChestAccountRepository.save(account);
    }

    @Transactional(rollbackFor = Exception.class)
    public TreasureChestAccount skipMonth(UUID id) {
        TreasureChestAccount account = treasureChestAccountRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Account not found"));
        LocalDate due = account.getNextDueDate() == null ? LocalDate.now() : account.getNextDueDate();
        account.setNextDueDate(due.plusMonths(1));
        return treasureChestAccountRepository.save(account);
    }

    @Transactional(rollbackFor = Exception.class)
    public TreasureChestAccount closePlan(UUID id) {
        TreasureChestAccount account = treasureChestAccountRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Account not found"));
        account.setStatus(STATUS_CLOSED);
        return treasureChestAccountRepository.save(account);
    }

    // ------------------------------------------------------------------
    // Customer installment flow (order -> Razorpay checkout -> confirm)
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<TreasureInstallment> listInstallments(String userEmail) {
        TreasureChestAccount account = getAccount(userEmail);
        return treasureInstallmentRepository.findByAccountOrderByCreatedAtDesc(account);
    }

    /**
     * Creates a PENDING installment for the caller's ACTIVE account together
     * with a Razorpay order for installmentAmount in paise. When a PENDING
     * installment with a gateway order already exists it is returned instead
     * of creating a second one.
     */
    @Transactional(rollbackFor = Exception.class)
    public TreasureInstallmentOrderResponse createInstallmentOrder(String userEmail) {
        TreasureChestAccount account = getAccount(userEmail);
        requirePayable(account);

        Optional<TreasureInstallment> pending = treasureInstallmentRepository
                .findFirstByAccountAndStatusOrderByCreatedAtDesc(account, TreasureInstallment.STATUS_PENDING);
        if (pending.isPresent()
                && pending.get().getRazorpayOrderId() != null
                && !pending.get().getRazorpayOrderId().isBlank()) {
            TreasureInstallment existing = pending.get();
            return new TreasureInstallmentOrderResponse(
                    existing.getId(),
                    existing.getRazorpayOrderId(),
                    toPaise(money(existing.getAmount())),
                    CURRENCY);
        }

        BigDecimal amount = money(account.getInstallmentAmount());
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("This plan has no installment amount.");
        }

        // Create the gateway order first: if the gateway is unavailable there
        // is nothing worth persisting.
        CreateRazorpayOrderRequest orderRequest = new CreateRazorpayOrderRequest();
        orderRequest.setAmount(toPaise(amount));
        orderRequest.setCurrency(CURRENCY);

        RazorpayOrderResponse razorpayOrder;
        try {
            razorpayOrder = paymentService.createRazorpayOrder(orderRequest);
        } catch (IllegalStateException e) {
            LOGGER.log(Level.WARNING, "Treasure installment order rejected: " + e.getMessage());
            throw new IllegalStateException("Online payment is not available right now.", e);
        }

        TreasureInstallment installment = pending.orElseGet(TreasureInstallment::new);
        installment.setAccount(account);
        installment.setInstallmentNumber(account.getInstallmentsPaid() + 1);
        installment.setAmount(amount);
        installment.setMethod(TreasureInstallment.METHOD_RAZORPAY);
        installment.setStatus(TreasureInstallment.STATUS_PENDING);
        installment.setRazorpayOrderId(razorpayOrder.getId());

        TreasureInstallment saved = treasureInstallmentRepository.save(installment);
        return new TreasureInstallmentOrderResponse(
                saved.getId(),
                razorpayOrder.getId(),
                razorpayOrder.getAmount(),
                razorpayOrder.getCurrency());
    }

    /**
     * Client-side confirmation: checks the installment belongs to the caller,
     * verifies the Razorpay signature and applies the payment. Idempotent for
     * an installment that is already PAID.
     */
    @Transactional(rollbackFor = Exception.class)
    public TreasureChestAccount confirmInstallment(String userEmail, UUID installmentId,
                                                   TreasureInstallmentConfirmRequest request) {
        TreasureInstallment installment = treasureInstallmentRepository.findByIdForUpdate(installmentId)
                .orElseThrow(() -> new EntityNotFoundException("Installment not found"));

        TreasureChestAccount account = installment.getAccount();
        if (account == null || account.getUser() == null || account.getUser().getEmail() == null
                || !account.getUser().getEmail().equalsIgnoreCase(userEmail)) {
            // Another customer's installment: do not reveal that it exists.
            throw new EntityNotFoundException("Installment not found");
        }

        if (TreasureInstallment.STATUS_PAID.equals(installment.getStatus())) {
            return account;
        }

        if (installment.getRazorpayOrderId() == null
                || !installment.getRazorpayOrderId().equals(request.getRazorpayOrderId())) {
            throw new IllegalArgumentException("The payment does not belong to this installment.");
        }

        VerifyPaymentRequest verifyRequest = new VerifyPaymentRequest();
        verifyRequest.setOrderId(request.getRazorpayOrderId());
        verifyRequest.setPaymentId(request.getRazorpayPaymentId());
        verifyRequest.setPaymentToken(request.getRazorpaySignature());
        try {
            paymentService.verifyPayment(verifyRequest);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Payment verification failed.", e);
        }

        installment.setRazorpayPaymentId(request.getRazorpayPaymentId());
        return applyPayment(installment);
    }

    /**
     * Webhook path (payment.captured / order.paid): the gateway has already
     * confirmed the payment, so no client signature is checked. Empty when no
     * installment carries this Razorpay order id; idempotent on retries.
     */
    @Transactional(rollbackFor = Exception.class)
    public Optional<TreasureInstallment> confirmPaidByRazorpayOrder(String razorpayOrderId, String razorpayPaymentId) {
        if (razorpayOrderId == null || razorpayOrderId.isBlank()) {
            return Optional.empty();
        }
        Optional<TreasureInstallment> found = treasureInstallmentRepository.findByRazorpayOrderId(razorpayOrderId);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        TreasureInstallment installment = treasureInstallmentRepository.findByIdForUpdate(found.get().getId())
                .orElseThrow(() -> new EntityNotFoundException("Installment not found"));
        if (!TreasureInstallment.STATUS_PAID.equals(installment.getStatus())
                && razorpayPaymentId != null && !razorpayPaymentId.isBlank()) {
            installment.setRazorpayPaymentId(razorpayPaymentId);
        }
        applyPayment(installment);
        return Optional.of(installment);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    /** Records a CASH installment for the account and applies it like any other payment. */
    @Transactional(rollbackFor = Exception.class)
    public TreasureChestAccount recordPayment(UUID id, String note) {
        TreasureChestAccount account = treasureChestAccountRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Account not found"));
        requirePayable(account);

        TreasureInstallment installment = new TreasureInstallment();
        installment.setAccount(account);
        installment.setInstallmentNumber(account.getInstallmentsPaid() + 1);
        installment.setAmount(money(account.getInstallmentAmount()));
        installment.setMethod(TreasureInstallment.METHOD_CASH);
        installment.setStatus(TreasureInstallment.STATUS_PENDING);
        installment.setNote(optionalText(note, 2000));
        return applyPayment(installment);
    }

    // ------------------------------------------------------------------
    // The one place a payment changes an account
    // ------------------------------------------------------------------

    /**
     * Marks the installment PAID and updates its account: installmentsPaid++,
     * balance += amount, nextDueDate += 1 month. When the last installment
     * lands the bonus (installmentAmount x bonus months) is added and the plan
     * becomes MATURED with no further due date. Locks the account row, so two
     * payments for the same plan are serialised. Idempotent: an installment
     * that is already PAID is returned unchanged and sends no further email.
     * A CLOSED plan refuses payments; a MATURED one still takes the money
     * onto the balance (it was captured by the gateway) without changing
     * status. Each payment also books the 24K grams it bought at the day's
     * rate (gram accrual) and queues an ADVANCE for the ERP.
     */
    @Transactional(rollbackFor = Exception.class)
    public TreasureChestAccount applyPayment(TreasureInstallment installment) {
        if (installment == null || installment.getAccount() == null) {
            throw new IllegalArgumentException("An installment with an account is required.");
        }
        if (TreasureInstallment.STATUS_PAID.equals(installment.getStatus())) {
            return installment.getAccount();
        }
        if (!TreasureInstallment.STATUS_PENDING.equals(installment.getStatus())) {
            throw new IllegalArgumentException("This installment can no longer be paid.");
        }

        TreasureChestAccount account = treasureChestAccountRepository.findByIdForUpdate(installment.getAccount().getId())
                .orElseThrow(() -> new EntityNotFoundException("Account not found"));
        if (STATUS_CLOSED.equals(account.getStatus())) {
            throw new IllegalArgumentException("This plan is closed; the payment cannot be applied.");
        }

        BigDecimal amount = money(installment.getAmount() != null ? installment.getAmount() : account.getInstallmentAmount());
        int paid = account.getInstallmentsPaid() + 1;

        installment.setAccount(account);
        installment.setInstallmentNumber(paid);
        installment.setAmount(amount);
        installment.setStatus(TreasureInstallment.STATUS_PAID);
        installment.setPaidAt(LocalDateTime.now());

        // Gram accrual: the rupees buy 24K gold at today's rate; the grams are
        // what the gold rate protection pays out on at maturity.
        MetalRateService.FineRate rate = metalRateService.gold24kInrPerGram();
        BigDecimal grams = amount.divide(rate.inrPerGram(), 4, RoundingMode.HALF_UP);
        installment.setRatePerGram(rate.inrPerGram());
        installment.setRateIndicative(rate.indicative());
        installment.setGoldGrams(grams);
        account.setGoldGramsAccrued(grams4(account.getGoldGramsAccrued()).add(grams));

        account.setInstallmentsPaid(paid);
        account.setCurrentBalance(money(account.getCurrentBalance()).add(amount));
        if (STATUS_REDEEMED.equals(account.getStatus())) {
            account.setStatus(STATUS_MATURED); // money arriving after redemption is redeemable again
        }
        LocalDate due = account.getNextDueDate() == null ? LocalDate.now() : account.getNextDueDate();
        account.setNextDueDate(due.plusMonths(1));

        boolean matured = false;
        BigDecimal bonus = BigDecimal.ZERO;
        if (STATUS_ACTIVE.equals(account.getStatus()) && paid >= account.getTotalInstallments()) {
            bonus = bonusAmount(account);
            account.setCurrentBalance(account.getCurrentBalance().add(bonus));
            account.setStatus(STATUS_MATURED);
            account.setNextDueDate(null);
            matured = true;
        }

        TreasureChestAccount saved = treasureChestAccountRepository.save(account);
        TreasureInstallment savedInstallment = treasureInstallmentRepository.save(installment);

        // Advance receipt for the books; the outbox delivers it later.
        try {
            erpSyncService.enqueueAdvance(savedInstallment);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Treasure installment " + savedInstallment.getId() + ": ERP advance could not be queued", e);
        }

        sendInstallmentEmail(saved, savedInstallment);
        if (matured) {
            sendMaturedEmail(saved, bonus);
        }
        return saved;
    }

    // ------------------------------------------------------------------
    // Redemption at checkout (gold rate protection)
    // ------------------------------------------------------------------

    /**
     * What the account is worth today: the rupee balance (bonus included) or
     * the accrued grams at today's 24K rate, whichever is higher. Only a
     * MATURED account may be spent; the figure is still computed for the
     * others so the storefront can show the customer how the plan is doing.
     */
    public TreasureRedeemableDTO redeemable(TreasureChestAccount account) {
        MetalRateService.FineRate rate = metalRateService.gold24kInrPerGram();
        return redeemable(account, rate);
    }

    TreasureRedeemableDTO redeemable(TreasureChestAccount account, MetalRateService.FineRate rate) {
        BigDecimal balance = money(account.getCurrentBalance());
        BigDecimal grams = grams4(account.getGoldGramsAccrued());
        BigDecimal goldValue = grams.multiply(rate.inrPerGram()).setScale(2, RoundingMode.HALF_UP);
        boolean goldWins = goldValue.compareTo(balance) > 0;
        BigDecimal value = goldWins ? goldValue : balance;

        TreasureRedeemableDTO dto = new TreasureRedeemableDTO();
        dto.setAccountId(account.getId());
        dto.setStatus(account.getStatus());
        dto.setBalance(balance);
        dto.setGoldGramsAccrued(grams);
        dto.setRatePerGram(rate.inrPerGram());
        dto.setRateIndicative(rate.indicative());
        dto.setGoldValue(goldValue);
        dto.setRedeemableValue(value);
        dto.setBasis(goldWins ? BASIS_GOLD : BASIS_BALANCE);
        dto.setRedeemable(STATUS_MATURED.equals(account.getStatus()) && value.signum() > 0);
        return dto;
    }

    /** The redeemable view for the caller's own account, or for staff with treasure.write. */
    @Transactional(readOnly = true)
    public TreasureRedeemableDTO redeemableFor(UUID accountId, String userEmail, boolean staff) {
        TreasureChestAccount account = treasureChestAccountRepository.findById(accountId)
                .orElseThrow(() -> new EntityNotFoundException("Account not found"));
        if (!staff && !owns(account, userEmail)) {
            throw new EntityNotFoundException("Account not found");
        }
        return redeemable(account);
    }

    /** The user's account when it is MATURED; empty otherwise. */
    @Transactional(readOnly = true)
    public Optional<TreasureChestAccount> maturedAccountFor(User user, UUID accountId) {
        if (user == null || accountId == null) {
            return Optional.empty();
        }
        return treasureChestAccountRepository.findById(accountId)
                .filter(a -> a.getUser() != null && a.getUser().getId().equals(user.getId()))
                .filter(a -> STATUS_MATURED.equals(a.getStatus()));
    }

    /**
     * Spends {@code amount} of the account against {@code order}, inside the
     * order's transaction. The row is locked and the redeemable value is
     * recomputed, so a stale cart cannot overspend. Balance and grams are
     * reduced in proportion; when nothing worth mentioning is left the plan
     * becomes REDEEMED, otherwise the rest stays MATURED and redeemable.
     */
    @Transactional(rollbackFor = Exception.class)
    public TreasureChestAccount redeem(UUID accountId, BigDecimal amountRaw, Order order) {
        BigDecimal amount = money(amountRaw);
        if (amount.signum() <= 0) {
            throw new IllegalArgumentException("The Treasure amount to redeem must be positive.");
        }
        TreasureChestAccount account = treasureChestAccountRepository.findByIdForUpdate(accountId)
                .orElseThrow(() -> new IllegalArgumentException("The Treasure plan applied to the cart no longer exists."));
        if (order != null && order.getUser() != null && !owns(account, order.getUser().getEmail())) {
            throw new IllegalArgumentException("The Treasure plan applied to the cart belongs to another customer.");
        }
        if (!STATUS_MATURED.equals(account.getStatus())) {
            throw new IllegalArgumentException("Only a matured Treasure plan can be redeemed at checkout.");
        }
        TreasureRedeemableDTO value = redeemable(account);
        BigDecimal available = value.getRedeemableValue();
        if (amount.compareTo(available) > 0) {
            throw new IllegalArgumentException("Your Treasure plan now covers " + EmailText.inr(available)
                    + "; please re-apply it and try again.");
        }

        BigDecimal balance = money(account.getCurrentBalance());
        BigDecimal grams = grams4(account.getGoldGramsAccrued());
        BigDecimal fraction = amount.divide(available, 8, RoundingMode.HALF_UP);
        BigDecimal balancePart = balance.multiply(fraction).setScale(2, RoundingMode.HALF_UP).min(balance);
        BigDecimal gramsPart = grams.multiply(fraction).setScale(4, RoundingMode.HALF_UP).min(grams);
        BigDecimal remaining = available.subtract(amount);
        if (remaining.compareTo(BigDecimal.ONE) < 0) {
            // Whatever rounding leaves behind is not worth a second checkout.
            balancePart = balance;
            gramsPart = grams;
            account.setStatus(STATUS_REDEEMED);
        }

        account.setCurrentBalance(balance.subtract(balancePart));
        account.setGoldGramsAccrued(grams.subtract(gramsPart));
        account.setRedeemedAmount(money(account.getRedeemedAmount()).add(amount));
        account.setRedeemedBalance(money(account.getRedeemedBalance()).add(balancePart));
        account.setRedeemedGrams(grams4(account.getRedeemedGrams()).add(gramsPart));
        account.setRedeemedOrderId(order == null ? null : order.getId());
        return treasureChestAccountRepository.save(account);
    }

    /**
     * Reverse of {@link #redeem} for a CANCELLED / REFUNDED order: the share
     * of balance and grams that order consumed goes back and the plan is
     * MATURED (redeemable) again. Idempotent per order; a missing account is
     * logged, not fatal to the cancellation.
     */
    @Transactional(rollbackFor = Exception.class)
    public void restore(Order order) {
        if (order == null || order.getAppliedTreasureAccountId() == null
                || order.getTreasureAmount() == null || order.getTreasureAmount().signum() <= 0) {
            return;
        }
        BigDecimal amount = money(order.getTreasureAmount());
        Optional<TreasureChestAccount> found = treasureChestAccountRepository.findByIdForUpdate(order.getAppliedTreasureAccountId());
        if (found.isEmpty()) {
            LOGGER.warning("Order " + order.getOrderNumber() + ": Treasure account " + order.getAppliedTreasureAccountId()
                    + " no longer exists; nothing restored");
            return;
        }
        TreasureChestAccount account = found.get();
        BigDecimal redeemed = money(account.getRedeemedAmount());
        if (redeemed.signum() <= 0) {
            return; // already restored (or never redeemed)
        }
        BigDecimal share = amount.compareTo(redeemed) >= 0 ? BigDecimal.ONE : amount.divide(redeemed, 8, RoundingMode.HALF_UP);
        BigDecimal balanceBack = money(account.getRedeemedBalance()).multiply(share).setScale(2, RoundingMode.HALF_UP);
        BigDecimal gramsBack = grams4(account.getRedeemedGrams()).multiply(share).setScale(4, RoundingMode.HALF_UP);

        account.setCurrentBalance(money(account.getCurrentBalance()).add(balanceBack));
        account.setGoldGramsAccrued(grams4(account.getGoldGramsAccrued()).add(gramsBack));
        account.setRedeemedAmount(redeemed.subtract(amount).max(BigDecimal.ZERO));
        account.setRedeemedBalance(money(account.getRedeemedBalance()).subtract(balanceBack).max(BigDecimal.ZERO));
        account.setRedeemedGrams(grams4(account.getRedeemedGrams()).subtract(gramsBack).max(BigDecimal.ZERO));
        if (account.getRedeemedAmount().signum() == 0) {
            account.setRedeemedOrderId(null);
        }
        if (STATUS_REDEEMED.equals(account.getStatus())) {
            account.setStatus(STATUS_MATURED);
        }
        treasureChestAccountRepository.save(account);
    }

    private static boolean owns(TreasureChestAccount account, String userEmail) {
        return account.getUser() != null && account.getUser().getEmail() != null && userEmail != null
                && account.getUser().getEmail().equalsIgnoreCase(userEmail);
    }

    // ------------------------------------------------------------------
    // Mapping
    // ------------------------------------------------------------------

    public TreasureInstallmentDTO toInstallmentDTO(TreasureInstallment installment) {
        if (installment == null) return null;
        TreasureInstallmentDTO dto = new TreasureInstallmentDTO();
        dto.setId(installment.getId());
        dto.setInstallmentNumber(installment.getInstallmentNumber());
        dto.setAmount(installment.getAmount());
        dto.setMethod(installment.getMethod());
        dto.setStatus(installment.getStatus());
        dto.setRazorpayOrderId(installment.getRazorpayOrderId());
        dto.setRazorpayPaymentId(installment.getRazorpayPaymentId());
        dto.setPaidAt(installment.getPaidAt());
        dto.setGoldGrams(installment.getGoldGrams());
        dto.setRatePerGram(installment.getRatePerGram());
        dto.setRateIndicative(installment.isRateIndicative());
        dto.setNote(installment.getNote());
        dto.setCreatedAt(installment.getCreatedAt());
        return dto;
    }

    /**
     * Adds the rate-dependent figures (today's value, redeemable value) and
     * the redeemed order number to a mapped account DTO. One rate lookup per
     * call; the admin list passes its own so the whole page shares one.
     */
    public TreasureChestAccountDTO enrich(TreasureChestAccountDTO dto, TreasureChestAccount account,
                                          MetalRateService.FineRate rate) {
        if (dto == null || account == null) return dto;
        TreasureRedeemableDTO value = redeemable(account, rate == null ? metalRateService.gold24kInrPerGram() : rate);
        dto.setGoldGramsAccrued(value.getGoldGramsAccrued());
        dto.setRatePerGram(value.getRatePerGram());
        dto.setRateIndicative(value.isRateIndicative());
        dto.setGoldValue(value.getGoldValue());
        dto.setRedeemableValue(STATUS_MATURED.equals(account.getStatus()) || STATUS_REDEEMED.equals(account.getStatus())
                ? value.getRedeemableValue() : null);
        dto.setRedeemableBasis(value.getBasis());
        dto.setRedeemedAmount(account.getRedeemedAmount());
        dto.setRedeemedOrderId(account.getRedeemedOrderId());
        if (account.getRedeemedOrderId() != null) {
            dto.setRedeemedOrderNumber(orderRepository.findById(account.getRedeemedOrderId())
                    .map(Order::getOrderNumber).orElse(null));
        }
        if (account.getUser() != null) {
            dto.setUserId(account.getUser().getId());
            dto.setCustomerName(customerName(account));
            dto.setCustomerEmail(account.getUser().getEmail());
        }
        return dto;
    }

    public MetalRateService.FineRate todayRate() {
        return metalRateService.gold24kInrPerGram();
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    /** ACTIVE with installments left; otherwise a 400 explaining why nothing can be paid. */
    private static void requirePayable(TreasureChestAccount account) {
        if (!STATUS_ACTIVE.equals(account.getStatus())) {
            String status = account.getStatus() == null ? "not active" : account.getStatus().toLowerCase();
            throw new IllegalArgumentException("This plan is " + status + "; no further installments can be paid.");
        }
        if (account.getInstallmentsPaid() >= account.getTotalInstallments()) {
            throw new IllegalArgumentException("All installments of this plan have been paid.");
        }
    }

    private static BigDecimal normalizeAmount(BigDecimal amount) {
        if (amount == null) {
            throw new IllegalArgumentException("An installment amount is required.");
        }
        BigDecimal whole;
        try {
            whole = amount.setScale(0, RoundingMode.UNNECESSARY);
        } catch (ArithmeticException e) {
            throw new IllegalArgumentException("The installment amount must be a whole number of rupees.");
        }
        if (whole.compareTo(MIN_AMOUNT) < 0) {
            throw new IllegalArgumentException("Installments start at " + EmailText.inr(MIN_AMOUNT) + ".");
        }
        if (whole.compareTo(MAX_AMOUNT) > 0) {
            throw new IllegalArgumentException("Installments may not exceed " + EmailText.inr(MAX_AMOUNT) + ".");
        }
        return whole.setScale(2, RoundingMode.HALF_UP);
    }

    private static int toPaise(BigDecimal rupees) {
        return rupees.multiply(HUNDRED).setScale(0, RoundingMode.HALF_UP).intValueExact();
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal grams4(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(4, RoundingMode.HALF_UP);
    }

    private static String optionalText(String value, int maxLength) {
        if (value == null) return null;
        String v = value.trim();
        if (v.isEmpty()) return null;
        if (v.length() > maxLength) {
            throw new IllegalArgumentException("Text may not exceed " + maxLength + " characters.");
        }
        return v;
    }

    // ------------------------------------------------------------------
    // Emails (seeded templates; never allowed to fail the payment)
    // ------------------------------------------------------------------

    private void sendInstallmentEmail(TreasureChestAccount account, TreasureInstallment installment) {
        try {
            String to = recipient(account);
            if (to == null) {
                LOGGER.warning("Treasure account " + account.getId() + ": no customer email, skipping installment email");
                return;
            }
            Map<String, String> data = baseData(account);
            data.put("installmentNumber", String.valueOf(installment.getInstallmentNumber()));
            data.put("totalInstallments", String.valueOf(account.getTotalInstallments()));
            data.put("amount", EmailText.inr(installment.getAmount()));
            data.put("nextDueDate", account.getNextDueDate() == null
                    ? (STATUS_MATURED.equals(account.getStatus()) ? "None: your plan has matured" : "To be confirmed")
                    : account.getNextDueDate().format(DATE_FORMAT));
            emailService.sendTemplate("TREASURE_INSTALLMENT", to, EmailTemplateSeeder.TREASURE_INSTALLMENT, data);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Treasure account " + account.getId() + ": installment email could not be sent", e);
        }
    }

    private void sendMaturedEmail(TreasureChestAccount account, BigDecimal bonus) {
        try {
            String to = recipient(account);
            if (to == null) {
                return;
            }
            Map<String, String> data = baseData(account);
            data.put("bonus", EmailText.inr(bonus));
            // TODO(notifications): route through service/notification NotificationService.notify(
            //   NotificationEvent.TREASURE_MATURED, Recipient.of(account.getUser(), account.getId().toString()), data)
            //   so the customer also gets WhatsApp/SMS; needs a NotificationService field here, which this class's owner adds.
            emailService.sendTemplate("TREASURE_MATURED", to, EmailTemplateSeeder.TREASURE_MATURED, data);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Treasure account " + account.getId() + ": maturity email could not be sent", e);
        }
    }

    private Map<String, String> baseData(TreasureChestAccount account) {
        Map<String, String> data = new HashMap<>();
        data.put("customerName", EmailText.escape(customerName(account)));
        data.put("planName", EmailText.escape(account.getPlanName() == null ? DEFAULT_PLAN_NAME : account.getPlanName()));
        data.put("balance", EmailText.inr(account.getCurrentBalance()));
        data.put("storefrontUrl", EmailText.trimSlash(frontendUrl));
        return data;
    }

    private static String recipient(TreasureChestAccount account) {
        User user = account.getUser();
        if (user != null && user.getEmail() != null && !user.getEmail().isBlank()) {
            return user.getEmail();
        }
        return null;
    }

    private static String customerName(TreasureChestAccount account) {
        User user = account.getUser();
        if (user != null) {
            String first = user.getFirstName() == null ? "" : user.getFirstName().trim();
            String last = user.getLastName() == null ? "" : user.getLastName().trim();
            String name = (first + " " + last).trim();
            if (!name.isEmpty()) {
                return name;
            }
        }
        return "Customer";
    }
}
