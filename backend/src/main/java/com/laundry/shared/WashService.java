package com.laundry.shared;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** B owns the handover state transitions. All mutations serialize on the A building lock. */
@Service
public class WashService {
    private final BuildingRepository buildings;
    private final AccountRepository accounts;
    private final MembershipRepository memberships;
    private final MachineRepository machines;
    private final MachineHoldRepository holds;
    private final QueueEntryRepository queue;
    private final WashCycleRepository cycles;
    private final AllocationService allocation;
    private final Clock clock;
    private final BuildingAccessService access;
    private final ActivityService activity;

    public WashService(BuildingRepository buildings, AccountRepository accounts, MembershipRepository memberships,
                       MachineRepository machines, MachineHoldRepository holds, QueueEntryRepository queue,
                       WashCycleRepository cycles, AllocationService allocation, Clock clock,
                       BuildingAccessService access, ActivityService activity) {
        this.buildings = buildings; this.accounts = accounts; this.memberships = memberships;
        this.machines = machines; this.holds = holds; this.queue = queue;
        this.cycles = cycles; this.allocation = allocation; this.clock = clock;
        this.access=access;this.activity=activity;
    }
    private ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private void lock(UUID buildingId) {
        buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
    private Account member(String username, UUID buildingId, boolean manager) {
        return access.require(username,buildingId,manager);
    }
    private WashCycle cycle(UUID buildingId, UUID cycleId) {
        return cycles.findByIdAndMachine_Building_Id(cycleId, buildingId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
    private MachineHold hold(UUID buildingId, UUID holdId, Account actor) {
        MachineHold hold = holds.findByIdAndMachine_Building_Id(holdId, buildingId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!hold.getAccountId().equals(actor.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (hold.getStatus() != MachineHold.Status.ACTIVE || !clock.instant().isBefore(hold.getExpiresAt()))
            throw conflict("Lượt giữ đã hết hạn hoặc kết thúc");
        return hold;
    }

    public record CycleView(UUID id, UUID machineId, UUID queueEntryId, UUID accountId, String ownerName,
                            UUID startHoldId, Instant startedAt, int durationMinutes, Instant estimatedEndAt,
                            Instant inspectionAt, Instant serverNow, WashCycle.HandoverMode handoverMode,
                            WashCycle.State state, int overrunReports, Instant completedAt, WashCycle.Completion completion,
                            String phase) {}
    public CycleView view(WashCycle c) {
        Instant now = clock.instant();
        String phase = c.getState() == WashCycle.State.NEEDS_MANAGER ? "NEEDS_MANAGER"
            : c.getState() == WashCycle.State.COMPLETED ? "COMPLETED"
            : now.isBefore(c.getEstimatedEndAt()) ? "RUNNING"
            : now.isBefore(c.inspectionAt()) ? "SELF_PICKUP"
            : "INSPECTION_ELIGIBLE";
        return new CycleView(c.getId(), c.getMachineId(), c.getQueueEntryId(), c.getAccountId(),
            c.getOwnerName(), c.getStartHoldId(), c.getStartedAt(), c.getDurationMinutes(),
            c.getEstimatedEndAt(), c.inspectionAt(), now, c.getHandoverMode(), c.getState(),
            c.getOverrunReports(), c.getCompletedAt(), c.getCompletion(), phase);
    }

    // The A start transaction has committed by the time the HTTP controller formats a response.
    // Reload inside a fresh read transaction; open-in-view is deliberately disabled.
    @Transactional(readOnly = true)
    public CycleView startedView(String username, UUID buildingId, UUID cycleId) {
        Account actor = member(username, buildingId, false);
        WashCycle cycle = cycle(buildingId, cycleId);
        if (!cycle.getAccountId().equals(actor.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return view(cycle);
    }

    @Transactional(readOnly = true)
    public List<CycleView> mine(String username, UUID buildingId) {
        Account actor = member(username, buildingId, false);
        return cycles.findByQueueEntry_Account_IdAndMachine_Building_IdAndCompletedAtIsNull(actor.getId(), buildingId)
            .stream().map(this::view).toList();
    }
    @Transactional
    public CycleView handover(String username, UUID buildingId, UUID holdId) {
        lock(buildingId);
        Account actor = member(username, buildingId, false);
        MachineHold hold = hold(buildingId, holdId, actor);
        return cycles.findByMachine_IdAndCompletedAtIsNull(hold.getMachineId()).map(this::view).orElse(null);
    }
    @Transactional(readOnly = true)
    public List<CycleView> managerIssues(String username, UUID buildingId) {
        member(username, buildingId, true);
        return cycles.findByMachine_Building_IdAndCompletedAtIsNull(buildingId).stream()
            .filter(c -> c.getState() == WashCycle.State.NEEDS_MANAGER).map(this::view).toList();
    }

    /** Owner actually removed clothes and verified machine stopped; may happen before ETA. */
    @Transactional
    public CycleView pickup(String username, UUID buildingId, UUID cycleId, boolean physicallyConfirmed) {
        lock(buildingId);
        Account actor = member(username, buildingId, false);
        WashCycle c = cycle(buildingId, cycleId);
        if (!c.getAccountId().equals(actor.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (!c.isOpen()) {
            if (c.getCompletion() == WashCycle.Completion.OWNER_PICKUP) return view(c);
            throw conflict("Đồ đã được bàn giao theo cách khác");
        }
        if (!physicallyConfirmed) throw conflict("Phải kiểm tra máy đã dừng và tự lấy hết đồ");
        if (c.getState() == WashCycle.State.NEEDS_MANAGER) throw conflict("Quản lý phải xử lý sự cố trước");
        return finish(c, WashCycle.Completion.OWNER_PICKUP,actor.getId());
    }

    /** Another holder physically transferred the old clothes into the owner's own basin. */
    @Transactional
    public CycleView transfer(String username, UUID buildingId, UUID cycleId, UUID holdId, boolean physicallyConfirmed) {
        lock(buildingId);
        Account actor = member(username, buildingId, false);
        MachineHold hold = hold(buildingId, holdId, actor);
        WashCycle c = cycle(buildingId, cycleId);
        if (!hold.getMachineId().equals(c.getMachineId()) || c.getAccountId().equals(actor.getId()))
            throw conflict("Lượt giữ không khớp với mẻ cũ");
        if (!c.isOpen()) {
            if (c.getCompletion() == WashCycle.Completion.TRANSFERRED) return view(c);
            throw conflict("Mẻ đã được xử lý theo cách khác");
        }
        if (!physicallyConfirmed || !c.inspectionEligible(clock.instant()))
            throw conflict("Chưa tới mốc kiểm tra hoặc chưa xác nhận máy đã dừng và đồ đã chuyển");
        return finish(c, WashCycle.Completion.TRANSFERRED,actor.getId());
    }

    private CycleView finish(WashCycle c, WashCycle.Completion completion,UUID actorId) {
        String previous=c.getState().name();
        c.complete(clock.instant(), completion);
        activity.record(c.getBuildingId(),actorId,"WASH_COMPLETED",c.getId(),c.getMachineId(),previous,completion.name());
        queue.findById(c.getQueueEntryId()).orElseThrow().complete();
        machines.findById(c.getMachineId()).orElseThrow().finishAndVerifyFree();
        // Dispatch with same building row lock. An active inspection hold stays in place.
        cycles.flush();
        allocation.dispatchLocked(c.getBuildingId());
        return view(c);
    }

    /** Legacy clients remain supported, but must supply a request ID to make retries idempotent. */
    @Transactional
    public CycleView ownerRemaining(String username, UUID buildingId, UUID cycleId, Integer remainingMinutes) {
        return ownerRemaining(username, buildingId, cycleId, remainingMinutes, null);
    }

    /** Owner sees a changed duration before a handover hold: one adjustment, never silently revokes a hold. */
    @Transactional
    public CycleView ownerRemaining(String username, UUID buildingId, UUID cycleId, Integer remainingMinutes,
                                    UUID clientRequestId) {
        lock(buildingId);
        Account actor = member(username, buildingId, false);
        WashCycle c = cycle(buildingId, cycleId);
        if (!c.getAccountId().equals(actor.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        // Replays describe an already committed command, not a new physical-state decision.
        // Authorize first, then allow replay even if a hold or a later transition now exists.
        if (clientRequestId != null && clientRequestId.equals(c.getLastOwnerAdjustmentRequestId())) {
            if (!java.util.Objects.equals(remainingMinutes, c.getLastOwnerAdjustmentMinutes()))
                throw conflict("Mã yêu cầu đã được dùng với số phút khác");
            return view(c);
        }
        if (remainingMinutes == null || remainingMinutes < 1 || remainingMinutes > 360)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cần nhập phút còn lại (1–360)");
        if (!c.isOpen() || c.getState() != WashCycle.State.ACTIVE) throw conflict("Mẻ đang chờ quản lý hoặc đã hoàn tất");
        if (!holds.findByMachine_IdAndStatus(c.getMachineId(), MachineHold.Status.ACTIVE).isEmpty())
            throw conflict("Đã giao lượt kiểm tra cho người khác, không thể tự gia hạn");
        if (c.getHandoverMode() == WashCycle.HandoverMode.SELF_PICKUP
            && !clock.instant().isBefore(c.getEstimatedEndAt()))
            throw conflict("Cửa sổ tự lấy đã bắt đầu; cần quản lý xác minh trước khi dời mốc");
        c.reportRunning(clock.instant(), remainingMinutes);
        c.rememberOwnerAdjustment(clientRequestId, remainingMinutes);
        activity.record(buildingId,actor.getId(),"WASH_REMAINING_REPORTED",c.getId(),c.getMachineId(),"ACTIVE",c.getState().name());
        if (c.getState() == WashCycle.State.NEEDS_MANAGER)
            machines.findById(c.getMachineId()).orElseThrow().flagUnusable();
        return view(c);
    }

    /** Only a currently held inspector can report overrun; never extend their 8-minute hold. */
    @Transactional
    public CycleView reportStillRunning(String username, UUID buildingId, UUID holdId, Integer remainingMinutes) {
        lock(buildingId);
        Account actor = member(username, buildingId, false);
        MachineHold hold = hold(buildingId, holdId, actor);
        WashCycle c = cycles.findByMachine_IdAndCompletedAtIsNull(hold.getMachineId())
            .orElseThrow(() -> conflict("Không có mẻ cũ đang chạy"));
        if (!c.inspectionEligible(clock.instant())) throw conflict("Chưa tới mốc kiểm tra");
        if (remainingMinutes != null && (remainingMinutes < 1 || remainingMinutes > 360))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Số phút còn lại phải từ 1 đến 360");
        hold.finish(MachineHold.Status.UNUSABLE);
        queue.findById(hold.getQueueEntryId()).orElseThrow().restore();
        c.reportRunning(clock.instant(), remainingMinutes);
        activity.record(buildingId,actor.getId(),"WASH_REMAINING_REPORTED",c.getId(),c.getMachineId(),"ACTIVE",c.getState().name());
        if (c.getState() == WashCycle.State.NEEDS_MANAGER) machines.findById(c.getMachineId()).orElseThrow().flagUnusable();
        holds.flush();
        allocation.dispatchLocked(buildingId);
        return view(c);
    }

    /** Management does not assume the washer stopped from a clock alone. */
    @Transactional
    public CycleView resolve(String username, UUID buildingId, UUID cycleId, String action,
                             Integer remainingMinutes, boolean physicallyConfirmed) {
        lock(buildingId);
        Account manager=member(username, buildingId, true);
        WashCycle c = cycle(buildingId, cycleId);
        if (!c.isOpen() || c.getState() != WashCycle.State.NEEDS_MANAGER) throw conflict("Không có sự cố đang chờ quản lý");
        Machine machine = machines.findById(c.getMachineId()).orElseThrow();
        if (!holds.findByMachine_IdAndStatus(machine.getId(), MachineHold.Status.ACTIVE).isEmpty())
            throw conflict("Máy đang có lượt giữ, hãy xử lý lượt trước");
        switch (action == null ? "" : action) {
            case "CLEARED" -> {
                if (!physicallyConfirmed) throw conflict("Quản lý cần xác nhận máy đã dừng và lồng giặt trống");
                if (machine.getStatus() == Machine.Status.MAINTENANCE) machine.managerClearMaintenance();
                return finish(c, WashCycle.Completion.MANAGER_CLEARED,manager.getId());
            }
            case "DEFER" -> {
                if (remainingMinutes == null || remainingMinutes < 1 || remainingMinutes > 360)
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Phút còn lại không hợp lệ");
                if (machine.getStatus() == Machine.Status.MAINTENANCE) machine.managerClearMaintenance();
                c.managerDefer(clock.instant(), remainingMinutes);
                machine.managerContinueRunning();
            }
            case "MAINTENANCE" -> machine.managerStopForMaintenance();
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hành động không hợp lệ");
        }
        activity.record(buildingId,manager.getId(),"WASH_ISSUE_RESOLVED",c.getId(),c.getMachineId(),"NEEDS_MANAGER",action);
        return view(c);
    }
}
