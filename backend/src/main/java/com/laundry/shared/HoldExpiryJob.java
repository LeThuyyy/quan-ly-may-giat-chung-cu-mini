package com.laundry.shared;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.Clock;
import java.util.UUID;

@Component
public class HoldExpiryJob {
    private final MachineHoldRepository holds;
    private final AllocationService allocation;
    private final Clock clock;
    public HoldExpiryJob(MachineHoldRepository holds, AllocationService allocation, Clock clock) {
        this.holds = holds; this.allocation = allocation; this.clock = clock;
    }
    @Scheduled(fixedDelay = 15_000)
    public void expireHolds() {
        // Select IDs directly: entity relations are lazy and this job has no open persistence context.
        for (UUID id : holds.findExpiredBuildingIds(MachineHold.Status.ACTIVE, clock.instant())) {
            allocation.expire(id);
        }
    }
}
