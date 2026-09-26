package com.jewelry.backend.service;

import com.jewelry.backend.dto.AppointmentDtos.AppointmentDTO;
import com.jewelry.backend.dto.AppointmentDtos.AppointmentRequest;
import com.jewelry.backend.dto.AppointmentDtos.SlotDTO;
import com.jewelry.backend.entity.Appointment;
import com.jewelry.backend.entity.Store;
import com.jewelry.backend.repository.AppointmentRepository;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.StoreRepository;
import com.jewelry.backend.service.notification.NotificationEvent;
import com.jewelry.backend.service.notification.NotificationService;
import com.jewelry.backend.service.notification.Recipient;
import com.jewelry.backend.util.EmailText;
import com.jewelry.backend.util.PhoneNumbers;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Consultation bookings with slots per store.
 *
 * Slot rules come from {@code global_settings}: appointmentSlotMinutes (60),
 * appointmentOpenHour (11), appointmentCloseHour (19), appointmentMaxPerSlot
 * (2) and appointmentLeadHours (4). Capacity is counted per (store, slot)
 * for store visits and per slot with no store for try-at-home and video
 * calls; PENDING and CONFIRMED bookings occupy a slot.
 *
 * Life cycle: PENDING (booked, APPOINTMENT_RECEIVED sent) -> CONFIRMED by
 * staff (APPOINTMENT_CONFIRMED) -> COMPLETED or NO_SHOW; PENDING or
 * CONFIRMED -> CANCELLED (APPOINTMENT_CANCELLED) by either side.
 */
@Service
public class AppointmentService {

    private static final Logger LOGGER = Logger.getLogger(AppointmentService.class.getName());
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("EEEE d MMMM yyyy 'at' HH:mm", Locale.ENGLISH);

    /** Statuses that occupy a slot. */
    static final Set<String> OCCUPYING = Set.of(Appointment.STATUS_PENDING, Appointment.STATUS_CONFIRMED);
    static final Set<String> TERMINAL = Set.of(Appointment.STATUS_CANCELLED, Appointment.STATUS_COMPLETED, Appointment.STATUS_NO_SHOW);

    public static final Map<String, Set<String>> ALLOWED_TRANSITIONS = Map.of(
            Appointment.STATUS_PENDING, Set.of(Appointment.STATUS_CONFIRMED, Appointment.STATUS_CANCELLED),
            Appointment.STATUS_CONFIRMED, Set.of(Appointment.STATUS_COMPLETED, Appointment.STATUS_NO_SHOW, Appointment.STATUS_CANCELLED),
            Appointment.STATUS_COMPLETED, Set.of(),
            Appointment.STATUS_NO_SHOW, Set.of(),
            Appointment.STATUS_CANCELLED, Set.of());

    /** Slot rules as read from settings (with defaults). */
    public record SlotRules(int minutes, int openHour, int closeHour, int maxPerSlot, int leadHours) {
    }

    @Autowired
    AppointmentRepository appointmentRepository;

    @Autowired
    StoreRepository storeRepository;

    @Autowired
    GlobalSettingRepository globalSettingRepository;

    @Autowired
    NotificationService notificationService;

    @Value("${app.frontend-url:http://localhost:4200}")
    private String frontendUrl;

    // ------------------------------------------------------------------
    // Slots
    // ------------------------------------------------------------------

    public SlotRules rules() {
        int minutes = intSetting("appointmentSlotMinutes", 60);
        int open = intSetting("appointmentOpenHour", 11);
        int close = intSetting("appointmentCloseHour", 19);
        int max = intSetting("appointmentMaxPerSlot", 2);
        int lead = intSetting("appointmentLeadHours", 4);
        if (minutes < 5 || minutes > 24 * 60) minutes = 60;
        if (open < 0 || open > 23) open = 11;
        if (close <= open || close > 24) close = Math.min(open + 8, 24);
        if (max < 1) max = 1;
        if (lead < 0) lead = 0;
        return new SlotRules(minutes, open, close, max, lead);
    }

    /** Store visits are counted per store; at-home and video bookings share one "no store" calendar. */
    static boolean needsStore(String type) {
        return Appointment.TYPE_STORE_VISIT.equals(normalizeType(type));
    }

    /** The day's slots with their remaining capacity, lead time applied. */
    @Transactional(readOnly = true)
    public List<SlotDTO> slots(LocalDate date, UUID storeId, String type) {
        if (date == null) {
            throw new IllegalArgumentException("A date is required.");
        }
        SlotRules rules = rules();
        UUID calendar = needsStore(type) ? storeId : null;
        Map<LocalDateTime, Integer> booked = occupancy(calendar, date);
        LocalDateTime earliest = LocalDateTime.now().plusHours(rules.leadHours());
        List<SlotDTO> out = new ArrayList<>();
        for (LocalDateTime start : slotStarts(date, rules)) {
            SlotDTO slot = new SlotDTO();
            slot.setStart(start);
            slot.setEnd(start.plusMinutes(rules.minutes()));
            slot.setCapacity(rules.maxPerSlot());
            int taken = booked.getOrDefault(start, 0);
            slot.setBooked(taken);
            slot.setRemaining(Math.max(rules.maxPerSlot() - taken, 0));
            boolean tooSoon = start.isBefore(earliest);
            boolean full = taken >= rules.maxPerSlot();
            slot.setAvailable(!tooSoon && !full);
            slot.setReason(tooSoon ? "TOO_SOON" : full ? "FULL" : null);
            out.add(slot);
        }
        return out;
    }

    /** Every slot start of the day under {@code rules}, in order. */
    static List<LocalDateTime> slotStarts(LocalDate date, SlotRules rules) {
        List<LocalDateTime> starts = new ArrayList<>();
        LocalDateTime open = date.atTime(rules.openHour(), 0);
        LocalDateTime close = rules.closeHour() >= 24 ? date.plusDays(1).atStartOfDay() : date.atTime(rules.closeHour(), 0);
        for (LocalDateTime t = open; !t.plusMinutes(rules.minutes()).isAfter(close); t = t.plusMinutes(rules.minutes())) {
            starts.add(t);
        }
        return starts;
    }

    private Map<LocalDateTime, Integer> occupancy(UUID storeId, LocalDate date) {
        Map<LocalDateTime, Integer> counts = new HashMap<>();
        for (Appointment a : appointmentRepository.findOccupying(storeId, date.atStartOfDay(), date.plusDays(1).atStartOfDay(), OCCUPYING)) {
            if (a.getSlotStart() != null) {
                counts.merge(a.getSlotStart(), 1, Integer::sum);
            }
        }
        return counts;
    }

    /**
     * Rejects a slot that is malformed, in the past, inside the lead time,
     * outside opening hours or full. {@code ignoreId} is the appointment
     * being rescheduled, so its own booking does not count against it.
     */
    void validateSlot(LocalDateTime slotStart, UUID storeId, String type, UUID ignoreId) {
        if (slotStart == null) {
            throw new IllegalArgumentException("Please choose a time slot.");
        }
        SlotRules rules = rules();
        LocalDateTime now = LocalDateTime.now();
        if (slotStart.isBefore(now)) {
            throw new IllegalArgumentException("That slot is in the past. Please choose another time.");
        }
        if (slotStart.isBefore(now.plusHours(rules.leadHours()))) {
            throw new IllegalArgumentException("Appointments need at least " + rules.leadHours()
                    + " hours' notice. Please choose a later slot.");
        }
        LocalDate day = slotStart.toLocalDate();
        if (!slotStarts(day, rules).contains(slotStart)) {
            throw new IllegalArgumentException(String.format(Locale.ENGLISH,
                    "Slots run every %d minutes between %02d:00 and %02d:00.", rules.minutes(), rules.openHour(), rules.closeHour()));
        }
        UUID calendar = needsStore(type) ? storeId : null;
        int taken = 0;
        for (Appointment a : appointmentRepository.findOccupying(calendar, slotStart, slotStart.plusMinutes(1), OCCUPYING)) {
            if (slotStart.equals(a.getSlotStart()) && (ignoreId == null || !ignoreId.equals(a.getId()))) {
                taken++;
            }
        }
        if (taken >= rules.maxPerSlot()) {
            throw new IllegalArgumentException("That slot is fully booked. Please choose another time.");
        }
    }

    // ------------------------------------------------------------------
    // Booking
    // ------------------------------------------------------------------

    /**
     * Saves the booking and sends APPOINTMENT_RECEIVED (e-mail, WhatsApp,
     * SMS); a messaging failure never fails the booking. A request without a
     * slot (legacy callers) is stored with its requestedDate only.
     */
    @Transactional(rollbackFor = Exception.class)
    public Appointment createAppointment(AppointmentRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("A booking body is required.");
        }
        String type = normalizeType(request.getAppointmentType() != null ? request.getAppointmentType() : request.getType());
        Appointment a = new Appointment();
        a.setName(requireText(request.getName(), "Your name"));
        a.setEmail(cleanEmail(request.getEmail()));
        a.setPhone(cleanPhone(request.getPhone()));
        if (a.getEmail() == null && a.getPhone() == null) {
            throw new IllegalArgumentException("An e-mail address or phone number is required so we can confirm the booking.");
        }
        a.setAppointmentType(type);
        a.setProductId(blankToNull(request.getProductId()));
        a.setNotes(blankToNull(request.getNotes()));
        a.setStatus(Appointment.STATUS_PENDING);

        if (request.getSlotStart() != null) {
            Store store = resolveStore(type, request.getStoreId());
            validateSlot(request.getSlotStart(), store == null ? null : store.getId(), type, null);
            applySlot(a, request.getSlotStart(), store);
        } else {
            // Backwards compatibility: no slot grid, just the wished date.
            a.setRequestedDate(request.getRequestedDate() == null ? LocalDateTime.now() : request.getRequestedDate());
            if (request.getStoreId() != null) {
                a.setStore(storeRepository.findById(request.getStoreId()).orElse(null));
            }
        }
        Appointment saved = appointmentRepository.save(a);
        send(NotificationEvent.APPOINTMENT_RECEIVED, saved, Map.of());
        return saved;
    }

    /** Legacy entry point (entity body); kept for callers that build the entity themselves. */
    public Appointment createAppointment(Appointment appointment) {
        AppointmentRequest request = new AppointmentRequest();
        request.setName(appointment.getName());
        request.setEmail(appointment.getEmail());
        request.setPhone(appointment.getPhone());
        request.setAppointmentType(appointment.getAppointmentType());
        request.setRequestedDate(appointment.getRequestedDate());
        request.setSlotStart(appointment.getSlotStart());
        request.setStoreId(appointment.getStore() == null ? null : appointment.getStore().getId());
        request.setProductId(appointment.getProductId());
        request.setNotes(appointment.getNotes());
        return createAppointment(request);
    }

    private Store resolveStore(String type, UUID storeId) {
        if (!needsStore(type)) {
            return null;
        }
        if (storeId == null) {
            throw new IllegalArgumentException("Please choose the store you would like to visit.");
        }
        return storeRepository.findById(storeId)
                .orElseThrow(() -> new IllegalArgumentException("That store no longer exists. Please choose another."));
    }

    private void applySlot(Appointment a, LocalDateTime slotStart, Store store) {
        a.setSlotStart(slotStart);
        a.setSlotEnd(slotStart.plusMinutes(rules().minutes()));
        a.setRequestedDate(slotStart);
        a.setStore(store);
    }

    // ------------------------------------------------------------------
    // Customer actions
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<Appointment> mine(String email) {
        if (email == null || email.isBlank()) {
            return List.of();
        }
        return appointmentRepository.findByEmailIgnoreCaseOrderByCreatedAtDesc(email.trim());
    }

    /** The appointment when it belongs to the caller (e-mail of the principal, or the phone a guest typed). */
    @Transactional(readOnly = true)
    public Appointment requireOwned(UUID id, String principalEmail, String phone) {
        Appointment a = appointmentRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Appointment not found"));
        if (principalEmail != null && a.getEmail() != null && principalEmail.trim().equalsIgnoreCase(a.getEmail().trim())) {
            return a;
        }
        String typed = PhoneNumbers.toE164(phone);
        String stored = PhoneNumbers.toE164(a.getPhone());
        if (typed != null && stored != null && typed.equals(stored)) {
            return a;
        }
        throw new EntityNotFoundException("Appointment not found");
    }

    @Transactional(rollbackFor = Exception.class)
    public Appointment cancelByCustomer(UUID id, String principalEmail, String phone, String reason) {
        Appointment a = requireOwned(id, principalEmail, phone);
        return cancel(a, reason == null || reason.isBlank() ? "Cancelled by the customer." : reason.trim());
    }

    @Transactional(rollbackFor = Exception.class)
    public Appointment rescheduleByCustomer(UUID id, String principalEmail, String phone, LocalDateTime slotStart, UUID storeId) {
        Appointment a = requireOwned(id, principalEmail, phone);
        move(a, slotStart, storeId);
        // A moved booking needs staff to confirm the new slot.
        boolean wasConfirmed = Appointment.STATUS_CONFIRMED.equals(a.getStatus());
        a.setStatus(Appointment.STATUS_PENDING);
        Appointment saved = appointmentRepository.save(a);
        send(NotificationEvent.APPOINTMENT_RECEIVED, saved, Map.of());
        if (wasConfirmed) {
            LOGGER.info("Appointment " + saved.getId() + " rescheduled by the customer; back to PENDING");
        }
        return saved;
    }

    // ------------------------------------------------------------------
    // Admin actions
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<Appointment> list(LocalDate date, LocalDateTime from, LocalDateTime to, UUID storeId, String status) {
        LocalDateTime f = from;
        LocalDateTime t = to;
        if (date != null) {
            f = date.atStartOfDay();
            t = date.plusDays(1).atStartOfDay();
        }
        String s = status == null || status.isBlank() || "ALL".equalsIgnoreCase(status) ? null : status.trim().toUpperCase(Locale.ROOT);
        return appointmentRepository.search(f, t, storeId, s);
    }

    /** Legacy admin list: everything, newest first. */
    public List<Appointment> getAllAppointments() {
        return list(null, null, null, null, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public Appointment updateStatus(UUID id, String status) {
        return updateStatus(id, status, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public Appointment updateStatus(UUID id, String status, String reason) {
        Appointment a = get(id);
        if (status == null || status.isBlank()) {
            throw new IllegalArgumentException("A status is required.");
        }
        String next = status.trim().toUpperCase(Locale.ROOT);
        String current = a.getStatus() == null ? Appointment.STATUS_PENDING : a.getStatus().trim().toUpperCase(Locale.ROOT);
        if (next.equals(current)) {
            return a;
        }
        if (!ALLOWED_TRANSITIONS.containsKey(next)) {
            throw new IllegalArgumentException("Unknown appointment status: " + next);
        }
        if (!ALLOWED_TRANSITIONS.getOrDefault(current, Set.of()).contains(next)) {
            throw new IllegalArgumentException("An appointment cannot move from " + current + " to " + next + ".");
        }
        if (Appointment.STATUS_CANCELLED.equals(next)) {
            return cancel(a, reason == null || reason.isBlank() ? "Cancelled by the store." : reason.trim());
        }
        a.setStatus(next);
        Appointment saved = appointmentRepository.save(a);
        if (Appointment.STATUS_CONFIRMED.equals(next)) {
            send(NotificationEvent.APPOINTMENT_CONFIRMED, saved, Map.of());
        }
        return saved;
    }

    @Transactional(rollbackFor = Exception.class)
    public Appointment assign(UUID id, String consultant) {
        Appointment a = get(id);
        a.setConsultant(blankToNull(consultant));
        return appointmentRepository.save(a);
    }

    @Transactional(rollbackFor = Exception.class)
    public Appointment rescheduleByAdmin(UUID id, LocalDateTime slotStart, UUID storeId) {
        Appointment a = get(id);
        move(a, slotStart, storeId);
        Appointment saved = appointmentRepository.save(a);
        if (Appointment.STATUS_CONFIRMED.equals(saved.getStatus())) {
            send(NotificationEvent.APPOINTMENT_CONFIRMED, saved, Map.of());
        }
        return saved;
    }

    public Appointment get(UUID id) {
        return appointmentRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Appointment not found"));
    }

    private void move(Appointment a, LocalDateTime slotStart, UUID storeId) {
        if (TERMINAL.contains(a.getStatus() == null ? "" : a.getStatus())) {
            throw new IllegalArgumentException("A " + a.getStatus().toLowerCase(Locale.ROOT).replace('_', ' ')
                    + " appointment cannot be rescheduled. Please book a new one.");
        }
        String type = normalizeType(a.getAppointmentType());
        Store store;
        if (needsStore(type)) {
            UUID target = storeId != null ? storeId : (a.getStore() == null ? null : a.getStore().getId());
            store = resolveStore(type, target);
        } else {
            store = null;
        }
        validateSlot(slotStart, store == null ? null : store.getId(), type, a.getId());
        applySlot(a, slotStart, store);
    }

    private Appointment cancel(Appointment a, String reason) {
        if (TERMINAL.contains(a.getStatus() == null ? "" : a.getStatus())) {
            throw new IllegalArgumentException("This appointment is already " + a.getStatus().toLowerCase(Locale.ROOT).replace('_', ' ') + ".");
        }
        a.setStatus(Appointment.STATUS_CANCELLED);
        a.setCancellationReason(reason);
        Appointment saved = appointmentRepository.save(a);
        send(NotificationEvent.APPOINTMENT_CANCELLED, saved, Map.of("reason", EmailText.escape(reason)));
        return saved;
    }

    // ------------------------------------------------------------------
    // Notifications
    // ------------------------------------------------------------------

    private void send(NotificationEvent event, Appointment a, Map<String, String> extra) {
        try {
            Map<String, String> data = params(a);
            data.putAll(extra);
            notificationService.notify(event,
                    Recipient.guest(a.getName(), a.getEmail(), a.getPhone(), "APPT-" + a.getId()),
                    data);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Appointment " + a.getId() + ": " + event + " could not be sent", e);
        }
    }

    /** Placeholders shared by the appointment templates (received, confirmed, reminder, cancelled). */
    public Map<String, String> params(Appointment a) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("customerName", EmailText.escape(a.getName() == null || a.getName().isBlank() ? "Customer" : a.getName().trim()));
        data.put("appointmentType", EmailText.escape(typeLabel(a.getAppointmentType())));
        LocalDateTime when = a.getSlotStart() != null ? a.getSlotStart() : a.getRequestedDate();
        data.put("requestedDate", when == null ? "To be confirmed" : when.format(WHEN));
        data.put("storeName", EmailText.escape(placeLabel(a)));
        data.put("consultantLine", a.getConsultant() == null || a.getConsultant().isBlank() ? "" : " with " + EmailText.escape(a.getConsultant().trim()));
        data.put("notes", EmailText.escape(a.getNotes() == null || a.getNotes().isBlank() ? "No notes." : a.getNotes().trim()));
        data.put("reason", EmailText.escape(a.getCancellationReason() == null ? "" : a.getCancellationReason()));
        data.put("storefrontUrl", EmailText.trimSlash(frontendUrl));
        return data;
    }

    /** Where the appointment happens, for messages: the store, "at your address" or "video call". */
    public static String placeLabel(Appointment a) {
        String type = normalizeType(a.getAppointmentType());
        if (Appointment.TYPE_VIDEO_CONSULT.equals(type)) {
            return "video call";
        }
        if (Appointment.TYPE_TRY_AT_HOME.equals(type)) {
            return "at your address";
        }
        return a.getStore() == null || a.getStore().getName() == null ? "our store" : a.getStore().getName();
    }

    /** "STORE_VISIT" to "Store visit". */
    public static String typeLabel(String type) {
        if (type == null || type.isBlank()) {
            return "Store visit";
        }
        String t = type.trim().replace('_', ' ').replace('-', ' ').toLowerCase(Locale.ROOT);
        return Character.toUpperCase(t.charAt(0)) + t.substring(1);
    }

    /** Known types pass through upper-cased; anything else is a store visit. */
    public static String normalizeType(String type) {
        if (type == null || type.isBlank()) {
            return Appointment.TYPE_STORE_VISIT;
        }
        String t = type.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (t) {
            case Appointment.TYPE_TRY_AT_HOME, Appointment.TYPE_VIDEO_CONSULT, Appointment.TYPE_STORE_VISIT -> t;
            default -> Appointment.TYPE_STORE_VISIT;
        };
    }

    // ------------------------------------------------------------------
    // Mapping and helpers
    // ------------------------------------------------------------------

    public AppointmentDTO toDTO(Appointment a) {
        if (a == null) {
            return null;
        }
        AppointmentDTO dto = new AppointmentDTO();
        dto.setId(a.getId());
        dto.setName(a.getName());
        dto.setEmail(a.getEmail());
        dto.setPhone(a.getPhone());
        dto.setAppointmentType(a.getAppointmentType());
        dto.setStatus(a.getStatus());
        dto.setRequestedDate(a.getRequestedDate());
        dto.setSlotStart(a.getSlotStart());
        dto.setSlotEnd(a.getSlotEnd());
        if (a.getStore() != null) {
            dto.setStoreId(a.getStore().getId());
            dto.setStoreName(a.getStore().getName());
            dto.setStoreAddress(a.getStore().getAddress());
        }
        dto.setConsultant(a.getConsultant());
        dto.setCancellationReason(a.getCancellationReason());
        dto.setProductId(a.getProductId());
        dto.setNotes(a.getNotes());
        dto.setCreatedAt(a.getCreatedAt());
        dto.setUpdatedAt(a.getUpdatedAt());
        return dto;
    }

    private int intSetting(String key, int fallback) {
        try {
            return globalSettingRepository.findBySettingKey(key)
                    .map(s -> s.getSettingValue())
                    .filter(v -> v != null && !v.isBlank())
                    .map(v -> Integer.parseInt(v.trim()))
                    .orElse(fallback);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + " is required.");
        }
        String v = value.trim();
        return v.length() > 120 ? v.substring(0, 120) : v;
    }

    private static String cleanEmail(String email) {
        String e = blankToNull(email);
        if (e == null) {
            return null;
        }
        if (!e.contains("@")) {
            throw new IllegalArgumentException("Please enter a valid e-mail address.");
        }
        return e.toLowerCase(Locale.ROOT);
    }

    private static String cleanPhone(String phone) {
        String raw = blankToNull(phone);
        if (raw == null) {
            return null;
        }
        String e164 = PhoneNumbers.toE164(raw);
        return e164 != null ? e164 : raw;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
