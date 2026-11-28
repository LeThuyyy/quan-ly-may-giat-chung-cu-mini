package com.laundry.shared;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "push_subscriptions", indexes = @Index(name = "idx_push_owner", columnList = "accountId"))
public class PushSubscription {
    @Id @Column(length = 64) private String id;
    @Version private Long version;
    @Column(nullable = false, length = 2048) private String endpoint;
    @Column(nullable = false) private UUID accountId;
    @Column(nullable = false, length = 100) private String p256dh;
    @Column(nullable = false, length = 32) private String auth;
    @Column(nullable = false) private UUID revision;
    @Column(nullable = false) private Instant updatedAt;
    protected PushSubscription() {}
    PushSubscription(String id, String endpoint) { this.id = id; this.endpoint = endpoint; }
    void bind(UUID owner, String key, String secret, Instant now) {
        accountId = owner; p256dh = key; auth = secret; updatedAt = now; revision = UUID.randomUUID();
    }
    String getId() { return id; }
    String getEndpoint() { return endpoint; }
    UUID getAccountId() { return accountId; }
    String getP256dh() { return p256dh; }
    String getAuth() { return auth; }
    UUID getRevision() { return revision; }
}
