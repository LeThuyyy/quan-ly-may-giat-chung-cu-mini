package com.laundry.shared;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MembershipRepository extends JpaRepository<Membership, UUID> {
    Optional<Membership> findByBuilding_IdAndAccount_Id(UUID buildingId, UUID accountId);
    List<Membership> findByAccount_Id(UUID accountId);
    List<Membership> findByBuilding_IdAndStatus(UUID buildingId, Membership.Status status);
}
