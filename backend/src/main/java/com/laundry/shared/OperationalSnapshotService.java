package com.laundry.shared;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Coherent operational reads. All existing mutations take this same building row lock. */
@Service
public class OperationalSnapshotService {
    private final BuildingRepository buildings;
    private final BuildingAccessService access;
    private final MembershipRepository memberships;
    private final LaundryService laundry;
    private final QueueStatusService status;
    private final MachineHoldRepository holds;
    private final WashCycleRepository cycles;
    private final WashService wash;
    private final EtaService eta;
    private final QueueSwapService swaps;
    private final Clock clock;

    public OperationalSnapshotService(BuildingRepository buildings, BuildingAccessService access,
                                      MembershipRepository memberships, LaundryService laundry,
                                      QueueStatusService status, MachineHoldRepository holds,
                                      WashCycleRepository cycles, WashService wash,
                                      EtaService eta, QueueSwapService swaps, Clock clock) {
        this.buildings = buildings;
        this.access = access;
        this.memberships = memberships;
        this.laundry = laundry;
        this.status = status;
        this.holds = holds;
        this.cycles = cycles;
        this.wash = wash;
        this.eta = eta;
        this.swaps = swaps;
        this.clock = clock;
    }

    @Transactional
    public Snapshot get(String username, UUID buildingId) {
        buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Account actor = access.require(username, buildingId, false);
        Membership membership = memberships.findByBuilding_IdAndAccount_Id(buildingId, actor.getId()).orElseThrow();
        Instant now = clock.instant();
        var current = status.current(username, buildingId);
        // Keep expired but unprocessed ACTIVE holds visible; a read must not expire/dispatch.
        var active = holds.findByMachine_Building_IdAndStatus(buildingId, MachineHold.Status.ACTIVE).stream()
            .map(h -> new AllocationService.HoldView(
                h.getId(), h.getMachineId(), h.getAccountId(), h.getQueueEntryId(), h.getExpiresAt(), h.isPhysicallyChecked()
            ))
            .toList();
        var own = active.stream().filter(h -> h.accountId().equals(actor.getId())).findFirst().orElse(null);
        WashService.CycleView previous = own == null
            ? null
            : cycles.findByMachine_IdAndCompletedAtIsNull(own.machineId()).map(wash::view).orElse(null);
        var mine = wash.mine(username, buildingId);
        var estimate = eta.me(username, buildingId);
        return new Snapshot(
            laundry.view(username, buildingId),
            new LaundryService.BuildingSummary(buildingId, membership.getBuildingName(), membership.getRole(), membership.getStatus()),
            new QueueStatusService.QueueStatusView(
                current.state(), current.queueEntryId(), current.ready(), current.holdId(), current.machineId(), current.expiresAt(), now
            ),
            active,
            mine,
            previous,
            new EtaService.Estimate(
                estimate.state(), estimate.rank(), estimate.readyAhead(), estimate.rangeStart(), estimate.rangeEnd(),
                now, estimate.assumptions(), estimate.reason()
            ),
            swaps.list(username, buildingId, 0, 50),
            now
        );
    }

    public record Snapshot(LaundryService.BuildingView building, LaundryService.BuildingSummary membership,
                           QueueStatusService.QueueStatusView queueStatus, List<AllocationService.HoldView> holds,
                           List<WashService.CycleView> myCycles, WashService.CycleView previousCycle,
                           EtaService.Estimate eta, PageView<QueueSwapService.SwapView> swaps, Instant serverNow) {}
}
