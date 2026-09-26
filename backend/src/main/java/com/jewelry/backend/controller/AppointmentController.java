package com.jewelry.backend.controller;

import com.jewelry.backend.dto.AppointmentDtos.AppointmentDTO;
import com.jewelry.backend.dto.AppointmentDtos.AppointmentRequest;
import com.jewelry.backend.dto.AppointmentDtos.RescheduleRequest;
import com.jewelry.backend.dto.AppointmentDtos.SlotDTO;
import com.jewelry.backend.service.AppointmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Appointments. Booking and the slot grid are public; a customer manages
 * their own bookings by e-mail (signed in) or by the phone they gave
 * ({@code ?phone=}, for guests); staff with appointments.write run the
 * calendar.
 */
@RestController
@RequestMapping("/api/v1/appointments")
@RequiredArgsConstructor
@Tag(name = "Appointments", description = "Consultation bookings with slots per store")
public class AppointmentController {

    private final AppointmentService appointmentService;

    @PostMapping
    @Operation(summary = "Book an appointment (slotStart + storeId, or a plain requestedDate for older callers)")
    public ResponseEntity<AppointmentDTO> createAppointment(@RequestBody AppointmentRequest request) {
        return ResponseEntity.ok(appointmentService.toDTO(appointmentService.createAppointment(request)));
    }

    @GetMapping("/slots")
    @Operation(summary = "The day's slots with remaining capacity")
    public ResponseEntity<List<SlotDTO>> slots(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) UUID storeId,
            @RequestParam(required = false) String type) {
        return ResponseEntity.ok(appointmentService.slots(date, storeId, type));
    }

    @GetMapping("/mine")
    @Operation(summary = "The signed-in customer's appointments")
    public ResponseEntity<List<AppointmentDTO>> mine(Principal principal) {
        List<AppointmentDTO> out = appointmentService.mine(principal == null ? null : principal.getName())
                .stream().map(appointmentService::toDTO).toList();
        return ResponseEntity.ok(out);
    }

    @PostMapping("/{id}/cancel")
    @Operation(summary = "Cancel own appointment (owner by e-mail, or phone match for guests)")
    public ResponseEntity<AppointmentDTO> cancel(@PathVariable UUID id,
                                                 @RequestParam(required = false) String phone,
                                                 @RequestBody(required = false) Map<String, String> body,
                                                 Principal principal) {
        String reason = body == null ? null : body.get("reason");
        return ResponseEntity.ok(appointmentService.toDTO(
                appointmentService.cancelByCustomer(id, principal == null ? null : principal.getName(), phone, reason)));
    }

    @PostMapping("/{id}/reschedule")
    @Operation(summary = "Move own appointment to another slot (goes back to PENDING)")
    public ResponseEntity<AppointmentDTO> reschedule(@PathVariable UUID id,
                                                     @RequestParam(required = false) String phone,
                                                     @RequestBody RescheduleRequest body,
                                                     Principal principal) {
        return ResponseEntity.ok(appointmentService.toDTO(appointmentService.rescheduleByCustomer(
                id, principal == null ? null : principal.getName(), phone,
                body == null ? null : body.getSlotStart(), body == null ? null : body.getStoreId())));
    }

    // ---- staff ---------------------------------------------------------

    @GetMapping
    @PreAuthorize("@access.has('appointments.write')")
    @Operation(summary = "List appointments for a day (or range), optionally one store and one status")
    public ResponseEntity<List<AppointmentDTO>> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(required = false) UUID storeId,
            @RequestParam(required = false) String status) {
        List<AppointmentDTO> out = appointmentService.list(date, from, to, storeId, status)
                .stream().map(appointmentService::toDTO).toList();
        return ResponseEntity.ok(out);
    }

    @GetMapping("/{id}")
    @PreAuthorize("@access.has('appointments.write')")
    public ResponseEntity<AppointmentDTO> get(@PathVariable UUID id) {
        return ResponseEntity.ok(appointmentService.toDTO(appointmentService.get(id)));
    }

    /** Body: {@code { status, reason? }}. PENDING to CONFIRMED|CANCELLED; CONFIRMED to COMPLETED|NO_SHOW|CANCELLED. */
    @RequestMapping(value = "/{id}/status", method = {RequestMethod.PUT, RequestMethod.PATCH})
    @PreAuthorize("@access.has('appointments.write')")
    public ResponseEntity<AppointmentDTO> updateStatus(@PathVariable UUID id, @RequestBody Map<String, String> payload) {
        return ResponseEntity.ok(appointmentService.toDTO(
                appointmentService.updateStatus(id, payload.get("status"), payload.get("reason"))));
    }

    @PutMapping("/{id}/assign")
    @PreAuthorize("@access.has('appointments.write')")
    public ResponseEntity<AppointmentDTO> assign(@PathVariable UUID id, @RequestBody Map<String, String> payload) {
        return ResponseEntity.ok(appointmentService.toDTO(appointmentService.assign(id, payload.get("consultant"))));
    }

    @PutMapping("/{id}/reschedule")
    @PreAuthorize("@access.has('appointments.write')")
    public ResponseEntity<AppointmentDTO> rescheduleByAdmin(@PathVariable UUID id, @RequestBody RescheduleRequest body) {
        return ResponseEntity.ok(appointmentService.toDTO(appointmentService.rescheduleByAdmin(
                id, body == null ? null : body.getSlotStart(), body == null ? null : body.getStoreId())));
    }
}
