package com.laundry.shared;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "push_outbox", uniqueConstraints = @UniqueConstraint(name = "uk_push_hold_device", columnNames = {"holdId", "subscriptionId"}),
    indexes = @Index(name = "idx_push_due", columnList = "done,nextAttemptAt"))
public class PushOutbox {
    @Id private UUID id;
    @Column(nullable = false) private UUID holdId;
    @Column(nullable = false) private UUID accountId;
    @Column(nullable = false, length = 64) private String subscriptionId;
    @Column(nullable = false) private UUID subscriptionRevision;
    @Column(nullable = false) private Instant expiresAt;
    @Column(nullable = false) private Instant nextAttemptAt;
    @Column(nullable = false) private int attempts;
    @Column(nullable = false) private boolean done;
    protected PushOutbox() {}
    PushOutbox(MachineHold hold, PushSubscription subscription) {
        id = UUID.randomUUID(); holdId = hold.getId(); accountId = hold.getAccountId();
        subscriptionId = subscription.getId(); subscriptionRevision = subscription.getRevision();
        expiresAt = hold.getExpiresAt(); nextAttemptAt = hold.getAssignedAt();
    }
    UUID getId() { return id; }
    UUID getHoldId() { return holdId; }
    UUID getAccountId() { return accountId; }
    String getSubscriptionId() { return subscriptionId; }
    UUID getSubscriptionRevision() { return subscriptionRevision; }
    Instant getExpiresAt() { return expiresAt; }
    Instant getNextAttemptAt() { return nextAttemptAt; }
    int getAttempts() { return attempts; }
    boolean isDone() { return done; }
    void finish() { done = true; }
    void claim(Instant now) { attempts++; nextAttemptAt = now.plusSeconds(30); }
    void retry(Instant now) {
        nextAttemptAt = now.plusSeconds(10L << Math.min(attempts - 1, 3));
        if (attempts >= 4 || !nextAttemptAt.isBefore(expiresAt)) finish();
    }
}
