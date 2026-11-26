package com.laundry.shared;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class QueueSwapService {
    private final BuildingRepository buildings;
    private final BuildingAccessService access;
    private final QueueEntryRepository queue;
    private final QueueSwapRepository swaps;
    private final SwapLifecycle lifecycle;
    private final AllocationService allocation;
    private final ActivityService activity;
    private final Clock clock;

    public QueueSwapService(BuildingRepository buildings, BuildingAccessService access, QueueEntryRepository queue,
                            QueueSwapRepository swaps, SwapLifecycle lifecycle, AllocationService allocation,
                            ActivityService activity, Clock clock) {
        this.buildings = buildings;
        this.access = access;
        this.queue = queue;
        this.swaps = swaps;
        this.lifecycle = lifecycle;
        this.allocation = allocation;
        this.activity = activity;
        this.clock = clock;
    }

    private void lock(UUID buildingId) {
        buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private ResponseStatusException conflict() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "Lời mời hoặc lượt chờ không còn hợp lệ");
    }

    @Transactional
    public SwapView create(String username, UUID buildingId, UUID recipientEntryId) {
        lock(buildingId);
        Account actor = access.require(username, buildingId, false);
        lifecycle.reconcile(buildingId);
        var sender = queue.findByBuilding_IdAndAccount_IdAndState(buildingId, actor.getId(), QueueEntry.State.WAITING)
            .orElseThrow(this::conflict);
        var recipient = queue.findByBuilding_IdAndStateOrderByPositionAsc(buildingId, QueueEntry.State.WAITING).stream()
            .filter(e -> e.getId().equals(recipientEntryId))
            .findFirst()
            .orElseThrow(this::conflict);
        access.requireAccount(recipient.getAccountId(), buildingId, false);
        if (sender.getAccountId().equals(recipient.getAccountId()) || sender.getPosition() >= recipient.getPosition()) {
            throw conflict();
        }
        if (swaps.findByBuildingIdAndStatus(buildingId, QueueSwapRequest.Status.PENDING).stream()
            .anyMatch(s -> s.getSenderId().equals(actor.getId()))) {
            throw conflict();
        }
        var swap = swaps.save(new QueueSwapRequest(buildingId, sender, recipient, clock.instant()));
        activity.record(buildingId, actor.getId(), "SWAP_CREATED", swap.getId(), null, null, "PENDING");
        return view(swap);
    }

    @Transactional
    public SwapView respond(String username, UUID buildingId, UUID swapId, String action) {
        lock(buildingId);
        Account actor = access.require(username, buildingId, false);
        var swap = swaps.findByIdAndBuildingId(swapId, buildingId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        boolean cancel = action.equals("cancel");
        if (!(cancel ? swap.getSenderId() : swap.getRecipientId()).equals(actor.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (swap.effectiveStatus(clock.instant()) != QueueSwapRequest.Status.PENDING) {
            throw conflict();
        }
        var sender = queue.findById(swap.getSenderEntryId()).orElseThrow(this::conflict);
        var recipient = queue.findById(swap.getRecipientEntryId()).orElseThrow(this::conflict);
        // Recheck both memberships under the same lock, including rejoin/removal cases.
        access.requireAccount(sender.getAccountId(), buildingId, false);
        access.requireAccount(recipient.getAccountId(), buildingId, false);
        if (sender.getState() != QueueEntry.State.WAITING
            || recipient.getState() != QueueEntry.State.WAITING
            || sender.getPosition() >= recipient.getPosition()) {
            throw conflict();
        }
        QueueSwapRequest.Status next = switch (action) {
            case "accept" -> QueueSwapRequest.Status.ACCEPTED;
            case "reject" -> QueueSwapRequest.Status.REJECTED;
            case "cancel" -> QueueSwapRequest.Status.CANCELLED;
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        };
        swap.finish(next);
        if (next == QueueSwapRequest.Status.ACCEPTED) {
            sender.exchangePositionWith(recipient);
            queue.flush();
            lifecycle.reconcile(buildingId);
        }
        activity.record(buildingId, actor.getId(), "SWAP_" + next.name(), swapId, null, "PENDING", next.name());
        if (next == QueueSwapRequest.Status.ACCEPTED) {
            allocation.dispatchLocked(buildingId);
        }
        return view(swap);
    }

    @Transactional(readOnly = true)
    public PageView<SwapView> list(String username, UUID buildingId, int page, int size) {
        Account actor = access.require(username, buildingId, false);
        PageView.validate(page, size);
        return PageView.from(
            swaps.related(buildingId, actor.getId(), PageRequest.of(page, size, Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")))),
            this::view
        );
    }

    @Transactional(readOnly = true)
    public PageView<SwapView> pending(String username, UUID buildingId, int page, int size) {
        Account actor = access.require(username, buildingId, false);
        PageView.validate(page, size);
        return PageView.from(
            swaps.pendingRelated(
                buildingId,
                actor.getId(),
                QueueSwapRequest.Status.PENDING,
                clock.instant(),
                PageRequest.of(page, size, Sort.by(Sort.Order.asc("createdAt"), Sort.Order.asc("id")))
            ),
            this::view
        );
    }

    @Transactional(readOnly = true)
    public List<SwapView> outgoing(String username, UUID buildingId) {
        Account actor = access.require(username, buildingId, false);
        return swaps.findByBuildingIdAndSenderIdAndStatusAndExpiresAtGreaterThan(
                buildingId, actor.getId(), QueueSwapRequest.Status.PENDING, clock.instant()
            )
            .stream()
            .map(this::view)
            .toList();
    }

    private SwapView view(QueueSwapRequest swap) {
        return new SwapView(
            swap.getId(),
            swap.getSenderId(),
            swap.getRecipientId(),
            swap.getSenderEntryId(),
            swap.getRecipientEntryId(),
            swap.getCreatedAt(),
            swap.getExpiresAt(),
            swap.effectiveStatus(clock.instant()),
            clock.instant()
        );
    }

    @Scheduled(fixedDelay = 15000)
    @Transactional
    public void expire() {
        for (UUID buildingId : swaps.expiredBuildings(QueueSwapRequest.Status.PENDING, clock.instant())) {
            lock(buildingId);
            lifecycle.reconcile(buildingId);
        }
    }

    public record SwapView(UUID id, UUID senderId, UUID recipientId, UUID senderEntryId, UUID recipientEntryId,
                           Instant createdAt, Instant expiresAt, QueueSwapRequest.Status status, Instant serverNow) {}
}
