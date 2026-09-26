package com.jewelry.backend.repository;

import com.jewelry.backend.entity.Appointment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface AppointmentRepository extends JpaRepository<Appointment, UUID> {

    /** Reminder job: appointments requested within [from, to). */
    List<Appointment> findByRequestedDateBetween(LocalDateTime from, LocalDateTime to);

    /** Slot capacity: bookings that occupy slots on one day, for one store (null store = at-home / video). */
    @Query("SELECT a FROM Appointment a WHERE a.slotStart >= :from AND a.slotStart < :to "
            + "AND ((:storeId IS NULL AND a.store IS NULL) OR (a.store.id = :storeId)) "
            + "AND a.status IN :statuses")
    List<Appointment> findOccupying(@Param("storeId") UUID storeId,
                                    @Param("from") LocalDateTime from, @Param("to") LocalDateTime to,
                                    @Param("statuses") Collection<String> statuses);

    /** Admin list: a day (or range) optionally narrowed to one store and one status, chronological. */
    @Query("SELECT a FROM Appointment a WHERE "
            + "(:from IS NULL OR COALESCE(a.slotStart, a.requestedDate) >= :from) "
            + "AND (:to IS NULL OR COALESCE(a.slotStart, a.requestedDate) < :to) "
            + "AND (:storeId IS NULL OR a.store.id = :storeId) "
            + "AND (:status IS NULL OR a.status = :status) "
            + "ORDER BY COALESCE(a.slotStart, a.requestedDate) ASC, a.createdAt ASC")
    List<Appointment> search(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to,
                             @Param("storeId") UUID storeId, @Param("status") String status);

    List<Appointment> findByEmailIgnoreCaseOrderByCreatedAtDesc(String email);

    List<Appointment> findByPhoneOrderByCreatedAtDesc(String phone);
}
