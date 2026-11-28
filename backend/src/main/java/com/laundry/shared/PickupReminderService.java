package com.laundry.shared;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PickupReminderService {
    private final PickupReminderRepository rows;
    private final WashCycleRepository cycles;
    private final BuildingRepository buildings;
    private final PushSubscriptionRepository subscriptions;
    private final MembershipRepository memberships;
    private final EntityManager em;
    private final Clock clock;
    public PickupReminderService(PickupReminderRepository rows, WashCycleRepository cycles,
            BuildingRepository buildings, PushSubscriptionRepository subscriptions,
            MembershipRepository memberships, EntityManager em, Clock clock) {
        this.rows = rows; this.cycles = cycles; this.buildings = buildings;
        this.subscriptions = subscriptions; this.memberships = memberships; this.em = em; this.clock = clock;
    }
    @Transactional(readOnly = true)
    public List<PickupReminderRepository.Candidate> candidates() {
        var now = clock.instant();
        return rows.candidates(now, now.minusSeconds(1800), PageRequest.of(0, 25));
    }
    @Transactional
    public void enqueue(PickupReminderRepository.Candidate candidate) {
        buildings.findLockedById(candidate.getBuildingId()).orElseThrow();
        var cycle = cycles.findById(candidate.getCycleId()).orElse(null);
        var subscription = subscriptions.findById(candidate.getSubscriptionId()).orElse(null);
        var now = clock.instant();
        if (cycle == null || !eligible(cycle) || subscription == null
                || !subscription.getAccountId().equals(cycle.getAccountId())
                || now.isBefore(cycle.getEstimatedEndAt()) || !now.isBefore(cycle.getEstimatedEndAt().plusSeconds(1800))
                || rows.existsByCycleIdAndSubscriptionId(cycle.getId(), subscription.getId())) return;
        rows.save(new PickupReminder(cycle, subscription));
    }
    private boolean eligible(WashCycle cycle) {
        return cycle.isOpen() && cycle.getState() == WashCycle.State.ACTIVE
            && memberships.findByBuilding_IdAndAccount_Id(cycle.getBuildingId(), cycle.getAccountId())
                .map(m -> m.getStatus() == Membership.Status.APPROVED).orElse(false);
    }
    @Transactional(readOnly = true)
    public List<UUID> due() {
        return rows.due(clock.instant(), PageRequest.of(0, 25))
            .stream().map(PickupReminder::getId).toList();
    }
    @Transactional
    public PushOutboxService.Delivery claim(UUID id) {
        // Always acquire building before reminder row, as with other mutable wash operations.
        var snapshot = rows.findById(id).orElse(null);
        if (snapshot == null) return null;
        buildings.findLockedById(snapshot.getBuildingId()).orElseThrow();
        var row = em.find(PickupReminder.class, id, LockModeType.PESSIMISTIC_WRITE);
        em.refresh(row);
        var now = clock.instant();
        var cycle = cycles.findById(row.getCycleId()).orElse(null);
        if (row.isDone()) {
            if (row.isExpired() && cycle != null && !row.getEstimatedEndAt().equals(cycle.getEstimatedEndAt()))
                row.resume(cycle.getEstimatedEndAt());
            else return null;
        }
        var subscription = subscriptions.findById(row.getSubscriptionId()).orElse(null);
        if (cycle == null || !eligible(cycle) || subscription == null
                || !subscription.getAccountId().equals(row.getAccountId())
                || !subscription.getRevision().equals(row.getSubscriptionRevision()) || row.getAttempts() >= 4) {
            row.finish(); return null;
        }
        if (!row.getEstimatedEndAt().equals(cycle.getEstimatedEndAt())) row.reschedule(cycle.getEstimatedEndAt());
        if (now.isBefore(row.getNextAttemptAt())) return null;
        if (!now.isBefore(row.deadline())) { row.expire(); return null; }
        row.claim(now);
        return new PushOutboxService.Delivery(row.getId(), row.getAttempts(), subscription.getEndpoint(),
            subscription.getP256dh(), subscription.getAuth(), row.getBuildingId(), row.getCycleId(), row.deadline(), true);
    }
    @Transactional
    public void complete(PushOutboxService.Delivery delivery, int status) {
        var row = em.find(PickupReminder.class, delivery.id(), LockModeType.PESSIMISTIC_WRITE);
        if (row == null || row.isDone() || row.getAttempts() != delivery.attempt()) return;
        if (status == 404 || status == 410) {
            var subscription = em.find(PushSubscription.class, row.getSubscriptionId(), LockModeType.PESSIMISTIC_WRITE);
            if (subscription != null && subscription.getRevision().equals(row.getSubscriptionRevision())) subscriptions.delete(subscription);
            row.finish();
        } else if (status >= 200 && status < 300) row.finish();
        else row.retry(clock.instant());
    }
}
