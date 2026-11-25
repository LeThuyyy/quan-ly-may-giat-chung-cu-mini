package com.laundry.shared;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "invitations")
public class Invitation {
    @Id private String tokenHash;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private Building building;
    @Column(nullable = false) private Instant expiresAt;
    private Instant revokedAt;
    // Nullable during additive upgrade; existing token hashes remain the primary key.
    @Column(unique = true) private UUID managementId;
    private Instant createdAt;

    protected Invitation() {}
    public Invitation(String tokenHash, Building building, Instant expiresAt) {
        this.tokenHash = tokenHash;
        this.building = building;
        this.expiresAt = expiresAt;
        this.managementId = UUID.randomUUID();
        this.createdAt = expiresAt.minus(java.time.Duration.ofDays(7));
    }
    public UUID getManagementId() { return managementId; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getRevokedAt() { return revokedAt; }
    public void backfillMetadata() {
        if (managementId == null) managementId = UUID.randomUUID();
        if (createdAt == null) createdAt = expiresAt.minus(java.time.Duration.ofDays(7));
    }
    public boolean revoke(Instant now) {
        if (revokedAt != null) return false;
        revokedAt = now;
        return true;
    }
    public UUID getBuildingId() { return building.getId(); }
    public boolean validAt(Instant now) { return revokedAt == null && now.isBefore(expiresAt); }
}
