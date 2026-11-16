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

    protected Invitation() {}
    public Invitation(String tokenHash, Building building, Instant expiresAt) {
        this.tokenHash = tokenHash;
        this.building = building;
        this.expiresAt = expiresAt;
    }
    public UUID getBuildingId() { return building.getId(); }
    public boolean validAt(Instant now) { return revokedAt == null && now.isBefore(expiresAt); }
}
