package com.laundry.shared;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.UUID;

public interface ActivityRepository extends JpaRepository<ActivityEvent, UUID> {
    Page<ActivityEvent> findByBuildingIdAndOccurredAtGreaterThan(UUID buildingId, Instant cutoff, Pageable page);
    Page<ActivityEvent> findByBuildingIdAndOccurredAtGreaterThanAndAction(UUID buildingId, Instant cutoff, String action, Pageable page);
    Page<ActivityEvent> findByBuildingIdAndOccurredAtGreaterThanAndMachineId(UUID buildingId, Instant cutoff, UUID machineId, Pageable page);
    Page<ActivityEvent> findByBuildingIdAndOccurredAtGreaterThanAndActionAndMachineId(UUID buildingId, Instant cutoff, String action, UUID machineId, Pageable page);
    Page<ActivityEvent> findByOccurredAtLessThanEqual(Instant cutoff, Pageable page);
}
