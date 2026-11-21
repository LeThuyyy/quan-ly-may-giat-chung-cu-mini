package com.laundry.shared;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "machines", uniqueConstraints = @UniqueConstraint(columnNames = {"building_id", "label"}))
public class Machine {
    public enum Status { AVAILABLE, RUNNING, NEEDS_CHECK, MAINTENANCE }
    @Id private UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private Building building;
    @Column(nullable = false, length = 60) private String label;
    @Column(nullable = false) private int displayOrder;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Status status;
    // Nullable for rows created before this field existed; null means unverified.
    private Boolean verifiedFree;

    protected Machine() {}
    public Machine(Building building, String label, int displayOrder) {
        this.id = UUID.randomUUID();
        this.building = building;
        this.label = label;
        this.displayOrder = displayOrder;
        this.status = Status.AVAILABLE;
        this.verifiedFree = false;
    }
    public UUID getId() { return id; }
    public UUID getBuildingId() { return building.getId(); }
    public String getLabel() { return label; }
    public int getDisplayOrder() { return displayOrder; }
    public Status getStatus() { return status; }
    public boolean isVerifiedFree() { return Boolean.TRUE.equals(verifiedFree); }
    public void confirmFree() {
        if (status == Status.RUNNING || status == Status.MAINTENANCE) throw new IllegalStateException("Máy đang chạy hoặc bảo trì");
        status = Status.AVAILABLE;
        verifiedFree = true;
    }
    public void setMaintenance(boolean maintenance) {
        if (status == Status.RUNNING && maintenance) throw new IllegalStateException("Máy đang chạy cần xử lý riêng");
        status = maintenance ? Status.MAINTENANCE : Status.AVAILABLE;
        verifiedFree = false; // Reopening maintenance is not a physical handoff confirmation.
    }
    public void markRunning() {
        if (status != Status.AVAILABLE) throw new IllegalStateException("Máy chưa dùng được");
        status = Status.RUNNING;
        verifiedFree = false;
    }
    public void flagUnusable() { status = Status.NEEDS_CHECK; verifiedFree = false; }
}
