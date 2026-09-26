package com.jewelry.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jewelry.backend.dto.RepairJobDTO;
import com.jewelry.backend.dto.RepairRequests;
import com.jewelry.backend.entity.RepairJob;
import com.jewelry.backend.entity.RepairJob.Status;
import com.jewelry.backend.entity.RepairJobEvent;
import com.jewelry.backend.repository.RepairJobEventRepository;
import com.jewelry.backend.repository.RepairJobRepository;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;

import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The repair job status machine driven through {@code updateStatus} with mocked persistence. */
class RepairJobServiceTest {

    private RepairJobService service;
    private RepairJobRepository repairJobRepository;
    private RepairJobEventRepository eventRepository;
    private RepairNotificationService notificationService;
    private InvoiceService invoiceService;

    @BeforeEach
    void setUp() {
        repairJobRepository = mock(RepairJobRepository.class);
        eventRepository = mock(RepairJobEventRepository.class);
        notificationService = mock(RepairNotificationService.class);
        invoiceService = mock(InvoiceService.class);
        when(repairJobRepository.save(any(RepairJob.class))).thenAnswer(inv -> inv.getArgument(0));
        when(eventRepository.save(any(RepairJobEvent.class))).thenAnswer(inv -> inv.getArgument(0));
        when(eventRepository.findByJobIdOrderByCreatedAtAsc(any())).thenReturn(List.of());
        when(invoiceService.findForRepairJob(any())).thenReturn(Optional.empty());

        service = new RepairJobService();
        service.repairJobRepository = repairJobRepository;
        service.eventRepository = eventRepository;
        service.notificationService = notificationService;
        service.invoiceService = invoiceService;
        service.objectMapper = new ObjectMapper();
    }

    private RepairJob job(Status status) {
        RepairJob job = new RepairJob();
        job.setId(UUID.randomUUID());
        job.setJobNumber("RJ-2026-00001");
        job.setCustomerName("Meera");
        job.setPhone("9876543210");
        job.setStatus(status);
        when(repairJobRepository.findById(job.getId())).thenReturn(Optional.of(job));
        return job;
    }

    private static RepairRequests.StatusUpdate to(Status next) {
        return new RepairRequests.StatusUpdate(next.name(), null, null, null);
    }

    // ---- the table itself -----------------------------------------------------

    @Test
    void everyStatusHasARowAndTerminalStatesHaveNoExit() {
        assertThat(RepairJobService.TRANSITIONS.keySet()).containsExactlyInAnyOrder(Status.values());
        assertThat(RepairJobService.TRANSITIONS.get(Status.DELIVERED)).isEmpty();
        assertThat(RepairJobService.TRANSITIONS.get(Status.CANCELLED)).isEmpty();
    }

    @Test
    void workCannotBeCancelledOnceItHasStarted() {
        assertThat(RepairJobService.TRANSITIONS.get(Status.IN_PROGRESS)).containsExactly(Status.READY);
        assertThat(RepairJobService.TRANSITIONS.get(Status.READY)).containsExactly(Status.DELIVERED);
    }

    @Test
    void theHappyPathRunsFromRequestedToDelivered() {
        Set<Status> reachable = EnumSet.noneOf(Status.class);
        Status current = Status.REQUESTED;
        for (Status next : List.of(Status.RECEIVED, Status.ASSESSED, Status.APPROVED, Status.IN_PROGRESS, Status.READY, Status.DELIVERED)) {
            assertThat(RepairJobService.TRANSITIONS.get(current)).as("%s -> %s", current, next).contains(next);
            reachable.add(next);
            current = next;
        }
        assertThat(reachable).hasSize(6);
    }

    // ---- every allowed edge through the service --------------------------------

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
            "REQUESTED, RECEIVED",
            "REQUESTED, CANCELLED",
            "RECEIVED, ASSESSED",
            "RECEIVED, CANCELLED",
            "ASSESSED, APPROVED",
            "ASSESSED, CANCELLED",
            "APPROVED, IN_PROGRESS",
            "APPROVED, CANCELLED",
            "IN_PROGRESS, READY",
            "READY, DELIVERED"
    })
    void everyAllowedEdgeIsAccepted(Status from, Status next) {
        RepairJob job = job(from);

        RepairJobDTO dto = service.updateStatus(job.getId(), to(next), "staff@test.local");

        assertThat(job.getStatus()).isEqualTo(next);
        assertThat(dto.status()).isEqualTo(next.name());
        assertThat(dto.allowedTransitions())
                .containsExactlyElementsOf(RepairJobService.TRANSITIONS.get(next).stream().map(Enum::name).sorted().toList());
        verify(repairJobRepository).save(job);

        ArgumentCaptor<RepairJobEvent> event = ArgumentCaptor.forClass(RepairJobEvent.class);
        verify(eventRepository).save(event.capture());
        assertThat(event.getValue().getStatus()).isEqualTo(next);
        assertThat(event.getValue().getActor()).isEqualTo("staff@test.local");
        assertThat(event.getValue().getNote()).isNotBlank();
        assertThat(event.getValue().isVisibleToCustomer()).isTrue();
    }

    @Test
    void allowedEdgesInTheTestMatchTheTableExactly() {
        int edges = RepairJobService.TRANSITIONS.values().stream().mapToInt(Set::size).sum();
        assertThat(edges).as("update the CsvSource above when the table changes").isEqualTo(10);
    }

    @ParameterizedTest(name = "{0} -> {1} is refused")
    @CsvSource({
            "REQUESTED, ASSESSED",
            "REQUESTED, DELIVERED",
            "RECEIVED, APPROVED",
            "ASSESSED, IN_PROGRESS",
            "APPROVED, READY",
            "IN_PROGRESS, CANCELLED",
            "READY, CANCELLED",
            "READY, IN_PROGRESS",
            "DELIVERED, READY",
            "DELIVERED, CANCELLED",
            "CANCELLED, REQUESTED",
            "RECEIVED, RECEIVED"
    })
    void illegalEdgesAreRejectedWithoutSavingAnything(Status from, Status next) {
        RepairJob job = job(from);

        assertThatThrownBy(() -> service.updateStatus(job.getId(), to(next), "staff@test.local"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Cannot move a " + from + " job to " + next);

        assertThat(job.getStatus()).isEqualTo(from);
        verify(repairJobRepository, never()).save(any());
        verify(eventRepository, never()).save(any());
    }

    @ParameterizedTest
    @EnumSource(Status.class)
    void exhaustiveCheckAgainstTheTable(Status from) {
        for (Status next : Status.values()) {
            RepairJob job = job(from);
            boolean allowed = RepairJobService.TRANSITIONS.get(from).contains(next);
            if (allowed) {
                service.updateStatus(job.getId(), to(next), "staff");
                assertThat(job.getStatus()).isEqualTo(next);
            } else {
                assertThatThrownBy(() -> service.updateStatus(job.getId(), to(next), "staff"))
                        .isInstanceOf(IllegalArgumentException.class);
            }
        }
    }

    // ---- side effects --------------------------------------------------------

    @Test
    void timestampsAreStampedOnReceiveReadyAndDelivered() {
        RepairJob job = job(Status.REQUESTED);
        service.updateStatus(job.getId(), to(Status.RECEIVED), "staff");
        assertThat(job.getReceivedAt()).isNotNull();
        assertThat(job.getReadyAt()).isNull();

        RepairJob ready = job(Status.IN_PROGRESS);
        service.updateStatus(ready.getId(), to(Status.READY), "staff");
        assertThat(ready.getReadyAt()).isNotNull();
        verify(notificationService).sendReady(ready);

        RepairJob delivered = job(Status.READY);
        service.updateStatus(delivered.getId(), to(Status.DELIVERED), "staff");
        assertThat(delivered.getDeliveredAt()).isNotNull();
        verify(notificationService).sendDelivered(delivered);
        verify(invoiceService).issueServiceAfterCommit(delivered);
    }

    @Test
    void approvingStampsTheEstimateApprovalOnce() {
        RepairJob job = job(Status.ASSESSED);
        service.updateStatus(job.getId(), to(Status.APPROVED), "staff");
        assertThat(job.getEstimateApprovedAt()).isNotNull();
    }

    @Test
    void noteVisibilityAndPromisedDateComeFromTheRequest() {
        RepairJob job = job(Status.REQUESTED);
        java.time.LocalDate promised = java.time.LocalDate.of(2026, 10, 1);
        service.updateStatus(job.getId(), new RepairRequests.StatusUpdate("received", "Left at counter", false, promised), "staff");

        assertThat(job.getStatus()).isEqualTo(Status.RECEIVED);
        assertThat(job.getPromisedDate()).isEqualTo(promised);
        ArgumentCaptor<RepairJobEvent> event = ArgumentCaptor.forClass(RepairJobEvent.class);
        verify(eventRepository).save(event.capture());
        assertThat(event.getValue().getNote()).isEqualTo("Left at counter");
        assertThat(event.getValue().isVisibleToCustomer()).isFalse();
    }

    @Test
    void unknownStatusAndUnknownJobAreRejected() {
        RepairJob job = job(Status.REQUESTED);
        assertThatThrownBy(() -> service.updateStatus(job.getId(), new RepairRequests.StatusUpdate("LOST", null, null, null), "staff"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.updateStatus(UUID.randomUUID(), to(Status.RECEIVED), "staff"))
                .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void phonesMatchOnDigitsOnly() {
        assertThat(RepairJobService.phoneMatches("+91 98765 43210", "9876543210")).isTrue();
        assertThat(RepairJobService.digits("+91 (98765) 43210")).isEqualTo("919876543210");
    }
}
