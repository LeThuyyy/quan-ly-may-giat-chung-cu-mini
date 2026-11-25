package com.laundry.shared;

import jakarta.persistence.*;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/** An unfinished cycle stays attached to the old owner while a newer inspection hold can exist. */
@Entity
@Table(name = "wash_cycles", indexes = {
    @Index(name = "idx_cycle_machine_end", columnList = "machine_id,completed_at"),
    @Index(name = "idx_cycle_hold", columnList = "start_hold_id")
})
public class WashCycle {
    public enum HandoverMode { ALLOW_TRANSFER, SELF_PICKUP }
    public enum State { ACTIVE, NEEDS_MANAGER, COMPLETED }
    public enum Completion { OWNER_PICKUP, TRANSFERRED, MANAGER_CLEARED }

    @Id private UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private Machine machine;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private QueueEntry queueEntry;
    @OneToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "start_hold_id", nullable = false, unique = true) private MachineHold startHold;
    @Column(nullable = false) private Instant startedAt;
    @Column(nullable = false) private int durationMinutes;
    @Column(nullable = false) private Instant estimatedEndAt;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private HandoverMode handoverMode;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private State state;
    @Column(nullable = false) private int overrunReports;
    @Column(name = "completed_at") private Instant completedAt;
    @Enumerated(EnumType.STRING) private Completion completion;

    protected WashCycle() {}
    public WashCycle(Machine machine, QueueEntry queueEntry, MachineHold startHold, Instant startedAt,
                     int durationMinutes, HandoverMode handoverMode) {
        if (durationMinutes < 1 || durationMinutes > 360 || handoverMode == null)
            throw new IllegalArgumentException("Thời lượng và chế độ bàn giao không hợp lệ");
        this.id = UUID.randomUUID(); this.machine = machine; this.queueEntry = queueEntry;
        this.startHold = startHold; this.startedAt = startedAt; this.durationMinutes = durationMinutes;
        this.estimatedEndAt = startedAt.plus(Duration.ofMinutes(durationMinutes));
        this.handoverMode = handoverMode; this.state = State.ACTIVE;
    }
    public UUID getId() { return id; }
    public UUID getMachineId() { return machine.getId(); }
    public UUID getBuildingId() { return machine.getBuildingId(); }
    public UUID getQueueEntryId() { return queueEntry.getId(); }
    public UUID getAccountId() { return queueEntry.getAccountId(); }
    public String getOwnerName() { return queueEntry.getDisplayName(); }
    public UUID getStartHoldId() { return startHold.getId(); }
    public Instant getStartedAt() { return startedAt; }
    public int getDurationMinutes() { return durationMinutes; }
    public Instant getEstimatedEndAt() { return estimatedEndAt; }
    public HandoverMode getHandoverMode() { return handoverMode; }
    public State getState() { return state; }
    public int getOverrunReports() { return overrunReports; }
    public Instant getCompletedAt() { return completedAt; }
    public Completion getCompletion() { return completion; }
    public boolean isOpen() { return completedAt == null; }
    public Instant inspectionAt() { return handoverMode == HandoverMode.SELF_PICKUP ? estimatedEndAt.plus(Duration.ofMinutes(10)) : estimatedEndAt; }
    public boolean inspectionEligible(Instant now) { return state == State.ACTIVE && !now.isBefore(inspectionAt()); }
    public void reportRunning(Instant now, Integer minutes) {
        if (!isOpen() || state != State.ACTIVE) throw new IllegalStateException("Mẻ không thể báo còn chạy");
        overrunReports++;
        if (minutes == null || minutes < 1 || minutes > 360 || overrunReports > 1) {
            state = State.NEEDS_MANAGER;
        } else {
            estimatedEndAt = now.plus(Duration.ofMinutes(minutes));
        }
    }
    public void managerDefer(Instant now, int minutes) {
        if (!isOpen() || state != State.NEEDS_MANAGER || minutes < 1 || minutes > 360)
            throw new IllegalStateException("Không thể dời mốc");
        state = State.ACTIVE;
        estimatedEndAt = now.plus(Duration.ofMinutes(minutes));
        // Keep overrunReports: never silently grant a second resident report.
    }
    public void markNeedsManager() {
        if (isOpen()) state = State.NEEDS_MANAGER;
    }
    public void complete(Instant now, Completion kind) {
        if (!isOpen()) throw new IllegalStateException("Mẻ đã hoàn tất");
        completedAt = now; completion = kind; state = State.COMPLETED;
    }
}
