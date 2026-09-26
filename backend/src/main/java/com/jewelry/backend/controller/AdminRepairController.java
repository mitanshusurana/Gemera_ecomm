package com.jewelry.backend.controller;

import com.jewelry.backend.dto.RepairJobDTO;
import com.jewelry.backend.dto.RepairRequests;
import com.jewelry.backend.entity.GlobalSetting;
import com.jewelry.backend.entity.Invoice;
import com.jewelry.backend.entity.RepairJob;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.service.InvoiceService;
import com.jewelry.backend.service.RepairJobCardRenderer;
import com.jewelry.backend.service.RepairJobService;
import com.jewelry.backend.service.RepairNotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Admin workflow for repair jobs: list, detail, status, estimate, assignment, payment, notes, job card. */
@RestController
@RequestMapping("/api/v1/admin/repairs")
@PreAuthorize("@access.has('repairs.write')")
@Tag(name = "Admin Repairs", description = "Repair and service job workflow (Admin)")
public class AdminRepairController {

    @Autowired
    RepairJobService repairJobService;

    @Autowired
    RepairJobCardRenderer jobCardRenderer;

    @Autowired
    RepairNotificationService notificationService;

    @Autowired
    GlobalSettingRepository globalSettingRepository;

    @Autowired
    InvoiceService invoiceService;

    @GetMapping
    @Operation(summary = "List jobs, newest first, with optional status filter and search (job number, phone, name, email)")
    public ResponseEntity<Page<RepairJobDTO>> list(@RequestParam(required = false) String status,
                                                   @RequestParam(required = false) String search,
                                                   @RequestParam(defaultValue = "0") int page,
                                                   @RequestParam(defaultValue = "50") int size) {
        PageRequest pageable = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 200),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        return ResponseEntity.ok(repairJobService.list(status, search, pageable));
    }

    @GetMapping("/stats")
    @Operation(summary = "Count of jobs per status, for the filter chips")
    public ResponseEntity<Map<String, Long>> stats() {
        return ResponseEntity.ok(repairJobService.stats());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Job detail with the full event history")
    public ResponseEntity<RepairJobDTO> get(@PathVariable UUID id) {
        return ResponseEntity.ok(repairJobService.get(id));
    }

    @PutMapping("/{id}/status")
    @Operation(summary = "Move the job along the status machine; note and visibility recorded as an event")
    public ResponseEntity<RepairJobDTO> updateStatus(@PathVariable UUID id,
                                                     @Valid @RequestBody RepairRequests.StatusUpdate request,
                                                     Principal principal) {
        return ResponseEntity.ok(repairJobService.updateStatus(id, request, actor(principal)));
    }

    @PutMapping("/{id}/estimate")
    @Operation(summary = "Set the estimate (RECEIVED moves to ASSESSED) and e-mail the customer for approval")
    public ResponseEntity<RepairJobDTO> setEstimate(@PathVariable UUID id,
                                                    @Valid @RequestBody RepairRequests.Estimate request,
                                                    Principal principal) {
        return ResponseEntity.ok(repairJobService.setEstimate(id, request, actor(principal)));
    }

    @PutMapping("/{id}/assign")
    @Operation(summary = "Assign the job to a staff member")
    public ResponseEntity<RepairJobDTO> assign(@PathVariable UUID id,
                                               @Valid @RequestBody RepairRequests.Assign request,
                                               Principal principal) {
        return ResponseEntity.ok(repairJobService.assign(id, request, actor(principal)));
    }

    @PutMapping("/{id}/payment")
    @Operation(summary = "Record the final bill and payment")
    public ResponseEntity<RepairJobDTO> payment(@PathVariable UUID id,
                                                @Valid @RequestBody RepairRequests.Payment request,
                                                Principal principal) {
        return ResponseEntity.ok(repairJobService.recordPayment(id, request, actor(principal)));
    }

    @PutMapping("/{id}/notes")
    @Operation(summary = "Replace the internal notes (never shown to the customer)")
    public ResponseEntity<RepairJobDTO> notes(@PathVariable UUID id,
                                              @Valid @RequestBody RepairRequests.Notes request,
                                              Principal principal) {
        return ResponseEntity.ok(repairJobService.updateNotes(id, request, actor(principal)));
    }

    // No "produces": a 404 ProblemDetail must not be pinned to application/pdf.
    @GetMapping("/{id}/job-card.pdf")
    @Operation(summary = "A5 job card PDF with a tear-off customer receipt stub")
    public ResponseEntity<byte[]> jobCard(@PathVariable UUID id) {
        RepairJob job = repairJobService.getEntity(id);
        byte[] pdf = jobCardRenderer.render(job, branding(), notificationService.trackingUrl(job));
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + job.getJobNumber() + "-job-card.pdf\"")
                .body(pdf);
    }

    /**
     * Service tax invoice PDF. Issues it when the job is delivered or fully
     * paid and none exists yet; 404 (JSON) before that. The method-level
     * permission replaces the class-level repairs.write, as on orders.
     */
    @GetMapping("/{id}/invoice.pdf")
    @PreAuthorize("@access.has('invoices.read')")
    @Operation(summary = "Service tax invoice PDF (issued on first request once delivered or fully paid)")
    public ResponseEntity<byte[]> invoice(@PathVariable UUID id) {
        RepairJob job = repairJobService.getEntity(id);
        Invoice invoice = invoiceService.ensureServiceInvoice(job);
        byte[] pdf = invoiceService.renderPdf(invoice);
        String filename = invoice.getInvoiceNumber().replace('/', '-') + ".pdf";
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(pdf);
    }

    private RepairJobCardRenderer.Branding branding() {
        Map<String, String> s = new java.util.HashMap<>();
        for (GlobalSetting g : globalSettingRepository.findBySettingKeyIn(
                List.of("companyLegalName", "companyPhone", "companyAddress"))) {
            if (g.getSettingValue() != null) s.put(g.getSettingKey(), g.getSettingValue());
        }
        String address = s.get("companyAddress");
        if (address != null) {
            // The footer renders this value as HTML; the PDF wants plain text.
            address = address.replaceAll("<br\\s*/?>", ", ").replaceAll("<[^>]+>", "").replaceAll("\\s+", " ").trim();
        }
        return new RepairJobCardRenderer.Branding(s.get("companyLegalName"), s.get("companyPhone"), address);
    }

    private static String actor(Principal principal) {
        return principal == null ? "Admin" : principal.getName();
    }
}
