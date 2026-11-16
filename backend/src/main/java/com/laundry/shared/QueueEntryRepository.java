package com.laundry.shared;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QueueEntryRepository extends JpaRepository<QueueEntry, UUID> {
    List<QueueEntry> findByBuilding_IdAndActiveTrueOrderByPositionAsc(UUID buildingId);
    Optional<QueueEntry> findByBuilding_IdAndAccount_IdAndActiveTrue(UUID buildingId, UUID accountId);
    boolean existsByBuilding_IdAndAccount_IdAndActiveTrue(UUID buildingId, UUID accountId);
    long countByBuilding_Id(UUID buildingId);
}
