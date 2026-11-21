package com.laundry.shared;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class AllocationService {
    private static final Duration HOLD_TIME = Duration.ofMinutes(8);
    private final BuildingRepository buildings;
    private final MembershipRepository memberships;
    private final AccountRepository accounts;
    private final QueueEntryRepository queue;
    private final MachineRepository machines;
    private final MachineHoldRepository holds;
    private final Clock clock;

    public AllocationService(BuildingRepository buildings, MembershipRepository memberships,
                             AccountRepository accounts, QueueEntryRepository queue,
                             MachineRepository machines, MachineHoldRepository holds, Clock clock) {
        this.buildings = buildings; this.memberships = memberships; this.accounts = accounts;
        this.queue = queue; this.machines = machines; this.holds = holds; this.clock = clock;
    }

    // All decisions for one building are serialized by its database row lock.
    @Transactional
    public List<HoldView> dispatch(UUID buildingId) {
        buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return dispatchLocked(buildingId);
    }

    List<HoldView> dispatchLocked(UUID buildingId) {
        Instant now = clock.instant();
        List<MachineHold> active = holds.findByMachine_Building_IdAndStatus(buildingId, MachineHold.Status.ACTIVE);
        Set<UUID> occupied = new HashSet<>();
        for (MachineHold hold : active) {
            if (!now.isBefore(hold.getExpiresAt())) {
                hold.finish(MachineHold.Status.EXPIRED);
                queue.findById(hold.getQueueEntryId()).orElseThrow().missHold();
            } else occupied.add(hold.getMachineId());
        }
        // Flush closed holds before querying or inserting replacement holds in the same transaction.
        holds.flush();
        List<QueueEntry> eligible = queue.findByBuilding_IdAndStateOrderByPositionAsc(buildingId, QueueEntry.State.WAITING)
            .stream().filter(QueueEntry::isReady).toList();
        List<HoldView> created = new ArrayList<>();
        int index = 0;
        for (Machine machine : machines.findByBuilding_IdOrderByDisplayOrderAsc(buildingId)) {
            if (machine.getStatus() != Machine.Status.AVAILABLE || !machine.isVerifiedFree()
                || occupied.contains(machine.getId()) || index >= eligible.size()) continue;
            QueueEntry entry = eligible.get(index++);
            entry.hold(); // Retains the rank token while hidden from the waiting list.
            MachineHold hold = holds.save(new MachineHold(machine, entry, now, now.plus(HOLD_TIME)));
            created.add(view(hold));
        }
        return created;
    }

    @Transactional
    public void yield(String username, UUID buildingId, UUID holdId) {
        MachineHold hold = activeHold(username, buildingId, holdId);
        hold.finish(MachineHold.Status.YIELDED);
        queue.findById(hold.getQueueEntryId()).orElseThrow().missHold();
        holds.flush();
        dispatchLocked(buildingId);
    }

    @Transactional
    public void expire(UUID buildingId) {
        buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        dispatchLocked(buildingId);
    }

    @Transactional
    public void reportUnusable(String username, UUID buildingId, UUID holdId) {
        MachineHold hold = activeHold(username, buildingId, holdId);
        hold.finish(MachineHold.Status.UNUSABLE);
        queue.findById(hold.getQueueEntryId()).orElseThrow().restore();
        Machine machine = machines.findById(hold.getMachineId()).orElseThrow();
        machine.flagUnusable();
        holds.flush();
        dispatchLocked(buildingId); // Other verified-available machines may be assigned.
    }

    @Transactional
    public void confirmPhysicalCheck(String username, UUID buildingId, UUID holdId) {
        activeHold(username, buildingId, holdId).confirmPhysicalCheck();
    }

    @Transactional
    public void start(String username, UUID buildingId, UUID holdId) {
        MachineHold hold = activeHold(username, buildingId, holdId);
        if (!hold.isPhysicallyChecked())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Hãy xác nhận đã kiểm tra máy tại chỗ");
        hold.finish(MachineHold.Status.STARTED);
        queue.findById(hold.getQueueEntryId()).orElseThrow().start();
        machines.findById(hold.getMachineId()).orElseThrow().markRunning();
    }

    @Transactional(readOnly = true)
    public List<HoldView> activeHolds(String username, UUID buildingId) {
        member(username, buildingId);
        return holds.findByMachine_Building_IdAndStatus(buildingId, MachineHold.Status.ACTIVE)
            .stream().filter(hold -> clock.instant().isBefore(hold.getExpiresAt()))
            .map(this::view).toList();
    }

    private MachineHold activeHold(String username, UUID buildingId, UUID holdId) {
        Account user = member(username, buildingId);
        buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        MachineHold hold = holds.findByIdAndMachine_Building_Id(holdId, buildingId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!hold.getAccountId().equals(user.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (hold.getStatus() != MachineHold.Status.ACTIVE || !clock.instant().isBefore(hold.getExpiresAt()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lượt giữ đã hết hạn hoặc kết thúc");
        return hold;
    }
    private Account member(String username, UUID buildingId) {
        Account user = accounts.findByUsername(username).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Membership membership = memberships.findByBuilding_IdAndAccount_Id(buildingId, user.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN));
        if (membership.getStatus() != Membership.Status.APPROVED) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return user;
    }
    private HoldView view(MachineHold hold) {
        return new HoldView(hold.getId(), hold.getMachineId(), hold.getAccountId(), hold.getQueueEntryId(), hold.getExpiresAt());
    }
    public record HoldView(UUID id, UUID machineId, UUID accountId, UUID queueEntryId, Instant expiresAt) {}
}
