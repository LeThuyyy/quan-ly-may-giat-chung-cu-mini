package com.laundry.shared;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MachineHoldRepository extends JpaRepository<MachineHold, UUID> {
    List<MachineHold> findByMachine_Building_IdAndStatus(UUID buildingId, MachineHold.Status status);
    Optional<MachineHold> findByIdAndMachine_Building_Id(UUID id, UUID buildingId);
    List<MachineHold> findByMachine_IdAndStatus(UUID machineId, MachineHold.Status status);
    List<MachineHold> findByQueueEntry_IdAndStatus(UUID queueEntryId, MachineHold.Status status);
    Optional<MachineHold> findFirstByMachine_Building_IdAndQueueEntry_Account_IdOrderByAssignedAtDescIdDesc(UUID buildingId, UUID accountId);
    @Query("select distinct h.machine.building.id from MachineHold h where h.status = :status and h.expiresAt <= :now")
    List<UUID> findExpiredBuildingIds(@Param("status") MachineHold.Status status, @Param("now") Instant now);
}
