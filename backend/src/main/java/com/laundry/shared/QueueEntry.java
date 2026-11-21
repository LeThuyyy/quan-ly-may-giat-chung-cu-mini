package com.laundry.shared;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "queue_entries", indexes = {
    @Index(name = "idx_queue_building", columnList = "building_id,position"),
    @Index(name = "idx_queue_building_account", columnList = "building_id,account_id,active")
})
public class QueueEntry {
    @Id private UUID id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private Building building;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private Account account;
    @Column(nullable = false) private long position;
    @Column(nullable = false) private boolean ready;
    @Column(nullable = false) private boolean active;
    // Nullable until old H2 rows are backfilled at startup; new rows always set a state.
    @Enumerated(EnumType.STRING) private State state;
    @Column(nullable = false) private Instant joinedAt;
    public enum State { WAITING, HELD, WASHING, LEFT }

    protected QueueEntry() {}
    public QueueEntry(Building building, Account account, long position, boolean ready) {
        this.id = UUID.randomUUID();
        this.building = building;
        this.account = account;
        this.position = position;
        this.ready = ready;
        this.active = true;
        this.state = State.WAITING;
        this.joinedAt = Instant.now();
    }
    public UUID getId() { return id; }
    public UUID getAccountId() { return account.getId(); }
    public String getDisplayName() { return account.getDisplayName(); }
    public long getPosition() { return position; }
    public boolean isReady() { return ready; }
    public boolean isActive() { return active; }
    public State getState() { return state; }
    public Instant getJoinedAt() { return joinedAt; }
    public void setReady(boolean ready) { if (state != State.WAITING) throw new IllegalStateException("Chỉ người đang chờ được đổi Sẵn sàng"); this.ready = ready; }
    public void hold() { if (state != State.WAITING || !ready) throw new IllegalStateException("Lượt chưa sẵn sàng nhận máy"); state = State.HELD; }
    public void restore() { if (state != State.HELD) throw new IllegalStateException("Không có lượt giữ để khôi phục"); state = State.WAITING; }
    public void start() { if (state != State.HELD) throw new IllegalStateException("Không có lượt giữ để bắt đầu"); state = State.WASHING; }
    public void leave() { if (state != State.WAITING) throw new IllegalStateException("Chỉ người đang chờ được rời hàng"); active = false; state = State.LEFT; }
    public void missHold() { if (state != State.HELD) throw new IllegalStateException("Lượt giữ đã kết thúc"); active = false; state = State.LEFT; }
}
