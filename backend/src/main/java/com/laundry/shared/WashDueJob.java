package com.laundry.shared;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.Clock;
import java.util.HashSet;
import java.util.UUID;

/** Poll due times; never confirms the physical condition of a machine. */
@Component
public class WashDueJob {
    private final WashCycleRepository cycles;
    private final AllocationService allocation;
    private final Clock clock;
    public WashDueJob(WashCycleRepository cycles, AllocationService allocation, Clock clock) {
        this.cycles = cycles; this.allocation = allocation; this.clock = clock;
    }
    @Scheduled(fixedDelay = 15000)
    public void dispatchDueInspections() {
        var ids = new HashSet<UUID>();
        for (WashCycle cycle : cycles.findByCompletedAtIsNull()) {
            if (cycle.inspectionEligible(clock.instant())) ids.add(cycle.getBuildingId());
        }
        for (UUID id : ids) allocation.dispatch(id);
    }
}
