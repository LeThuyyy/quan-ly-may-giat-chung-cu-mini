package com.laundry.shared;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.util.Optional;
import java.util.List;
import java.util.UUID;

public interface InvitationRepository extends JpaRepository<Invitation, String> {
    Page<Invitation> findByBuilding_Id(UUID buildingId, Pageable page);
    Optional<Invitation> findByManagementIdAndBuilding_Id(UUID id, UUID buildingId);
    @EntityGraph(attributePaths = "building")
    Optional<Invitation> findWithBuildingByTokenHash(String tokenHash);
    List<Invitation> findByManagementIdIsNullOrCreatedAtIsNull();
}
