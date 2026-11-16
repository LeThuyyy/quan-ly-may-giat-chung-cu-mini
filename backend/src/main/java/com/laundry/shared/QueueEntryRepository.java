package com.laundry.shared;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QueueEntryRepository extends JpaRepository<QueueEntry, UUID> {
    List<QueueEntry> findByBuilding_IdAndActiveTrueOrderByPositionAsc(UUID buildingId);
    Optional<QueueEntry> findByBuilding_IdAndAccount_IdAndActiveTrue(UUID buildingId, UUID accountId);
    boolean existsByBuilding_IdAndAccount_IdAndActiveTrue(UUID buildingId, UUID accountId);
    @Query("select coalesce(max(q.position), 0) from QueueEntry q where q.building.id = :buildingId")
    long maxPositionByBuildingId(@Param("buildingId") UUID buildingId);
}
