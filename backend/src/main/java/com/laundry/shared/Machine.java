package com.laundry.shared;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "machines", uniqueConstraints = @UniqueConstraint(columnNames = {"building_id", "label"}))
public class Machine {
    public enum Status { AVAILABLE, MAINTENANCE }
    @Id private UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private Building building;
    @Column(nullable = false, length = 60) private String label;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Status status;

    protected Machine() {}
    public Machine(Building building, String label) {
        this.id = UUID.randomUUID();
        this.building = building;
        this.label = label;
        this.status = Status.AVAILABLE;
    }
    public UUID getId() { return id; }
    public String getLabel() { return label; }
    public Status getStatus() { return status; }
    public void setMaintenance(boolean maintenance) { status = maintenance ? Status.MAINTENANCE : Status.AVAILABLE; }
}
