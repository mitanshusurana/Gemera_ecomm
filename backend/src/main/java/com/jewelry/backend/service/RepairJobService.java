package com.jewelry.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jewelry.backend.dto.CreateRazorpayOrderRequest;
import com.jewelry.backend.dto.RazorpayOrderResponse;
import com.jewelry.backend.dto.RepairJobDTO;
import com.jewelry.backend.dto.RepairJobEventDTO;
import com.jewelry.backend.dto.RepairPaymentOrderDTO;
import com.jewelry.backend.dto.RepairRequests;
import com.jewelry.backend.dto.RepairTrackingDTO;
import com.jewelry.backend.dto.VerifyPaymentRequest;
import com.jewelry.backend.entity.Invoice;
import com.jewelry.backend.entity.RepairJob;
import com.jewelry.backend.entity.RepairJob.Status;
import com.jewelry.backend.entity.RepairJobEvent;
import com.jewelry.backend.entity.RepairSequence;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.RepairJobEventRepository;
import com.jewelry.backend.repository.RepairJobRepository;
import com.jewelry.backend.repository.RepairSequenceRepository;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.util.IndianMoney;
import jakarta.persistence.EntityNotFoundException;
import jakarta.persistence.criteria.Predicate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.Year;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Repair and service jobs: intake (signed-in or guest), public tracking by
 * job number and phone, customer estimate approval, and the admin workflow.
 * The status machine lives in {@link #TRANSITIONS}; every change writes a
 * {@link RepairJobEvent}. E-mails go through RepairNotificationService and
 * can never fail the request.
 *
 * Online payment: once the estimate is approved (and again at READY when a
 * balance is due) the customer can pay the amount due through Razorpay. The
 * gateway order is stored on the job; the checkout handler and the webhook
 * both complete it through {@link #completeOnlinePayment}, idempotently. The
 * service tax invoice is issued by InvoiceService when the job is delivered
 * or fully paid, whichever comes first.
 */
@Service
public class RepairJobService {

    /** Allowed next statuses. Anything not listed is rejected with 400. */
    static final Map<Status, Set<Status>> TRANSITIONS = new EnumMap<>(Status.class);

    static {
        TRANSITIONS.put(Status.REQUESTED, EnumSet.of(Status.RECEIVED, Status.CANCELLED));
        TRANSITIONS.put(Status.RECEIVED, EnumSet.of(Status.ASSESSED, Status.CANCELLED));
        TRANSITIONS.put(Status.ASSESSED, EnumSet.of(Status.APPROVED, Status.CANCELLED));
        TRANSITIONS.put(Status.APPROVED, EnumSet.of(Status.IN_PROGRESS, Status.CANCELLED));
        TRANSITIONS.put(Status.IN_PROGRESS, EnumSet.of(Status.READY));
        TRANSITIONS.put(Status.READY, EnumSet.of(Status.DELIVERED));
        TRANSITIONS.put(Status.DELIVERED, EnumSet.noneOf(Status.class));
        TRANSITIONS.put(Status.CANCELLED, EnumSet.noneOf(Status.class));
    }

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
    };

    /** Statuses in which the customer may pay the amount due online. */
    private static final Set<Status> PAYABLE = EnumSet.of(Status.APPROVED, Status.IN_PROGRESS, Status.READY, Status.DELIVERED);

    @Autowired
    RepairJobRepository repairJobRepository;

    @Autowired
    RepairJobEventRepository eventRepository;

    @Autowired
    RepairSequenceRepository sequenceRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    RepairNotificationService notificationService;

    @Autowired
    PaymentService paymentService;

    @Autowired
    InvoiceService invoiceService;

    @Autowired
    ObjectMapper objectMapper;

    // ------------------------------------------------------------------
    // Customer side
    // ------------------------------------------------------------------

    @Transactional
    public RepairJobDTO create(RepairRequests.Create request, String principalEmail) {
        User user = findUser(principalEmail);

        String name = firstNonBlank(request.customerName(), user == null ? null : join(user.getFirstName(), user.getLastName()));
        String phone = firstNonBlank(request.phone(), user == null ? null : user.getPhone());
        String email = firstNonBlank(request.email(), user == null ? null : user.getEmail());
        if (isBlank(name)) throw new IllegalArgumentException("Please tell us your name");
        if (digits(phone).length() < 10) throw new IllegalArgumentException("Please enter a valid phone number");
        if (isBlank(email) || !email.contains("@")) throw new IllegalArgumentException("Please enter a valid email address");

        RepairJob job = new RepairJob();
        job.setJobNumber(allocateNumber());
        job.setUser(user);
        job.setCustomerName(name.trim());
        job.setPhone(phone.trim());
        job.setEmail(email.trim().toLowerCase(Locale.ROOT));
        job.setItemType(parseEnum(RepairJob.ItemType.class, request.itemType(), "item type"));
        job.setServiceType(parseEnum(RepairJob.ServiceType.class, request.serviceType(), "service type"));
        job.setItemDescription(request.itemDescription().trim());
        job.setProblemDescription(trimToNull(request.problemDescription()));
        job.setDeclaredValue(request.declaredValue());
        job.setPhotoUrls(toJson(request.photoUrls()));
        job.setRingSize(trimToNull(request.ringSize()));
        job.setTargetSize(trimToNull(request.targetSize()));
        job.setStatus(Status.REQUESTED);
        job = repairJobRepository.save(job);

        addEvent(job, Status.REQUESTED, "Request received online. Please bring or send the piece to the store.",
                "Customer", true);
        notificationService.sendReceived(job);
        return toDTO(job, false);
    }

    @Transactional(readOnly = true)
    public List<RepairJobDTO> mine(String principalEmail) {
        User user = findUser(principalEmail);
        if (user == null) return List.of();
        List<RepairJobDTO> out = new ArrayList<>();
        for (RepairJob job : repairJobRepository.findByUserIdOrderByCreatedAtDesc(user.getId())) {
            out.add(toDTO(job, false));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public RepairTrackingDTO track(String jobNumber, String phone, String principalEmail) {
        RepairJob job = findForCustomer(jobNumber, phone, principalEmail);
        return toTracking(job);
    }

    /**
     * Customer approval of the estimate: ASSESSED to APPROVED. Works for the
     * signed-in owner or for anyone who knows the job number and phone.
     */
    @Transactional
    public RepairTrackingDTO approveEstimate(String jobNumber, String phone, String principalEmail) {
        RepairJob job = findForCustomer(jobNumber, phone, principalEmail);
        if (job.getStatus() != Status.ASSESSED) {
            throw new IllegalArgumentException("This job has no estimate awaiting approval");
        }
        if (job.getEstimateAmount() == null) {
            throw new IllegalArgumentException("The estimate has not been prepared yet");
        }
        job.setStatus(Status.APPROVED);
        job.setEstimateApprovedAt(LocalDateTime.now());
        repairJobRepository.save(job);
        addEvent(job, Status.APPROVED, "Estimate of " + IndianMoney.rs(job.getEstimateAmount()) + " approved by the customer.",
                "Customer", true);
        return toTracking(job);
    }

    /** The job as the customer may see it (owner, or job number + phone); 404 otherwise. */
    @Transactional(readOnly = true)
    public RepairJob getForCustomer(String jobNumber, String phone, String principalEmail) {
        return findForCustomer(jobNumber, phone, principalEmail);
    }

    // ------------------------------------------------------------------
    // Online payment
    // ------------------------------------------------------------------

    /** Rupees still owed: bill (final amount, else estimate) less what was paid; null before an estimate exists. */
    static BigDecimal amountDue(RepairJob job) {
        BigDecimal billable = InvoiceService.billableAmount(job);
        if (billable == null) return null;
        BigDecimal paid = job.getPaidAmount() == null ? BigDecimal.ZERO : job.getPaidAmount();
        return billable.subtract(paid).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }

    static boolean canPayOnline(RepairJob job) {
        BigDecimal due = amountDue(job);
        return due != null && due.signum() > 0 && PAYABLE.contains(job.getStatus());
    }

    /**
     * Creates (or returns the still-open) Razorpay order for the amount due.
     * The order id and amount are stored on the job so the webhook can match
     * a payment even if the customer closes the page before verification.
     */
    @Transactional
    public RepairPaymentOrderDTO createPaymentOrder(String jobNumber, String phone, String principalEmail) {
        RepairJob job = findForCustomer(jobNumber, phone, principalEmail);
        if (!canPayOnline(job)) {
            throw new IllegalArgumentException(job.getStatus() == Status.ASSESSED
                    ? "Please approve the estimate before paying"
                    : "There is nothing to pay on this job right now");
        }
        BigDecimal due = amountDue(job);
        if (job.getRazorpayOrderId() == null || job.getPaymentDueAmount() == null
                || job.getPaymentDueAmount().compareTo(due) != 0) {
            CreateRazorpayOrderRequest request = new CreateRazorpayOrderRequest();
            request.setAmount(due.movePointRight(2).intValueExact());
            request.setCurrency("INR");
            RazorpayOrderResponse created = paymentService.createRazorpayOrder(request);
            job.setRazorpayOrderId(created.getId());
            job.setPaymentDueAmount(due);
            repairJobRepository.save(job);
        }
        return new RepairPaymentOrderDTO(job.getJobNumber(), job.getRazorpayOrderId(),
                due.movePointRight(2).intValueExact(), "INR", due,
                job.getCustomerName(), job.getEmail(), job.getPhone());
    }

    /**
     * Checkout handler result: verifies the Razorpay signature exactly as
     * OrderService does (PaymentService.verifyPayment) and records the
     * payment. Idempotent with the webhook: a job whose open order is
     * already settled is returned unchanged.
     */
    @Transactional
    public RepairTrackingDTO verifyPayment(String jobNumber, String phone, String principalEmail,
                                           RepairRequests.VerifyPayment request) {
        RepairJob job = findForCustomer(jobNumber, phone, principalEmail);
        if (job.getRazorpayOrderId() == null || !job.getRazorpayOrderId().equals(request.razorpayOrderId().trim())) {
            throw new IllegalArgumentException("This payment does not belong to the job");
        }
        if (job.getPaymentDueAmount() == null) {
            // The webhook completed it first.
            return toTracking(job);
        }
        VerifyPaymentRequest verify = new VerifyPaymentRequest();
        verify.setOrderId(request.razorpayOrderId().trim());
        verify.setPaymentId(request.razorpayPaymentId().trim());
        verify.setPaymentToken(request.razorpaySignature().trim());
        try {
            paymentService.verifyPayment(verify);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("The payment could not be verified. If the amount was debited, "
                    + "contact the store quoting " + job.getJobNumber() + " and payment " + request.razorpayPaymentId());
        }
        completeOnlinePayment(job, request.razorpayPaymentId().trim(), "Customer");
        return toTracking(job);
    }

    /**
     * Webhook path (PaymentWebhookService.handlePaid): completes the job whose
     * open Razorpay order is {@code razorpayOrderId}. Empty when no job has
     * that order; the job unchanged when it was already settled.
     */
    @Transactional
    public Optional<RepairJob> markPaidByRazorpayOrder(String razorpayOrderId, String razorpayPaymentId) {
        if (isBlank(razorpayOrderId)) return Optional.empty();
        Optional<RepairJob> found = repairJobRepository.findByRazorpayOrderId(razorpayOrderId.trim());
        if (found.isEmpty()) return Optional.empty();
        RepairJob job = found.get();
        if (job.getPaymentDueAmount() != null) {
            completeOnlinePayment(job, razorpayPaymentId, "System");
        }
        return Optional.of(job);
    }

    /**
     * Records the open Razorpay order as paid: adds its amount to paidAmount,
     * fixes the bill at the estimate when staff have not entered a final
     * amount yet, clears the open order and writes a customer-visible event.
     * The service invoice follows once the job is fully paid.
     */
    private void completeOnlinePayment(RepairJob job, String paymentId, String actor) {
        BigDecimal amount = job.getPaymentDueAmount();
        if (amount == null) return;
        if (job.getFinalAmount() == null && job.getEstimateAmount() != null) {
            job.setFinalAmount(job.getEstimateAmount());
        }
        BigDecimal paid = job.getPaidAmount() == null ? BigDecimal.ZERO : job.getPaidAmount();
        job.setPaidAmount(paid.add(amount));
        job.setPaymentMode(RepairJob.PaymentMode.RAZORPAY);
        job.setPaymentReference(trimToNull(paymentId));
        job.setPaymentDueAmount(null);
        repairJobRepository.save(job);
        addEvent(job, job.getStatus(), "Payment received: " + IndianMoney.rs(amount) + " by Razorpay"
                + (isBlank(paymentId) ? "" : " (" + paymentId.trim() + ")"), actor, true);
        if (InvoiceService.isFullyPaid(job)) {
            invoiceService.issueServiceAfterCommit(job);
        }
    }

    // ------------------------------------------------------------------
    // Admin side
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Page<RepairJobDTO> list(String status, String search, Pageable pageable) {
        Status statusFilter = isBlank(status) || "ALL".equalsIgnoreCase(status)
                ? null : parseEnum(Status.class, status, "status");
        String like = isBlank(search) ? null : "%" + search.trim().toLowerCase(Locale.ROOT) + "%";
        Specification<RepairJob> spec = (root, query, cb) -> {
            List<Predicate> where = new ArrayList<>();
            if (statusFilter != null) where.add(cb.equal(root.get("status"), statusFilter));
            if (like != null) {
                where.add(cb.or(
                        cb.like(cb.lower(root.get("jobNumber")), like),
                        cb.like(cb.lower(root.get("phone")), like),
                        cb.like(cb.lower(root.get("customerName")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("email"), "")), like)));
            }
            return cb.and(where.toArray(new Predicate[0]));
        };
        return repairJobRepository.findAll(spec, pageable).map(job -> toDTO(job, true));
    }

    @Transactional(readOnly = true)
    public RepairJobDTO get(UUID id) {
        return toDTO(getEntity(id), true);
    }

    @Transactional(readOnly = true)
    public RepairJob getEntity(UUID id) {
        return repairJobRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Repair job not found"));
    }

    /** Count per status, every status present (zero when none). */
    @Transactional(readOnly = true)
    public Map<String, Long> stats() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (Status s : Status.values()) counts.put(s.name(), 0L);
        for (Object[] row : repairJobRepository.countByStatus()) {
            counts.put(((Status) row[0]).name(), (Long) row[1]);
        }
        return counts;
    }

    @Transactional
    public RepairJobDTO updateStatus(UUID id, RepairRequests.StatusUpdate request, String actor) {
        RepairJob job = getEntity(id);
        Status next = parseEnum(Status.class, request.status(), "status");
        transition(job, next);
        if (request.promisedDate() != null) job.setPromisedDate(request.promisedDate());
        if (next == Status.APPROVED && job.getEstimateApprovedAt() == null) {
            job.setEstimateApprovedAt(LocalDateTime.now());
        }
        repairJobRepository.save(job);

        boolean visible = request.visibleToCustomer() == null || request.visibleToCustomer();
        addEvent(job, next, firstNonBlank(request.note(), defaultNote(next)), actor, visible);

        if (next == Status.ASSESSED && job.getEstimateAmount() != null) notificationService.sendEstimate(job);
        if (next == Status.READY) notificationService.sendReady(job);
        if (next == Status.DELIVERED) notificationService.sendDelivered(job);
        // The service tax invoice is due at delivery at the latest.
        if (next == Status.DELIVERED) invoiceService.issueServiceAfterCommit(job);
        return toDTO(job, true);
    }

    /**
     * Records the estimate. A RECEIVED job moves to ASSESSED at the same time;
     * an ASSESSED job is re-quoted. In both cases the customer is e-mailed and
     * asked to approve. Later statuses accept a correction silently.
     */
    @Transactional
    public RepairJobDTO setEstimate(UUID id, RepairRequests.Estimate request, String actor) {
        RepairJob job = getEntity(id);
        if (job.getStatus() == Status.DELIVERED || job.getStatus() == Status.CANCELLED) {
            throw new IllegalArgumentException("A " + job.getStatus().name().toLowerCase(Locale.ROOT) + " job cannot be re-estimated");
        }
        job.setEstimateAmount(request.estimateAmount());
        job.setEstimateNote(trimToNull(request.estimateNote()));
        if (request.promisedDate() != null) job.setPromisedDate(request.promisedDate());

        boolean notify = false;
        if (job.getStatus() == Status.RECEIVED) {
            transition(job, Status.ASSESSED);
            notify = true;
        } else if (job.getStatus() == Status.ASSESSED) {
            job.setEstimateApprovedAt(null);
            notify = true;
        } else if (job.getStatus() == Status.REQUESTED) {
            throw new IllegalArgumentException("Mark the piece as received before estimating it");
        }
        repairJobRepository.save(job);

        String note = "Estimate " + IndianMoney.rs(job.getEstimateAmount())
                + (job.getEstimateNote() == null ? "" : ": " + job.getEstimateNote())
                + (job.getPromisedDate() == null ? "" : ". Promised by " + job.getPromisedDate());
        addEvent(job, job.getStatus(), note, actor, true);
        if (notify) notificationService.sendEstimate(job);
        return toDTO(job, true);
    }

    @Transactional
    public RepairJobDTO assign(UUID id, RepairRequests.Assign request, String actor) {
        RepairJob job = getEntity(id);
        String to = trimToNull(request.assignedTo());
        job.setAssignedTo(to);
        repairJobRepository.save(job);
        addEvent(job, job.getStatus(), to == null ? "Assignment cleared" : "Assigned to " + to, actor, false);
        return toDTO(job, true);
    }

    @Transactional
    public RepairJobDTO recordPayment(UUID id, RepairRequests.Payment request, String actor) {
        RepairJob job = getEntity(id);
        if (request.finalAmount() != null) job.setFinalAmount(request.finalAmount());
        if (request.paidAmount() != null) job.setPaidAmount(request.paidAmount());
        job.setPaymentMode(isBlank(request.paymentMode()) ? null
                : parseEnum(RepairJob.PaymentMode.class, request.paymentMode(), "payment mode"));
        job.setPaymentReference(trimToNull(request.paymentReference()));
        repairJobRepository.save(job);

        StringBuilder note = new StringBuilder("Payment recorded");
        if (job.getFinalAmount() != null) note.append(": bill ").append(IndianMoney.rs(job.getFinalAmount()));
        if (job.getPaidAmount() != null) note.append(", paid ").append(IndianMoney.rs(job.getPaidAmount()));
        if (job.getPaymentMode() != null) note.append(" by ").append(job.getPaymentMode().name());
        if (job.getPaymentReference() != null) note.append(" (").append(job.getPaymentReference()).append(')');
        addEvent(job, job.getStatus(), note.toString(), actor, false);
        if (InvoiceService.isFullyPaid(job)) invoiceService.issueServiceAfterCommit(job);
        return toDTO(job, true);
    }

    @Transactional
    public RepairJobDTO updateNotes(UUID id, RepairRequests.Notes request, String actor) {
        RepairJob job = getEntity(id);
        job.setInternalNotes(trimToNull(request.internalNotes()));
        repairJobRepository.save(job);
        return toDTO(job, true);
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private void transition(RepairJob job, Status next) {
        Status current = job.getStatus();
        if (!TRANSITIONS.getOrDefault(current, Set.of()).contains(next)) {
            throw new IllegalArgumentException("Cannot move a " + current + " job to " + next);
        }
        job.setStatus(next);
        LocalDateTime now = LocalDateTime.now();
        switch (next) {
            case RECEIVED -> job.setReceivedAt(now);
            case READY -> job.setReadyAt(now);
            case DELIVERED -> job.setDeliveredAt(now);
            default -> { }
        }
    }

    private static String defaultNote(Status status) {
        return switch (status) {
            case REQUESTED -> "Request received";
            case RECEIVED -> "Piece received at the store";
            case ASSESSED -> "Assessment complete; estimate prepared";
            case APPROVED -> "Estimate approved";
            case IN_PROGRESS -> "Work in progress";
            case READY -> "Ready for collection";
            case DELIVERED -> "Delivered to the customer";
            case CANCELLED -> "Job cancelled";
        };
    }

    private RepairJobEvent addEvent(RepairJob job, Status status, String note, String actor, boolean visible) {
        RepairJobEvent event = new RepairJobEvent();
        event.setJob(job);
        event.setStatus(status);
        event.setNote(note);
        event.setActor(actor);
        event.setVisibleToCustomer(visible);
        return eventRepository.save(event);
    }

    private String allocateNumber() {
        String year = String.valueOf(Year.now().getValue());
        sequenceRepository.ensureRow(year);
        RepairSequence sequence = sequenceRepository.lockByYear(year)
                .orElseThrow(() -> new IllegalStateException("Repair sequence row missing for " + year));
        long next = sequence.getLastNumber() + 1;
        sequence.setLastNumber(next);
        sequenceRepository.save(sequence);
        return String.format("RJ-%s-%05d", year, next);
    }

    /**
     * Resolves a job for a customer: the signed-in owner needs no phone; anyone
     * else must supply the phone given at intake. A mismatch is reported as
     * "not found" so job numbers cannot be probed.
     */
    private RepairJob findForCustomer(String jobNumber, String phone, String principalEmail) {
        Optional<RepairJob> found = isBlank(jobNumber) ? Optional.empty()
                : repairJobRepository.findByJobNumber(jobNumber.trim().toUpperCase(Locale.ROOT));
        RepairJob job = found.orElseThrow(() -> new EntityNotFoundException("Repair job not found"));
        User user = findUser(principalEmail);
        boolean owner = user != null && job.getUser() != null && user.getId().equals(job.getUser().getId());
        if (!owner && !phoneMatches(job.getPhone(), phone)) {
            throw new EntityNotFoundException("Repair job not found");
        }
        return job;
    }

    /** Compares the last ten digits so "+91 98765 43210" matches "9876543210". */
    static boolean phoneMatches(String stored, String given) {
        String a = digits(stored);
        String b = digits(given);
        if (a.length() < 10 || b.length() < 10) return false;
        return a.substring(a.length() - 10).equals(b.substring(b.length() - 10));
    }

    private User findUser(String email) {
        if (isBlank(email)) return null;
        return userRepository.findByEmail(email).orElse(null);
    }

    RepairJobDTO toDTO(RepairJob job, boolean adminView) {
        List<RepairJobEvent> events = adminView
                ? eventRepository.findByJobIdOrderByCreatedAtAsc(job.getId())
                : eventRepository.findByJobIdAndVisibleToCustomerTrueOrderByCreatedAtAsc(job.getId());
        List<String> transitions = TRANSITIONS.getOrDefault(job.getStatus(), Set.of()).stream()
                .map(Enum::name).sorted().toList();
        Invoice invoice = invoiceService.findForRepairJob(job.getId()).orElse(null);
        return new RepairJobDTO(
                job.getId().toString(),
                job.getJobNumber(),
                job.getCustomerName(),
                job.getPhone(),
                job.getEmail(),
                job.getItemType().name(),
                job.getItemDescription(),
                job.getServiceType().name(),
                job.getProblemDescription(),
                job.getDeclaredValue(),
                fromJson(job.getPhotoUrls()),
                job.getRingSize(),
                job.getTargetSize(),
                job.getStatus().name(),
                job.getEstimateAmount(),
                job.getEstimateNote(),
                job.getEstimateApprovedAt(),
                job.getPromisedDate(),
                job.getFinalAmount(),
                job.getPaidAmount(),
                job.getPaymentMode() == null ? null : job.getPaymentMode().name(),
                adminView ? job.getPaymentReference() : null,
                adminView ? job.getRazorpayOrderId() : null,
                adminView ? job.getPaymentDueAmount() : null,
                amountDue(job),
                invoice == null ? null : invoice.getInvoiceNumber(),
                invoice == null ? null : invoice.getInvoiceDate(),
                adminView ? job.getAssignedTo() : null,
                adminView ? job.getInternalNotes() : null,
                job.getReceivedAt(),
                job.getReadyAt(),
                job.getDeliveredAt(),
                job.getCreatedAt(),
                job.getUpdatedAt(),
                transitions,
                events.stream().map(RepairJobService::toEventDTO).toList());
    }

    private RepairTrackingDTO toTracking(RepairJob job) {
        List<RepairJobEvent> events = eventRepository.findByJobIdAndVisibleToCustomerTrueOrderByCreatedAtAsc(job.getId());
        String firstName = job.getCustomerName() == null ? "" : job.getCustomerName().trim().split("\\s+")[0];
        Invoice invoice = invoiceService.findForRepairJob(job.getId()).orElse(null);
        return new RepairTrackingDTO(
                job.getJobNumber(),
                firstName,
                job.getItemType().name(),
                job.getItemDescription(),
                job.getServiceType().name(),
                job.getStatus().name(),
                job.getEstimateAmount(),
                job.getEstimateNote(),
                job.getEstimateApprovedAt(),
                job.getStatus() == Status.ASSESSED && job.getEstimateAmount() != null,
                job.getPromisedDate(),
                job.getFinalAmount(),
                job.getPaidAmount(),
                amountDue(job),
                canPayOnline(job),
                invoice == null ? null : invoice.getInvoiceNumber(),
                job.getCreatedAt(),
                events.stream().map(RepairJobService::toEventDTO).toList());
    }

    private static RepairJobEventDTO toEventDTO(RepairJobEvent e) {
        return new RepairJobEventDTO(e.getId().toString(), e.getStatus().name(), e.getNote(), e.getActor(),
                e.isVisibleToCustomer(), e.getCreatedAt());
    }

    private String toJson(List<String> urls) {
        if (urls == null || urls.isEmpty()) return null;
        List<String> clean = urls.stream().filter(u -> u != null && !u.isBlank()).map(String::trim).toList();
        if (clean.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(clean);
        } catch (Exception e) {
            throw new IllegalArgumentException("Photo URLs could not be stored");
        }
    }

    private List<String> fromJson(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, STRING_LIST);
        } catch (Exception e) {
            return List.of();
        }
    }

    private static <E extends Enum<E>> E parseEnum(Class<E> type, String value, String label) {
        if (isBlank(value)) throw new IllegalArgumentException("Missing " + label);
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_'));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown " + label + ": " + value);
        }
    }

    static String digits(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (char c : s.toCharArray()) if (Character.isDigit(c)) sb.append(c);
        return sb.toString();
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String trimToNull(String s) {
        return isBlank(s) ? null : s.trim();
    }

    private static String firstNonBlank(String a, String b) {
        return !isBlank(a) ? a : (!isBlank(b) ? b : null);
    }

    private static String join(String a, String b) {
        String s = ((a == null ? "" : a.trim()) + " " + (b == null ? "" : b.trim())).trim();
        return s.isEmpty() ? null : s;
    }

    /** Amount still owed after the recorded payment; null until a bill exists. */
    static BigDecimal balanceDue(RepairJob job) {
        if (job.getFinalAmount() == null) return null;
        BigDecimal paid = job.getPaidAmount() == null ? BigDecimal.ZERO : job.getPaidAmount();
        return job.getFinalAmount().subtract(paid).max(BigDecimal.ZERO);
    }
}
