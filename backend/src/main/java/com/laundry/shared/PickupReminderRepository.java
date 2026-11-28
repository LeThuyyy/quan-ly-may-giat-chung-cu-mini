package com.laundry.shared;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PickupReminderRepository extends JpaRepository<PickupReminder, UUID> {
    interface Candidate {
        UUID getCycleId();
        UUID getBuildingId();
        String getSubscriptionId();
    }
    @Query("""
        select c.id as cycleId, c.machine.building.id as buildingId, s.id as subscriptionId
        from WashCycle c, PushSubscription s
        where c.state = com.laundry.shared.WashCycle.State.ACTIVE and c.completedAt is null
          and c.estimatedEndAt <= :now and c.estimatedEndAt > :oldest
          and s.accountId = c.queueEntry.account.id
          and exists (select m.id from Membership m where m.building.id = c.machine.building.id
                      and m.account.id = s.accountId and m.status = com.laundry.shared.Membership.Status.APPROVED)
          and not exists (select r.id from PickupReminder r where r.cycleId = c.id and r.subscriptionId = s.id)
        order by c.estimatedEndAt, c.id, s.id
        """)
    List<Candidate> candidates(Instant now, Instant oldest, Pageable page);
    boolean existsByCycleIdAndSubscriptionId(UUID cycleId, String subscriptionId);
    @Query("""
        select r from PickupReminder r, WashCycle c where r.cycleId = c.id
          and ((r.done = false and (r.nextAttemptAt <= :now or (r.estimatedEndAt <> c.estimatedEndAt and c.estimatedEndAt <= :now)))
            or (r.expired = true and r.estimatedEndAt <> c.estimatedEndAt and c.estimatedEndAt <= :now
                and c.state = com.laundry.shared.WashCycle.State.ACTIVE and c.completedAt is null))
        order by r.nextAttemptAt
        """)
    List<PickupReminder> due(Instant now, Pageable page);
}
