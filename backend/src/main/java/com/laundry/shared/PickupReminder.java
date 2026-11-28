package com.laundry.shared;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** Durable cycle/device dedup; retain terminal rows so a subscription rebind cannot replay a cycle. */
@Entity
@Table(name = "pickup_reminders", uniqueConstraints = @UniqueConstraint(name = "uk_pickup_cycle_device", columnNames = {"cycleId", "subscriptionId"}),
    indexes = @Index(name = "idx_pickup_due", columnList = "done,nextAttemptAt"))
public class PickupReminder {
    @Id private UUID id;
    @Column(nullable = false) private UUID cycleId;
    @Column(nullable = false) private UUID buildingId;
    @Column(nullable = false) private UUID accountId;
    @Column(nullable = false, length = 64) private String subscriptionId;
    @Column(nullable = false) private UUID subscriptionRevision;
    @Column(nullable = false) private Instant estimatedEndAt;
    @Column(nullable = false) private Instant nextAttemptAt;
    @Column(nullable = false) private int attempts;
    @Column(nullable = false) private boolean done;
    private boolean expired;
    protected PickupReminder() {}
    PickupReminder(WashCycle cycle, PushSubscription subscription) {
        id = UUID.randomUUID(); cycleId = cycle.getId(); buildingId = cycle.getBuildingId();
        accountId = cycle.getAccountId(); subscriptionId = subscription.getId();
        subscriptionRevision = subscription.getRevision(); reschedule(cycle.getEstimatedEndAt());
    }
    UUID getId() { return id; }
    UUID getCycleId() { return cycleId; }
    UUID getBuildingId() { return buildingId; }
    UUID getAccountId() { return accountId; }
    String getSubscriptionId() { return subscriptionId; }
    UUID getSubscriptionRevision() { return subscriptionRevision; }
    Instant getEstimatedEndAt() { return estimatedEndAt; }
    Instant getNextAttemptAt() { return nextAttemptAt; }
    int getAttempts() { return attempts; }
    boolean isDone() { return done; }
    // Delivery policy: expire exactly 30 minutes after the CURRENT estimate; never replay older cycles.
    Instant deadline() { return estimatedEndAt.plusSeconds(1800); }
    void reschedule(Instant estimate) { estimatedEndAt = estimate; nextAttemptAt = estimate; }
    boolean isExpired() { return expired; }
    void expire() { done = true; expired = true; }
    void resume(Instant estimate) { done = false; expired = false; reschedule(estimate); }
    void finish() { done = true; expired = false; }
    void claim(Instant now) { attempts++; nextAttemptAt = now.plusSeconds(30); }
    void retry(Instant now) {
        nextAttemptAt = now.plusSeconds(10L << Math.min(attempts - 1, 3));
        if (attempts >= 4) finish();
        else if (!nextAttemptAt.isBefore(deadline())) expire();
    }
}
