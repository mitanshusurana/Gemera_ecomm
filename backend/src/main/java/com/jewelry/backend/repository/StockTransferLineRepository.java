package com.jewelry.backend.repository;

import com.jewelry.backend.entity.StockTransferLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface StockTransferLineRepository extends JpaRepository<StockTransferLine, UUID> {

    /** Per transfer: line count, pieces sent, pieces received (null while not received). */
    @Query("SELECT l.transfer.id, COUNT(l), COALESCE(SUM(l.quantity), 0), SUM(l.receivedQuantity) "
            + "FROM StockTransferLine l WHERE l.transfer.id IN :ids GROUP BY l.transfer.id")
    List<Object[]> summarizeByTransfer(@Param("ids") Collection<UUID> ids);
}
