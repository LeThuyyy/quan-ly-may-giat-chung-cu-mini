package com.laundry.shared;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "machine_holds", indexes = {
    @Index(name = "idx_hold_machine", columnList = "machine_id,status"),
    @Index(name = "idx_hold_entry", columnList = "queue_entry_id,status")
})
public class MachineHold {
    public enum Status { ACTIVE, STARTED, YIELDED, EXPIRED, UNUSABLE }
    @Id private UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private Machine machine;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private QueueEntry queueEntry;
    @Column(nullable = false) private Instant assignedAt;
    @Column(nullable = false) private Instant expiresAt;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Status status;
    @Column(nullable = false) private boolean physicallyChecked;

    protected MachineHold() {}
    public MachineHold(Machine machine, QueueEntry queueEntry, Instant assignedAt, Instant expiresAt) {
        this.id = UUID.randomUUID();
        this.machine = machine;
        this.queueEntry = queueEntry;
        this.assignedAt = assignedAt;
        this.expiresAt = expiresAt;
        this.status = Status.ACTIVE;
        this.physicallyChecked = false;
    }
    public UUID getId() { return id; }
    public UUID getMachineId() { return machine.getId(); }
    public UUID getBuildingId() { return machine.getBuildingId(); }
    public UUID getQueueEntryId() { return queueEntry.getId(); }
    public UUID getAccountId() { return queueEntry.getAccountId(); }
    public Instant getAssignedAt() { return assignedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public Status getStatus() { return status; }
    public boolean isPhysicallyChecked() { return physicallyChecked; }
    public void confirmPhysicalCheck() {
        if (status != Status.ACTIVE) throw new IllegalStateException("Lượt giữ không còn hiệu lực");
        physicallyChecked = true;
    }
    public void finish(Status next) {
        if (status != Status.ACTIVE || next == Status.ACTIVE) throw new IllegalStateException("Lượt giữ không còn hiệu lực");
        status = next;
    }
}
