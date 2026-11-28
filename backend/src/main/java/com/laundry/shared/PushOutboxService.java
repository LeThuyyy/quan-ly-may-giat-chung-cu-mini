package com.laundry.shared;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushOutboxService {
    private final PushOutboxRepository outbox;
    private final PushSubscriptionRepository subscriptions;
    private final MachineHoldRepository holds;
    private final MembershipRepository memberships;
    private final EntityManager em;
    private final Clock clock;
    private final PushSettings settings;
    public PushOutboxService(PushOutboxRepository outbox, PushSubscriptionRepository subscriptions,
                             MachineHoldRepository holds, MembershipRepository memberships,
                             EntityManager em, Clock clock, PushSettings settings) {
        this.outbox = outbox; this.subscriptions = subscriptions; this.holds = holds;
        this.memberships = memberships; this.em = em; this.clock = clock; this.settings = settings;
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public void enqueue(MachineHold hold) {
        if (!settings.enabled()) return;
        for (PushSubscription subscription : subscriptions.findByAccountId(hold.getAccountId()))
            outbox.save(new PushOutbox(hold, subscription));
    }
    @Transactional(readOnly = true)
    public List<UUID> due() {
        return outbox.findByDoneFalseAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAsc(clock.instant(), PageRequest.of(0, 25))
            .stream().map(PushOutbox::getId).toList();
    }
    public record Delivery(UUID id, int attempt, String endpoint, String p256dh, String auth,
                           UUID buildingId, UUID holdId, Instant expiresAt) {}
    @Transactional
    public Delivery claim(UUID id) {
        PushOutbox row = em.find(PushOutbox.class, id, LockModeType.PESSIMISTIC_WRITE);
        Instant now = clock.instant();
        if (row == null || row.isDone() || row.getNextAttemptAt().isAfter(now)) return null;
        MachineHold hold = holds.findById(row.getHoldId()).orElse(null);
        PushSubscription subscription = subscriptions.findById(row.getSubscriptionId()).orElse(null);
        if (row.getAttempts() >= 4 || !now.isBefore(row.getExpiresAt()) || hold == null
            || hold.getStatus() != MachineHold.Status.ACTIVE || !now.isBefore(hold.getExpiresAt())
            || !hold.getAccountId().equals(row.getAccountId()) || subscription == null
            || !subscription.getAccountId().equals(row.getAccountId())
            || !subscription.getRevision().equals(row.getSubscriptionRevision())
            || memberships.findByBuilding_IdAndAccount_Id(hold.getBuildingId(), row.getAccountId())
                .map(m -> m.getStatus() != Membership.Status.APPROVED).orElse(true)) {
            row.finish(); return null;
        }
        row.claim(now);
        return new Delivery(row.getId(), row.getAttempts(), subscription.getEndpoint(), subscription.getP256dh(),
            subscription.getAuth(), hold.getBuildingId(), hold.getId(), hold.getExpiresAt());
    }
    @Transactional
    public void complete(Delivery delivery, int status) {
        PushOutbox row = em.find(PushOutbox.class, delivery.id(), LockModeType.PESSIMISTIC_WRITE);
        if (row == null || row.isDone() || row.getAttempts() != delivery.attempt()) return;
        if (status == 404 || status == 410) {
            PushSubscription subscription = em.find(PushSubscription.class, row.getSubscriptionId(), LockModeType.PESSIMISTIC_WRITE);
            if (subscription != null && subscription.getRevision().equals(row.getSubscriptionRevision())) subscriptions.delete(subscription);
            row.finish();
        } else if (status >= 200 && status < 300) row.finish();
        else row.retry(clock.instant()); // Includes network failures, throttling, redirects and unexpected statuses; never follow redirects.
    }
    @Transactional
    public void cleanup() { outbox.deleteByDoneTrueAndExpiresAtBefore(clock.instant().minusSeconds(86400)); }
}
