package com.jewelry.backend.service;

import com.jewelry.backend.entity.Appointment;
import com.jewelry.backend.entity.GlobalSetting;
import com.jewelry.backend.entity.Store;
import com.jewelry.backend.repository.AppointmentRepository;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.StoreRepository;
import com.jewelry.backend.service.notification.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Slot grid, capacity and the status machine of {@link AppointmentService}; repositories mocked. */
class AppointmentServiceTest {

    private AppointmentService service;
    private AppointmentRepository appointments;
    private GlobalSettingRepository settings;

    @BeforeEach
    void setUp() {
        appointments = mock(AppointmentRepository.class);
        settings = mock(GlobalSettingRepository.class);
        when(settings.findBySettingKey(anyString())).thenReturn(Optional.empty());
        when(appointments.findOccupying(any(), any(), any(), any())).thenReturn(List.of());
        when(appointments.save(any(Appointment.class))).thenAnswer(inv -> {
            Appointment a = inv.getArgument(0);
            if (a.getId() == null) a.setId(UUID.randomUUID());
            return a;
        });
        service = new AppointmentService();
        service.appointmentRepository = appointments;
        service.globalSettingRepository = settings;
        service.storeRepository = mock(StoreRepository.class);
        service.notificationService = mock(NotificationService.class);
    }

    private void setting(String key, String value) {
        GlobalSetting s = new GlobalSetting();
        s.setSettingKey(key);
        s.setSettingValue(value);
        when(settings.findBySettingKey(key)).thenReturn(Optional.of(s));
    }

    @Test
    void defaultRulesGiveEightHourlySlotsFromElevenToSeven() {
        AppointmentService.SlotRules rules = service.rules();
        assertThat(rules).isEqualTo(new AppointmentService.SlotRules(60, 11, 19, 2, 4));
        List<LocalDateTime> starts = AppointmentService.slotStarts(LocalDate.of(2026, 10, 1), rules);
        assertThat(starts).hasSize(8);
        assertThat(starts.get(0)).isEqualTo(LocalDateTime.of(2026, 10, 1, 11, 0));
        assertThat(starts.get(7)).isEqualTo(LocalDateTime.of(2026, 10, 1, 18, 0));
    }

    @Test
    void settingsChangeTheGridAndBadValuesFallBack() {
        setting("appointmentSlotMinutes", "30");
        setting("appointmentOpenHour", "10");
        setting("appointmentCloseHour", "12");
        setting("appointmentMaxPerSlot", "abc");
        AppointmentService.SlotRules rules = service.rules();
        assertThat(rules.minutes()).isEqualTo(30);
        assertThat(rules.maxPerSlot()).isEqualTo(2);
        assertThat(AppointmentService.slotStarts(LocalDate.of(2026, 10, 1), rules)).hasSize(4);
    }

    @Test
    void slotsHonourLeadTimeAndCapacity() {
        LocalDate day = LocalDate.now().plusDays(2);
        Appointment booked1 = new Appointment();
        booked1.setSlotStart(day.atTime(12, 0));
        booked1.setStatus(Appointment.STATUS_PENDING);
        Appointment booked2 = new Appointment();
        booked2.setSlotStart(day.atTime(12, 0));
        booked2.setStatus(Appointment.STATUS_CONFIRMED);
        when(appointments.findOccupying(any(), any(), any(), any())).thenReturn(List.of(booked1, booked2));

        var slots = service.slots(day, null, "VIDEO_CONSULT");
        assertThat(slots).hasSize(8);
        var noon = slots.stream().filter(s -> s.getStart().equals(day.atTime(12, 0))).findFirst().orElseThrow();
        assertThat(noon.getBooked()).isEqualTo(2);
        assertThat(noon.getRemaining()).isZero();
        assertThat(noon.isAvailable()).isFalse();
        assertThat(noon.getReason()).isEqualTo("FULL");
        var one = slots.stream().filter(s -> s.getStart().equals(day.atTime(13, 0))).findFirst().orElseThrow();
        assertThat(one.isAvailable()).isTrue();

        // Everything today inside the lead time is TOO_SOON.
        var today = service.slots(LocalDate.now(), null, "VIDEO_CONSULT");
        assertThat(today).allSatisfy(s -> {
            if (s.getStart().isBefore(LocalDateTime.now().plusHours(4))) {
                assertThat(s.isAvailable()).isFalse();
                assertThat(s.getReason()).isEqualTo("TOO_SOON");
            }
        });
    }

    @Test
    void bookingAFullSlotIsRejectedWithAClearMessage() {
        LocalDate day = LocalDate.now().plusDays(3);
        Appointment a = new Appointment();
        a.setSlotStart(day.atTime(15, 0));
        a.setStatus(Appointment.STATUS_PENDING);
        Appointment b = new Appointment();
        b.setSlotStart(day.atTime(15, 0));
        b.setStatus(Appointment.STATUS_PENDING);
        when(appointments.findOccupying(any(), any(), any(), any())).thenReturn(List.of(a, b));

        var request = new com.jewelry.backend.dto.AppointmentDtos.AppointmentRequest();
        request.setName("Asha");
        request.setEmail("asha@example.com");
        request.setAppointmentType("VIDEO_CONSULT");
        request.setSlotStart(day.atTime(15, 0));
        assertThatThrownBy(() -> service.createAppointment(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("fully booked");

        request.setSlotStart(day.atTime(15, 30));
        assertThatThrownBy(() -> service.createAppointment(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("every 60 minutes");

        request.setSlotStart(LocalDate.now().minusDays(1).atTime(15, 0));
        assertThatThrownBy(() -> service.createAppointment(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("in the past");
    }

    @Test
    void storeVisitNeedsAStoreAndKeepsRequestedDateInStepWithTheSlot() {
        LocalDate day = LocalDate.now().plusDays(3);
        var request = new com.jewelry.backend.dto.AppointmentDtos.AppointmentRequest();
        request.setName("Asha");
        request.setPhone("9876543210");
        request.setAppointmentType("STORE_VISIT");
        request.setSlotStart(day.atTime(11, 0));
        assertThatThrownBy(() -> service.createAppointment(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("store");

        Store store = new Store();
        store.setId(UUID.randomUUID());
        store.setName("MI Road");
        when(service.storeRepository.findById(store.getId())).thenReturn(Optional.of(store));
        request.setStoreId(store.getId());
        Appointment saved = service.createAppointment(request);
        assertThat(saved.getStatus()).isEqualTo(Appointment.STATUS_PENDING);
        assertThat(saved.getRequestedDate()).isEqualTo(day.atTime(11, 0));
        assertThat(saved.getSlotEnd()).isEqualTo(day.atTime(12, 0));
        assertThat(saved.getStore().getName()).isEqualTo("MI Road");
        assertThat(saved.getPhone()).isEqualTo("+919876543210");
    }

    @Test
    void legacyBookingWithoutASlotStillWorks() {
        var request = new com.jewelry.backend.dto.AppointmentDtos.AppointmentRequest();
        request.setName("Asha");
        request.setEmail("asha@example.com");
        request.setAppointmentType("TRY_AT_HOME");
        request.setRequestedDate(LocalDateTime.of(2026, 11, 2, 9, 30));
        Appointment saved = service.createAppointment(request);
        assertThat(saved.getSlotStart()).isNull();
        assertThat(saved.getRequestedDate()).isEqualTo(LocalDateTime.of(2026, 11, 2, 9, 30));
    }

    @Test
    void statusMachine() {
        Appointment a = new Appointment();
        a.setId(UUID.randomUUID());
        a.setStatus(Appointment.STATUS_PENDING);
        a.setName("Asha");
        a.setEmail("asha@example.com");
        when(appointments.findById(a.getId())).thenReturn(Optional.of(a));

        assertThatThrownBy(() -> service.updateStatus(a.getId(), "COMPLETED"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("cannot move from PENDING to COMPLETED");
        assertThat(service.updateStatus(a.getId(), "CONFIRMED").getStatus()).isEqualTo(Appointment.STATUS_CONFIRMED);
        assertThat(service.updateStatus(a.getId(), "no_show").getStatus()).isEqualTo(Appointment.STATUS_NO_SHOW);
        assertThatThrownBy(() -> service.updateStatus(a.getId(), "CANCELLED", "late"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void typeNormalisationAndLabels() {
        assertThat(AppointmentService.normalizeType("video-consult")).isEqualTo("VIDEO_CONSULT");
        assertThat(AppointmentService.normalizeType(null)).isEqualTo("STORE_VISIT");
        assertThat(AppointmentService.normalizeType("something")).isEqualTo("STORE_VISIT");
        assertThat(AppointmentService.typeLabel("TRY_AT_HOME")).isEqualTo("Try at home");
        assertThat(AppointmentService.needsStore("STORE_VISIT")).isTrue();
        assertThat(AppointmentService.needsStore("TRY_AT_HOME")).isFalse();
    }
}
