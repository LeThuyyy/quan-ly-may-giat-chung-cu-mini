package com.laundry.shared;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import java.time.Clock;
import java.util.UUID;

/** No orchestration service dependency: callers already own the building transaction/lock. */
@Service
public class SwapLifecycle {
    private final QueueSwapRepository swaps;
    private final QueueEntryRepository queue;
    private final ActivityService activity;
    private final Clock clock;
    public SwapLifecycle(QueueSwapRepository swaps,QueueEntryRepository queue,ActivityService activity,Clock clock){
        this.swaps=swaps;this.queue=queue;this.activity=activity;this.clock=clock;
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public void invalidateEntry(UUID buildingId,UUID entryId){
        for(var swap:swaps.findByBuildingIdAndStatus(buildingId,QueueSwapRequest.Status.PENDING)){
            if(swap.getSenderEntryId().equals(entryId)||swap.getRecipientEntryId().equals(entryId))
                close(swap,swap.effectiveStatus(clock.instant())==QueueSwapRequest.Status.EXPIRED?QueueSwapRequest.Status.EXPIRED:QueueSwapRequest.Status.INVALIDATED);
        }
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public void reconcile(UUID buildingId){
        for(var swap:swaps.findByBuildingIdAndStatus(buildingId,QueueSwapRequest.Status.PENDING)){
            if(swap.effectiveStatus(clock.instant())==QueueSwapRequest.Status.EXPIRED){close(swap,QueueSwapRequest.Status.EXPIRED);continue;}
            var sender=queue.findById(swap.getSenderEntryId()).orElse(null);
            var recipient=queue.findById(swap.getRecipientEntryId()).orElse(null);
            if(sender==null||recipient==null||sender.getState()!=QueueEntry.State.WAITING||recipient.getState()!=QueueEntry.State.WAITING||sender.getPosition()>=recipient.getPosition())
                close(swap,QueueSwapRequest.Status.INVALIDATED);
        }
    }
    private void close(QueueSwapRequest swap,QueueSwapRequest.Status status){
        swap.finish(status);
        activity.record(swap.getBuildingId(),null,"SWAP_"+status.name(),swap.getId(),null,"PENDING",status.name());
    }
}
