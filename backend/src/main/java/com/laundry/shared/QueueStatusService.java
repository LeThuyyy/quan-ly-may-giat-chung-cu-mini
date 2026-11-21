package com.laundry.shared;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

@Service
public class QueueStatusService {
    private final BuildingRepository buildings;
    private final AccountRepository accounts;
    private final MembershipRepository memberships;
    private final QueueEntryRepository queue;
    private final MachineHoldRepository holds;
    private final Clock clock;

    public QueueStatusService(BuildingRepository buildings, AccountRepository accounts,
                              MembershipRepository memberships, QueueEntryRepository queue,
                              MachineHoldRepository holds, Clock clock) {
        this.buildings = buildings;
        this.accounts = accounts;
        this.memberships = memberships;
        this.queue = queue;
        this.holds = holds;
        this.clock = clock;
    }

    // A short transaction takes the same building lock as mutations, so entry and hold
    // cannot be read from opposite sides of a concurrent dispatch/yield/start.
    // Not readOnly: the database must allow the pessimistic lock. No rows are modified.
    @Transactional
    public QueueStatusView current(String username, UUID buildingId) {
        Account account = accounts.findByUsername(username)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        buildings.findLockedById(buildingId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Membership membership = memberships.findByBuilding_IdAndAccount_Id(buildingId, account.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN));
        if (membership.getStatus() != Membership.Status.APPROVED) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        Instant now = clock.instant();
        var entries = queue.findByBuilding_IdAndAccount_IdAndActiveTrue(buildingId, account.getId());
        if (entries.isEmpty()) {
            return new QueueStatusView(State.NONE, null, null, null, null, null, now);
        }
        if (entries.size() != 1) throw inconsistent();
        QueueEntry entry = entries.getFirst();
        if (entry.getState() == QueueEntry.State.WAITING) {
            return new QueueStatusView(State.WAITING, entry.getId(), entry.isReady(), null, null, null, now);
        }
        boolean held = entry.getState() == QueueEntry.State.HELD;
        if (!held && entry.getState() != QueueEntry.State.WASHING) throw inconsistent();
        var linkedHolds = holds.findByQueueEntry_IdAndStatus(entry.getId(),
            held ? MachineHold.Status.ACTIVE : MachineHold.Status.STARTED);
        if (linkedHolds.size() != 1) throw inconsistent();
        MachineHold hold = linkedHolds.getFirst();
        if (!hold.getBuildingId().equals(buildingId)) throw inconsistent();
        // HELD remains HELD until the expiry transaction commits, even at/after the deadline.
        // Expose time and deadline instead of falsely advertising eligibility to join again.
        return new QueueStatusView(held ? State.HELD : State.WASHING, entry.getId(), null,
            hold.getId(), hold.getMachineId(), held ? hold.getExpiresAt() : null, now);
    }

    private ResponseStatusException inconsistent() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "Trạng thái yêu cầu chưa nhất quán. Hãy tải lại hoặc liên hệ quản lý.");
    }

    public enum State { NONE, WAITING, HELD, WASHING }
    public record QueueStatusView(State state, UUID queueEntryId, Boolean ready, UUID holdId,
                                  UUID machineId, Instant expiresAt, Instant serverNow) {}
}
