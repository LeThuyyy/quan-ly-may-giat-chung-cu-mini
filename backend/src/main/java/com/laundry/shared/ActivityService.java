package com.laundry.shared;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Service
public class ActivityService {
    private final ActivityRepository events;
    private final BuildingAccessService access;
    private final Clock clock;
    public ActivityService(ActivityRepository events, BuildingAccessService access, Clock clock) {
        this.events=events; this.access=access; this.clock=clock;
    }
    /** No credentials, tokens or free-form user/chat content may enter these state fields. */
    @Transactional(propagation=Propagation.MANDATORY)
    public void record(UUID buildingId, UUID actor, String action, UUID target, UUID machine,
                       String beforeState, String afterState) {
        if (!action.matches("[A-Z_]{1,60}") || !safeState(beforeState) || !safeState(afterState))
            throw new IllegalArgumentException("Audit fields must be allowlisted state identifiers");
        events.save(new ActivityEvent(buildingId, actor, action, target, machine, beforeState, afterState, clock.instant()));
    }
    private boolean safeState(String value) { return value==null || value.matches("[A-Z0-9_:,. -]{0,80}"); }
    @Transactional(readOnly=true)
    public PageView<EventView> list(String username, UUID buildingId, int page, int size, String type, UUID machineId) {
        access.require(username,buildingId,true); PageView.validate(page,size);
        if (type!=null && !type.matches("[A-Z_]{1,60}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Loại sự kiện không hợp lệ");
        Instant cutoff = clock.instant().minus(Duration.ofDays(90));
        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Order.desc("occurredAt"), Sort.Order.desc("id")));
        var result = (type != null && machineId != null)
            ? events.findByBuildingIdAndOccurredAtGreaterThanAndActionAndMachineId(buildingId, cutoff, type, machineId, pageable)
            : (type != null)
                ? events.findByBuildingIdAndOccurredAtGreaterThanAndAction(buildingId, cutoff, type, pageable)
                : (machineId != null)
                    ? events.findByBuildingIdAndOccurredAtGreaterThanAndMachineId(buildingId, cutoff, machineId, pageable)
                    : events.findByBuildingIdAndOccurredAtGreaterThan(buildingId, cutoff, pageable);
        return PageView.from(result,
            e->new EventView(e.getId(),e.getActorId(),e.getAction(),e.getTargetId(),e.getMachineId(),e.getBeforeState(),e.getAfterState(),e.getOccurredAt()));
    }
    @Scheduled(fixedDelay=3600000)
    @Transactional
    public void cleanup() {
        var expired=events.findByOccurredAtLessThanEqual(clock.instant().minus(Duration.ofDays(90)),PageRequest.of(0,500));
        events.deleteAllInBatch(expired.getContent());
    }
    public record EventView(UUID id, UUID actorId, String action, UUID targetId, UUID machineId,
                            String beforeState, String afterState, Instant occurredAt) {}
}
