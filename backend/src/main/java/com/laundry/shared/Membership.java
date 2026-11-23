package com.laundry.shared;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "memberships", uniqueConstraints = @UniqueConstraint(columnNames = {"building_id", "account_id"}))
public class Membership {
    public enum Role { MANAGER, RESIDENT }
    public enum Status { PENDING, APPROVED }
    @Id private UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private Building building;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private Account account;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Role role;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Status status;

    protected Membership() {}
    public Membership(Building building, Account account, Role role, Status status) {
        this.id = UUID.randomUUID();
        this.building = building;
        this.account = account;
        this.role = role;
        this.status = status;
    }
    public UUID getId() { return id; }
    public UUID getAccountId() { return account.getId(); }
    public UUID getBuildingId() { return building.getId(); }
    public String getBuildingName() { return building.getName(); }
    public Role getRole() { return role; }
    public Status getStatus() { return status; }
    public void approve() { status = Status.APPROVED; }
    public void setRole(Role role) { this.role = role; }
}