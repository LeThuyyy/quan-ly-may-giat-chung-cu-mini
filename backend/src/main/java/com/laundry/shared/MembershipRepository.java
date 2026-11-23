package com.laundry.shared;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MembershipRepository extends JpaRepository<Membership, UUID> {
    Optional<Membership> findByBuilding_IdAndAccount_Id(UUID buildingId, UUID accountId);
    @Query("select m from Membership m join fetch m.building where m.account.id = :accountId")
    List<Membership> findWithBuildingByAccountId(@Param("accountId") UUID accountId);
    List<Membership> findByBuilding_IdAndStatus(UUID buildingId, Membership.Status status);
    List<Membership> findByBuilding_Id(UUID buildingId);
    long countByBuilding_IdAndRoleAndStatus(UUID buildingId, Membership.Role role, Membership.Status status);
}