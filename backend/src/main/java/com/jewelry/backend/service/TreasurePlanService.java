package com.jewelry.backend.service;

import com.jewelry.backend.config.EmailTemplateSeeder;
import com.jewelry.backend.dto.CreateRazorpayOrderRequest;
import com.jewelry.backend.dto.RazorpayOrderResponse;
import com.jewelry.backend.dto.TreasureEnrollRequest;
import com.jewelry.backend.dto.TreasureInstallmentConfirmRequest;
import com.jewelry.backend.dto.TreasureInstallmentDTO;
import com.jewelry.backend.dto.TreasureInstallmentOrderResponse;
import com.jewelry.backend.dto.TreasurePlanConfigDTO;
import com.jewelry.backend.dto.VerifyPaymentRequest;
import com.jewelry.backend.entity.TreasureChestAccount;
import com.jewelry.backend.entity.TreasureInstallment;
import com.jewelry.backend.entity.User;
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
    public static final String STATUS_CLOSED = "CLOSED";

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
     * status.
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

        account.setInstallmentsPaid(paid);
        account.setCurrentBalance(money(account.getCurrentBalance()).add(amount));
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
        treasureInstallmentRepository.save(installment);

        sendInstallmentEmail(saved, installment);
        if (matured) {
            sendMaturedEmail(saved, bonus);
        }
        return saved;
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
        dto.setNote(installment.getNote());
        dto.setCreatedAt(installment.getCreatedAt());
        return dto;
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
