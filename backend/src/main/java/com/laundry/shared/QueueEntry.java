package com.laundry.shared;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "queue_entries", indexes = @Index(name = "idx_queue_building", columnList = "building_id,position"))
public class QueueEntry {
    @Id private UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private Building building;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private Account account;
    @Column(nullable = false) private long position;
    @Column(nullable = false) private boolean ready;
    @Column(nullable = false) private boolean active;
    @Column(nullable = false) private Instant joinedAt;

    protected QueueEntry() {}
    public QueueEntry(Building building, Account account, long position, boolean ready) {
        this.id = UUID.randomUUID();
        this.building = building;
        this.account = account;
        this.position = position;
        this.ready = ready;
        this.active = true;
        this.joinedAt = Instant.now();
    }
    public UUID getId() { return id; }
    public UUID getAccountId() { return account.getId(); }
    public String getDisplayName() { return account.getDisplayName(); }
    public long getPosition() { return position; }
    public boolean isReady() { return ready; }
    public boolean isActive() { return active; }
    public Instant getJoinedAt() { return joinedAt; }
    public void setReady(boolean ready) { if (!active) throw new IllegalStateException("Lượt đã kết thúc"); this.ready = ready; }
    public void leave() { active = false; }
}
