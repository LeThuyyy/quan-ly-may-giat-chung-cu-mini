package com.laundry.shared;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "memberships", uniqueConstraints = @UniqueConstraint(columnNames = {"building_id", "account_id"}))
public class Membership {
    public enum Role { MANAGER, RESIDENT }
    public enum Status { PENDING, APPROVED, REMOVED }
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
    public void approve() {
        if (status != Status.PENDING) throw new IllegalStateException("Chỉ duyệt yêu cầu đang chờ");
        status = Status.APPROVED;
    }
    public void remove() {
        if (role != Role.RESIDENT) throw new IllegalStateException("Phải hạ vai trò quản lý trước khi gỡ");
        status = Status.REMOVED;
    }
    public void restore() {
        if (status != Status.REMOVED) throw new IllegalStateException("Thành viên chưa bị gỡ");
        status = Status.PENDING;
    }
    public void setRole(Role role) { this.role = role; }
}