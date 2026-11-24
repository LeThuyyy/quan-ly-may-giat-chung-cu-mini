package com.laundry.shared;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WashCycleRepository extends JpaRepository<WashCycle, UUID> {
    Optional<WashCycle> findByMachine_IdAndCompletedAtIsNull(UUID machineId);
    Optional<WashCycle> findByStartHold_Id(UUID holdId);
    List<WashCycle> findByMachine_Building_IdAndCompletedAtIsNull(UUID buildingId);
    List<WashCycle> findByQueueEntry_Account_IdAndMachine_Building_IdAndCompletedAtIsNull(UUID accountId, UUID buildingId);
    @EntityGraph(attributePaths = {"machine", "machine.building"})
    List<WashCycle> findByCompletedAtIsNull();
    Optional<WashCycle> findByIdAndMachine_Building_Id(UUID id, UUID buildingId);
}
