package com.laundry.shared;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "accounts", uniqueConstraints = @UniqueConstraint(columnNames = "username"))
public class Account {
    @Id private UUID id;
    @Column(nullable = false, length = 80) private String username;
    @Column(nullable = false) private String passwordHash;
    @Column(nullable = false, length = 80) private String displayName;

    protected Account() {}
    public Account(String username, String passwordHash, String displayName) {
        this.id = UUID.randomUUID();
        this.username = username;
        this.passwordHash = passwordHash;
        this.displayName = displayName;
    }
    public UUID getId() { return id; }
    public String getUsername() { return username; }
    public String getPasswordHash() { return passwordHash; }
    public String getDisplayName() { return displayName; }
}
