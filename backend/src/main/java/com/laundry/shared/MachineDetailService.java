package com.laundry.shared;

import java.time.Clock;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MachineDetailService {
    private final BuildingRepository buildings;
    private final BuildingAccessService access;
    private final LaundryService laundry;
    private final AllocationService allocation;
    private final WashService wash;
    private final Clock clock;

    public MachineDetailService(BuildingRepository buildings, BuildingAccessService access, LaundryService laundry,
                                AllocationService allocation, WashService wash, Clock clock) {
        this.buildings = buildings;
        this.access = access;
        this.laundry = laundry;
        this.allocation = allocation;
        this.wash = wash;
        this.clock = clock;
    }

    public record Detail(UUID id, String label, Machine.Status status, AllocationService.HoldView ownHold,
                         List<WashService.CycleView> ownCycles, WashService.CycleView previousCycle, Instant serverNow) {}

    @Transactional
    public Detail get(String username, UUID buildingId, UUID machineId) {
        buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Account actor = access.require(username, buildingId, false);
        var machine = laundry.view(username, buildingId).machines().stream()
            .filter(m -> m.id().equals(machineId))
            .findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var hold = allocation.activeHolds(username, buildingId).stream()
            .filter(h -> h.accountId().equals(actor.getId()) && h.machineId().equals(machineId))
            .findFirst()
            .orElse(null);
        var own = wash.mine(username, buildingId).stream()
            .filter(c -> c.machineId().equals(machineId))
            .toList();
        return new Detail(
            machine.id(),
            machine.label(),
            machine.status(),
            hold,
            own,
            hold == null ? null : wash.handover(username, buildingId, hold.id()),
            clock.instant()
        );
    }
}
