package com.laundry.shared;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.time.Instant;
import java.util.UUID;

public interface ActivityRepository extends JpaRepository<ActivityEvent, UUID> {
    @Query("select a from ActivityEvent a where a.buildingId=:buildingId and a.occurredAt>:cutoff and (:action is null or a.action=:action) and (:machineId is null or a.machineId=:machineId)")
    Page<ActivityEvent> history(UUID buildingId, Instant cutoff, String action, UUID machineId, Pageable page);
    Page<ActivityEvent> findByOccurredAtLessThanEqual(Instant cutoff, Pageable page);
}
