package com.jewelry.backend.service;

import com.jewelry.backend.config.EmailTemplateSeeder;
import com.jewelry.backend.dto.CreateExchangeRequest;
import com.jewelry.backend.dto.ExchangeAssayRequest;
import com.jewelry.backend.dto.ExchangeQuoteResponse;
import com.jewelry.backend.dto.ExchangeRequestDTO;
import com.jewelry.backend.entity.ErpSyncEvent;
import com.jewelry.backend.entity.ExchangeRequest;
import com.jewelry.backend.entity.ExchangeRequestEvent;
import com.jewelry.backend.entity.ExchangeSequence;
import com.jewelry.backend.entity.GiftCard;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.ExchangeRequestEventRepository;
import com.jewelry.backend.repository.ExchangeRequestRepository;
import com.jewelry.backend.repository.ExchangeSequenceRepository;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.util.EmailText;
import com.jewelry.backend.util.GstStateCodes;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Pattern;

/**
 * Old gold / silver exchange: live quote, request intake with Rule 114B PAN
 * capture, the counter workflow (receive, assay, credit or reject) and the
 * store-credit gift card plus ERP purchase that a credit produces.
 *
 * Rates: gold comes from MetalRateService (GoldAPI USD per gram converted
 * with the {@code usdRate} setting; see that class for the convention).
 * Silver has no feed: {@code silverRatePerGram} (INR per gram fine) is read
 * from settings and is always marked indicative.
 */
@Service
public class ExchangeService {

    private static final Logger LOGGER = Logger.getLogger(ExchangeService.class.getName());
    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("d MMMM yyyy");

    static final BigDecimal PAN_THRESHOLD = new BigDecimal("200000");
    private static final Pattern PAN_FORMAT = Pattern.compile("[A-Z]{5}[0-9]{4}[A-Z]");
    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final BigDecimal DEFAULT_DEDUCTION_PCT = new BigDecimal("2");
    private static final BigDecimal FALLBACK_SILVER_INR_PER_GRAM = new BigDecimal("95");

    static final String SETTING_DEDUCTION = "oldGoldDeductionPct";
    static final String SETTING_USD_RATE = "usdRate";
    static final String SETTING_SILVER_RATE = "silverRatePerGram";

    /** Purity label -> fine-metal fraction, per metal. Keys are upper-case without spaces. */
    private static final Map<String, BigDecimal> GOLD_PURITIES = new LinkedHashMap<>();
    private static final Map<String, BigDecimal> SILVER_PURITIES = new LinkedHashMap<>();

    static {
        GOLD_PURITIES.put("24K", new BigDecimal("0.999"));
        GOLD_PURITIES.put("999", new BigDecimal("0.999"));
        GOLD_PURITIES.put("22K", new BigDecimal("0.916"));
        GOLD_PURITIES.put("916", new BigDecimal("0.916"));
        GOLD_PURITIES.put("18K", new BigDecimal("0.750"));
        GOLD_PURITIES.put("750", new BigDecimal("0.750"));
        GOLD_PURITIES.put("14K", new BigDecimal("0.585"));
        GOLD_PURITIES.put("585", new BigDecimal("0.585"));
        SILVER_PURITIES.put("999", new BigDecimal("0.999"));
        SILVER_PURITIES.put("925", new BigDecimal("0.925"));
        SILVER_PURITIES.put("STERLING", new BigDecimal("0.925"));
    }

    @Autowired
    ExchangeRequestRepository requestRepository;

    @Autowired
    ExchangeRequestEventRepository eventRepository;

    @Autowired
    ExchangeSequenceRepository sequenceRepository;

    @Autowired
    GlobalSettingRepository globalSettingRepository;

    @Autowired
    MetalRateService metalRateService;

    @Autowired
    GiftCardService giftCardService;

    @Autowired
    ErpSyncService erpSyncService;

    @Autowired
    EmailService emailService;

    @Value("${app.frontend-url:http://localhost:4200}")
    private String frontendUrl;

    // ------------------------------------------------------------------
    // Quote
    // ------------------------------------------------------------------

    /** Live rate for one gram of fine metal in INR, and whether it is a fallback figure. */
    record FineRate(BigDecimal inrPerGram, boolean indicative) {
    }

    public ExchangeQuoteResponse quote(String metalRaw, String purityRaw, BigDecimal weight) {
        String metal = normalizeMetal(metalRaw);
        String purity = normalizePurityLabel(purityRaw);
        BigDecimal purityFraction = purityFraction(metal, purity);
        if (weight == null || weight.signum() <= 0) {
            throw new IllegalArgumentException("Weight in grams must be above zero.");
        }
        FineRate fine = fineRate(metal);
        BigDecimal deduction = deductionPct();
        BigDecimal rateAtPurity = fine.inrPerGram().multiply(purityFraction).setScale(2, RoundingMode.HALF_UP);
        BigDecimal value = estimate(fine.inrPerGram(), purityFraction, weight, deduction);

        ExchangeQuoteResponse response = new ExchangeQuoteResponse();
        response.setMetal(metal);
        response.setPurity(purity);
        response.setPurityFraction(purityFraction);
        response.setWeightGrams(weight.setScale(3, RoundingMode.HALF_UP));
        response.setRatePerGramFine(fine.inrPerGram().setScale(2, RoundingMode.HALF_UP));
        response.setRate(rateAtPurity);
        response.setDeductionPct(deduction);
        response.setEstimatedValue(value);
        response.setIndicative(fine.indicative());
        response.setPanRequired(value.compareTo(PAN_THRESHOLD) >= 0);
        return response;
    }

    /** rate x purity x weight x (1 - deduction%), rounded to the rupee. */
    static BigDecimal estimate(BigDecimal ratePerGramFine, BigDecimal purityFraction, BigDecimal weight, BigDecimal deductionPct) {
        BigDecimal factor = BigDecimal.ONE.subtract(deductionPct.divide(HUNDRED, 6, RoundingMode.HALF_UP));
        return ratePerGramFine.multiply(purityFraction).multiply(weight).multiply(factor)
                .setScale(0, RoundingMode.HALF_UP).setScale(2, RoundingMode.HALF_UP);
    }

    FineRate fineRate(String metal) {
        if (ExchangeRequest.METAL_SILVER.equals(metal)) {
            BigDecimal silver = setting(SETTING_SILVER_RATE).map(ExchangeService::parseDecimal).orElse(null);
            return new FineRate(silver == null || silver.signum() <= 0 ? FALLBACK_SILVER_INR_PER_GRAM : silver, true);
        }
        // Gold: GoldAPI USD/gram converted with the usdRate setting, shared
        // with the Treasure plan's gram accrual so both quote the same rupee.
        MetalRateService.FineRate gold = metalRateService.gold24kInrPerGram();
        return new FineRate(gold.inrPerGram(), gold.indicative());
    }

    BigDecimal deductionPct() {
        return setting(SETTING_DEDUCTION).map(ExchangeService::parseDecimal)
                .filter(d -> d.signum() >= 0 && d.compareTo(HUNDRED) <= 0)
                .orElse(DEFAULT_DEDUCTION_PCT)
                .setScale(2, RoundingMode.HALF_UP);
    }

    // ------------------------------------------------------------------
    // Customer
    // ------------------------------------------------------------------

    @Transactional(rollbackFor = Exception.class)
    public ExchangeRequest create(CreateExchangeRequest body, User user) {
        String metal = normalizeMetal(body.getMetal());
        String purity = normalizePurityLabel(body.getPurity());
        BigDecimal purityFraction = purityFraction(metal, purity);
        BigDecimal weight = body.getWeightGrams();
        if (weight == null || weight.signum() <= 0) {
            throw new IllegalArgumentException("Weight in grams must be above zero.");
        }

        String name = firstNonBlank(body.getCustomerName(), user == null ? null : join(user.getFirstName(), user.getLastName()));
        String email = firstNonBlank(body.getEmail(), user == null ? null : user.getEmail());
        String phone = firstNonBlank(body.getPhone(), user == null ? null : user.getPhone());
        if (name == null) {
            throw new IllegalArgumentException("Your name is required.");
        }
        if (phone == null) {
            throw new IllegalArgumentException("A phone number is required so we can reach you about the item.");
        }
        if (email == null) {
            throw new IllegalArgumentException("An email address is required; the store-credit code is sent there.");
        }
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            throw new IllegalArgumentException("Please enter a valid email address.");
        }

        FineRate fine = fineRate(metal);
        BigDecimal deduction = deductionPct();
        BigDecimal quotedValue = estimate(fine.inrPerGram(), purityFraction, weight, deduction);
        String pan = normalizePan(body.getPan());
        if (quotedValue.compareTo(PAN_THRESHOLD) >= 0 && pan == null) {
            throw new IllegalArgumentException(
                    "A PAN is required for old gold worth Rs 2,00,000 or more (Income-tax Rule 114B).");
        }

        ExchangeRequest request = new ExchangeRequest();
        request.setRequestNumber(nextRequestNumber());
        request.setUser(user);
        request.setCustomerName(name.length() > 120 ? name.substring(0, 120) : name);
        request.setEmail(email.toLowerCase(Locale.ROOT));
        request.setPhone(phone);
        request.setMetal(metal);
        request.setDeclaredPurity(purity);
        request.setDeclaredPurityFraction(purityFraction);
        request.setDeclaredWeightGrams(weight.setScale(3, RoundingMode.HALF_UP));
        request.setQuotedRatePerGram(fine.inrPerGram());
        request.setQuotedDeductionPct(deduction);
        request.setQuotedValue(quotedValue);
        request.setQuoteIndicative(fine.indicative());
        request.setStatus(ExchangeRequest.STATUS_REQUESTED);
        request.setPan(pan);
        request.setIdProofType(blankToNull(body.getIdProofType()));
        request.setIdProofNumber(blankToNull(body.getIdProofNumber()));
        request.setStateCode(GstStateCodes.codeFor(body.getState()));
        request.setItemDescription(blankToNull(body.getItemDescription()));

        ExchangeRequest saved = requestRepository.save(request);
        addEvent(saved, ExchangeRequest.STATUS_REQUESTED, "Request placed from the storefront", "customer");
        return saved;
    }

    @Transactional(readOnly = true)
    public List<ExchangeRequest> mine(User user) {
        return requestRepository.findByUserIdOrderByCreatedAtDesc(user.getId());
    }

    /** Public lookup: the request number plus the phone it was placed with (last 10 digits compared). */
    @Transactional(readOnly = true)
    public ExchangeRequest track(String requestNumber, String phone) {
        if (requestNumber == null || requestNumber.isBlank()) {
            throw new IllegalArgumentException("A request number is required.");
        }
        ExchangeRequest request = requestRepository.findByRequestNumberIgnoreCase(requestNumber.trim())
                .orElseThrow(() -> new EntityNotFoundException("Exchange request not found"));
        if (!samePhone(request.getPhone(), phone)) {
            throw new EntityNotFoundException("Exchange request not found");
        }
        return request;
    }

    /** Customer cancels their own request while it is still REQUESTED. */
    @Transactional(rollbackFor = Exception.class)
    public ExchangeRequest cancelByCustomer(UUID id, User user) {
        ExchangeRequest request = get(id);
        if (request.getUser() == null || user == null || !request.getUser().getId().equals(user.getId())) {
            throw new EntityNotFoundException("Exchange request not found");
        }
        if (!ExchangeRequest.STATUS_REQUESTED.equals(request.getStatus())) {
            throw new IllegalArgumentException("Only a request we have not yet received can be cancelled online.");
        }
        return close(request, ExchangeRequest.STATUS_CANCELLED, "Cancelled by the customer", user.getEmail());
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Page<ExchangeRequest> list(int page, int size, String status) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        if (status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)) {
            return requestRepository.findAll(pageable);
        }
        return requestRepository.findByStatus(status.trim().toUpperCase(Locale.ROOT), pageable);
    }

    @Transactional(readOnly = true)
    public ExchangeRequest get(UUID id) {
        return requestRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Exchange request not found"));
    }

    @Transactional(rollbackFor = Exception.class)
    public ExchangeRequest receive(UUID id, String note, String actor) {
        ExchangeRequest request = get(id);
        requireStatus(request, ExchangeRequest.STATUS_REQUESTED);
        request.setStatus(ExchangeRequest.STATUS_RECEIVED);
        request.setReceivedAt(LocalDateTime.now());
        ExchangeRequest saved = requestRepository.save(request);
        addEvent(saved, ExchangeRequest.STATUS_RECEIVED, firstNonBlank(note, "Item received for assay"), actor);
        sendReceived(saved);
        return saved;
    }

    @Transactional(rollbackFor = Exception.class)
    public ExchangeRequest assay(UUID id, ExchangeAssayRequest body, String actor) {
        ExchangeRequest request = get(id);
        if (!ExchangeRequest.STATUS_RECEIVED.equals(request.getStatus())
                && !ExchangeRequest.STATUS_ASSAYED.equals(request.getStatus())) {
            throw new IllegalArgumentException("The item must be received before it can be assayed (current status "
                    + request.getStatus() + ").");
        }
        BigDecimal purity = body.getAssayedPurityFraction();
        BigDecimal netWeight = body.getAssayedNetWeightGrams();
        BigDecimal rate = body.getAssayedRatePerGram() != null ? body.getAssayedRatePerGram()
                : fineRate(request.getMetal()).inrPerGram();
        BigDecimal deduction = body.getDeductionPct() != null ? body.getDeductionPct() : deductionPct();
        BigDecimal finalValue = estimate(rate, purity, netWeight, deduction);

        String pan = normalizePan(body.getPan());
        if (pan != null) {
            request.setPan(pan);
        }
        if (finalValue.compareTo(PAN_THRESHOLD) >= 0 && request.getPan() == null) {
            throw new IllegalArgumentException(
                    "The assayed value is Rs 2,00,000 or more: record the customer's PAN (Rule 114B) before saving the assay.");
        }

        request.setAssayedPurityFraction(purity.setScale(4, RoundingMode.HALF_UP));
        request.setAssayedNetWeightGrams(netWeight.setScale(3, RoundingMode.HALF_UP));
        request.setAssayedRatePerGram(rate.setScale(2, RoundingMode.HALF_UP));
        request.setDeductionPct(deduction.setScale(2, RoundingMode.HALF_UP));
        request.setFinalValue(finalValue);
        request.setStatus(ExchangeRequest.STATUS_ASSAYED);
        request.setAssayedAt(LocalDateTime.now());
        ExchangeRequest saved = requestRepository.save(request);
        addEvent(saved, ExchangeRequest.STATUS_ASSAYED,
                firstNonBlank(body.getNote(), "Assayed: purity " + purity.stripTrailingZeros().toPlainString()
                        + ", net " + netWeight.stripTrailingZeros().toPlainString() + " g, value " + EmailText.inr(finalValue)),
                actor);
        return saved;
    }

    /**
     * Issues the store credit (gift card, source EXCHANGE), e-mails the code,
     * and queues the RCM purchase for the ERP. One transaction: if the card
     * cannot be issued, nothing changes.
     */
    @Transactional(rollbackFor = Exception.class)
    public ExchangeRequest credit(UUID id, String actor) {
        ExchangeRequest request = get(id);
        requireStatus(request, ExchangeRequest.STATUS_ASSAYED);
        if (request.getFinalValue() == null || request.getFinalValue().signum() <= 0) {
            throw new IllegalArgumentException("Record an assay with a positive value before crediting.");
        }
        if (request.getFinalValue().compareTo(PAN_THRESHOLD) >= 0 && request.getPan() == null) {
            throw new IllegalArgumentException("A PAN is required for a value of Rs 2,00,000 or more (Rule 114B).");
        }

        GiftCard card = giftCardService.issueExchangeCredit(request.getId(), request.getRequestNumber(),
                request.getFinalValue(), request.getCustomerName(), request.getEmail(), actor);

        request.setCreditGiftCardCode(card.getCode());
        request.setStatus(ExchangeRequest.STATUS_CREDITED);
        request.setCreditedAt(LocalDateTime.now());
        request.setClosedAt(request.getCreditedAt());
        ExchangeRequest saved = requestRepository.save(request);
        addEvent(saved, ExchangeRequest.STATUS_CREDITED,
                "Store credit " + EmailText.inr(saved.getFinalValue()) + " issued as " + GiftCardService.maskCode(card.getCode()),
                actor);
        erpSyncService.enqueueOldGoldPurchase(saved);
        sendCredited(saved, card);
        return saved;
    }

    @Transactional(rollbackFor = Exception.class)
    public ExchangeRequest reject(UUID id, String reason, String actor) {
        ExchangeRequest request = get(id);
        if (!request.isOpen()) {
            throw new IllegalArgumentException("The request is already " + request.getStatus().toLowerCase() + ".");
        }
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("A reason is required when rejecting an exchange.");
        }
        request.setRejectionReason(reason.trim());
        ExchangeRequest saved = close(request, ExchangeRequest.STATUS_REJECTED, reason.trim(), actor);
        sendRejected(saved);
        return saved;
    }

    @Transactional(rollbackFor = Exception.class)
    public ExchangeRequest cancel(UUID id, String note, String actor) {
        ExchangeRequest request = get(id);
        if (!request.isOpen()) {
            throw new IllegalArgumentException("The request is already " + request.getStatus().toLowerCase() + ".");
        }
        return close(request, ExchangeRequest.STATUS_CANCELLED, firstNonBlank(note, "Cancelled"), actor);
    }

    private ExchangeRequest close(ExchangeRequest request, String status, String note, String actor) {
        request.setStatus(status);
        request.setClosedAt(LocalDateTime.now());
        ExchangeRequest saved = requestRepository.save(request);
        addEvent(saved, status, note, actor);
        return saved;
    }

    private static void requireStatus(ExchangeRequest request, String expected) {
        if (!expected.equals(request.getStatus())) {
            throw new IllegalArgumentException("This action needs status " + expected + "; the request is "
                    + request.getStatus() + ".");
        }
    }

    private void addEvent(ExchangeRequest request, String status, String note, String actor) {
        ExchangeRequestEvent event = new ExchangeRequestEvent();
        event.setExchangeRequest(request);
        event.setStatus(status);
        event.setNote(note);
        event.setActor(actor == null || actor.isBlank() ? "system" : actor);
        event.setAt(LocalDateTime.now());
        eventRepository.save(event);
    }

    // ------------------------------------------------------------------
    // Numbering
    // ------------------------------------------------------------------

    /** EX-YYYY-00001, consecutive per calendar year, allocated under a row lock. */
    private String nextRequestNumber() {
        String year = String.valueOf(LocalDateTime.now(INDIA).getYear());
        sequenceRepository.ensureRow(year);
        ExchangeSequence sequence = sequenceRepository.lockByYear(year)
                .orElseThrow(() -> new IllegalStateException("Exchange sequence row missing for " + year));
        long next = sequence.getLastNumber() + 1;
        sequence.setLastNumber(next);
        sequenceRepository.save(sequence);
        return String.format("EX-%s-%05d", year, next);
    }

    // ------------------------------------------------------------------
    // Mapping
    // ------------------------------------------------------------------

    public ExchangeRequestDTO toDTO(ExchangeRequest r, boolean admin) {
        ExchangeRequestDTO dto = new ExchangeRequestDTO();
        dto.setId(r.getId());
        dto.setRequestNumber(r.getRequestNumber());
        dto.setUserId(r.getUser() == null ? null : r.getUser().getId());
        dto.setCustomerName(r.getCustomerName());
        dto.setEmail(r.getEmail());
        dto.setPhone(r.getPhone());
        dto.setMetal(r.getMetal());
        dto.setDeclaredPurity(r.getDeclaredPurity());
        dto.setDeclaredPurityFraction(r.getDeclaredPurityFraction());
        dto.setDeclaredWeightGrams(r.getDeclaredWeightGrams());
        dto.setQuotedRatePerGram(r.getQuotedRatePerGram());
        dto.setQuotedDeductionPct(r.getQuotedDeductionPct());
        dto.setQuotedValue(r.getQuotedValue());
        dto.setQuoteIndicative(r.isQuoteIndicative());
        dto.setStatus(r.getStatus());
        dto.setAssayedPurityFraction(r.getAssayedPurityFraction());
        dto.setAssayedNetWeightGrams(r.getAssayedNetWeightGrams());
        dto.setAssayedRatePerGram(r.getAssayedRatePerGram());
        dto.setDeductionPct(r.getDeductionPct());
        dto.setFinalValue(r.getFinalValue());
        dto.setRejectionReason(r.getRejectionReason());
        BigDecimal reference = r.getFinalValue() != null ? r.getFinalValue() : r.getQuotedValue();
        dto.setPanRequired(reference != null && reference.compareTo(PAN_THRESHOLD) >= 0);
        dto.setStateCode(r.getStateCode());
        dto.setCreditGiftCardCode(admin ? r.getCreditGiftCardCode() : GiftCardService.maskCode(r.getCreditGiftCardCode()));
        dto.setErpPurchaseRef(r.getErpPurchaseRef());
        dto.setItemDescription(r.getItemDescription());
        dto.setReceivedAt(r.getReceivedAt());
        dto.setAssayedAt(r.getAssayedAt());
        dto.setCreditedAt(r.getCreditedAt());
        dto.setClosedAt(r.getClosedAt());
        dto.setCreatedAt(r.getCreatedAt());
        dto.setUpdatedAt(r.getUpdatedAt());
        if (admin) {
            dto.setPan(r.getPan());
            dto.setIdProofType(r.getIdProofType());
            dto.setIdProofNumber(r.getIdProofNumber());
            dto.setNotes(r.getNotes());
            Optional<ErpSyncEvent> sync = erpSyncService.findExchangeEvent(r.getId());
            dto.setErpSyncStatus(sync.map(ErpSyncEvent::getStatus).orElse(null));
            dto.setErpSyncError(sync.map(ErpSyncEvent::getLastError).orElse(null));
        } else {
            dto.setPan(maskPan(r.getPan()));
            dto.setIdProofType(r.getIdProofType());
        }
        dto.setEvents(eventRepository.findByExchangeRequestIdOrderByAtAsc(r.getId()).stream().map(e -> {
            ExchangeRequestDTO.Event ev = new ExchangeRequestDTO.Event();
            ev.setStatus(e.getStatus());
            ev.setNote(e.getNote());
            ev.setActor(admin ? e.getActor() : ("customer".equals(e.getActor()) ? "You" : "Caratloop"));
            ev.setAt(e.getAt());
            return ev;
        }).toList());
        return dto;
    }

    // ------------------------------------------------------------------
    // E-mails (never allowed to fail the business operation)
    // ------------------------------------------------------------------

    private void sendReceived(ExchangeRequest r) {
        Map<String, String> data = baseData(r);
        send(r, EmailTemplateSeeder.EXCHANGE_RECEIVED, "EXCHANGE_RECEIVED", data);
    }

    private void sendCredited(ExchangeRequest r, GiftCard card) {
        Map<String, String> data = baseData(r);
        data.put("amount", EmailText.inr(r.getFinalValue()));
        data.put("code", EmailText.escape(card.getCode()));
        data.put("expiresAt", card.getExpiresAt() == null ? "" : card.getExpiresAt().format(DATE_FORMAT));
        data.put("purity", r.getAssayedPurityFraction() == null ? "" : r.getAssayedPurityFraction().stripTrailingZeros().toPlainString());
        data.put("netWeight", r.getAssayedNetWeightGrams() == null ? "" : r.getAssayedNetWeightGrams().stripTrailingZeros().toPlainString());
        data.put("rate", EmailText.inr(r.getAssayedRatePerGram()));
        send(r, EmailTemplateSeeder.EXCHANGE_CREDITED, "EXCHANGE_CREDITED", data);
    }

    private void sendRejected(ExchangeRequest r) {
        Map<String, String> data = baseData(r);
        data.put("reason", EmailText.escape(r.getRejectionReason() == null ? "No reason was recorded." : r.getRejectionReason()));
        send(r, EmailTemplateSeeder.EXCHANGE_REJECTED, "EXCHANGE_REJECTED", data);
    }

    private Map<String, String> baseData(ExchangeRequest r) {
        Map<String, String> data = new HashMap<>();
        data.put("requestNumber", r.getRequestNumber());
        data.put("customerName", EmailText.escape(r.getCustomerName()));
        data.put("storefrontUrl", EmailText.trimSlash(frontendUrl));
        data.put("metal", r.getMetal() == null ? "" : r.getMetal().charAt(0) + r.getMetal().substring(1).toLowerCase(Locale.ROOT));
        data.put("declaredPurity", r.getDeclaredPurity() == null ? "" : EmailText.escape(r.getDeclaredPurity()));
        data.put("declaredWeight", r.getDeclaredWeightGrams() == null ? "" : r.getDeclaredWeightGrams().stripTrailingZeros().toPlainString());
        return data;
    }

    @Autowired
    com.jewelry.backend.service.notification.NotificationService notificationService;

    /** E-mail (unchanged template), plus WhatsApp and SMS, through NotificationService; never throws. */
    private void send(ExchangeRequest r, String templateName, String type, Map<String, String> data) {
        try {
            com.jewelry.backend.service.notification.NotificationEvent event =
                    com.jewelry.backend.service.notification.NotificationEvent.parse(type);
            if (event == null) {
                if (r.getEmail() != null && !r.getEmail().isBlank()) {
                    emailService.sendTemplate(type, r.getEmail(), templateName, data);
                }
                return;
            }
            notificationService.notify(event,
                    com.jewelry.backend.service.notification.Recipient.of(
                            r.getUser(), r.getCustomerName(), r.getEmail(), r.getPhone(), r.getRequestNumber()),
                    data);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Exchange " + r.getRequestNumber() + ": " + templateName + " notification could not be sent", e);
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    static String normalizeMetal(String metal) {
        if (metal == null) {
            throw new IllegalArgumentException("Metal is required (GOLD or SILVER).");
        }
        String m = metal.trim().toUpperCase(Locale.ROOT);
        if (!ExchangeRequest.METAL_GOLD.equals(m) && !ExchangeRequest.METAL_SILVER.equals(m)) {
            throw new IllegalArgumentException("Metal must be GOLD or SILVER.");
        }
        return m;
    }

    static String normalizePurityLabel(String purity) {
        if (purity == null || purity.isBlank()) {
            throw new IllegalArgumentException("Purity is required (e.g. 22K, 18K, 916, 925).");
        }
        String p = purity.trim().toUpperCase(Locale.ROOT).replace(" ", "");
        if (p.endsWith("KT")) {
            p = p.substring(0, p.length() - 1);
        } else if (p.endsWith("CT") || p.endsWith("KARAT")) {
            p = p.replace("KARAT", "K").replace("CT", "K");
        }
        return p;
    }

    static BigDecimal purityFraction(String metal, String purityLabel) {
        Map<String, BigDecimal> table = ExchangeRequest.METAL_SILVER.equals(metal) ? SILVER_PURITIES : GOLD_PURITIES;
        BigDecimal fraction = table.get(purityLabel);
        if (fraction == null) {
            throw new IllegalArgumentException("Unknown purity '" + purityLabel + "' for " + metal.toLowerCase(Locale.ROOT)
                    + ". Use " + String.join(", ", table.keySet()) + ".");
        }
        return fraction;
    }

    static String normalizePan(String pan) {
        if (pan == null || pan.isBlank()) {
            return null;
        }
        String p = pan.trim().toUpperCase(Locale.ROOT);
        if (!PAN_FORMAT.matcher(p).matches()) {
            throw new IllegalArgumentException("PAN must be 10 characters in the form ABCDE1234F.");
        }
        return p;
    }

    static String maskPan(String pan) {
        if (pan == null || pan.length() != 10) {
            return null;
        }
        return pan.substring(0, 5) + "****" + pan.substring(9);
    }

    static boolean samePhone(String stored, String given) {
        if (stored == null || given == null) {
            return false;
        }
        String a = stored.replaceAll("\\D", "");
        String b = given.replaceAll("\\D", "");
        if (a.length() < 6 || b.length() < 6) {
            return false;
        }
        String tailA = a.length() > 10 ? a.substring(a.length() - 10) : a;
        String tailB = b.length() > 10 ? b.substring(b.length() - 10) : b;
        return tailA.equals(tailB);
    }

    private Optional<String> setting(String key) {
        return globalSettingRepository.findBySettingKey(key)
                .map(s -> s.getSettingValue())
                .filter(v -> v != null && !v.isBlank());
    }

    private static BigDecimal parseDecimal(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return new BigDecimal(String.valueOf(value).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v.trim();
            }
        }
        return null;
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    private static String join(String first, String last) {
        String a = first == null ? "" : first.trim();
        String b = last == null ? "" : last.trim();
        return (a + " " + b).trim();
    }
}
