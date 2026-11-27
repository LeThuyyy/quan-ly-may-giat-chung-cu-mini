package com.laundry.shared;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Read-only facts, not a fabricated notification history. Used within the snapshot lock. */
@Service
public class SnapshotNotificationService {
    private final BuildingAccessService access;
    private final MachineHoldRepository holds;
    private final QueueSwapRepository swaps;
    private final Clock clock;
    public SnapshotNotificationService(BuildingAccessService access,MachineHoldRepository holds,QueueSwapRepository swaps,Clock clock){
        this.access=access;this.holds=holds;this.swaps=swaps;this.clock=clock;
    }
    @Transactional(readOnly=true)
    public Facts get(String username,UUID buildingId){
        Account actor=access.require(username,buildingId,false);
        var incoming=swaps.incoming(buildingId,actor.getId(),QueueSwapRequest.Status.PENDING,clock.instant(),
            PageRequest.of(0,50,Sort.by(Sort.Order.desc("createdAt"),Sort.Order.desc("id"))));
        var responses=swaps.findByBuildingIdAndSenderIdAndStatusIn(buildingId,actor.getId(),
            List.of(QueueSwapRequest.Status.ACCEPTED,QueueSwapRequest.Status.REJECTED),
            PageRequest.of(0,20,Sort.by(Sort.Order.desc("createdAt"),Sort.Order.desc("id"))));
        var latest=holds.findFirstByMachine_Building_IdAndQueueEntry_Account_IdOrderByAssignedAtDescIdDesc(buildingId,actor.getId())
            .map(h->new HoldFact(h.getId(),h.getStatus(),h.getExpiresAt())).orElse(null);
        return new Facts(incoming.getContent().stream().map(s->new SwapFact(s.getId(),s.getStatus())).toList(),
            responses.getContent().stream().map(s->new SwapFact(s.getId(),s.getStatus())).toList(),latest);
    }
    public record SwapFact(UUID id,QueueSwapRequest.Status status){}
    public record HoldFact(UUID id,MachineHold.Status status,Instant expiresAt){}
    public record Facts(List<SwapFact> incomingSwaps,List<SwapFact> outgoingResponses,HoldFact latestHold){}
}
