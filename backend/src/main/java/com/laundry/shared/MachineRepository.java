package com.laundry.shared;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MachineRepository extends JpaRepository<Machine, UUID> {
    List<Machine> findByBuilding_IdOrderByLabelAsc(UUID buildingId);
    long countByBuilding_Id(UUID buildingId);
    boolean existsByBuilding_IdAndLabel(UUID buildingId, String label);
    Optional<Machine> findByIdAndBuilding_Id(UUID machineId, UUID buildingId);
}
