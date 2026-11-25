package com.laundry.shared;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:wash-flow-tests;DB_CLOSE_DELAY=-1")
class WashFlowTest {
    @Autowired LaundryService laundry;
    @Autowired AllocationService allocation;
    @Autowired WashService wash;
    @Autowired QueueStatusService statuses;
    @Autowired WashCycleRepository cycles;
    @Autowired QueueEntryRepository queue;
    @Autowired AccountRepository accounts;
    @Autowired MembershipRepository memberships;
    @Autowired AdjustableClock clock;
    @MockitoBean HoldExpiryJob holdJob;
    @MockitoBean WashDueJob dueJob;

    @TestConfiguration
    static class ClockConfig {
        @Bean @Primary AdjustableClock washClock() { return new AdjustableClock(); }
    }
    static class AdjustableClock extends Clock {
        private volatile Instant now = Instant.parse("2026-11-23T10:00:00Z");
        void at(Instant value) { now = value; }
        void plusSeconds(long seconds) { now = now.plusSeconds(seconds); }
        @Override public Instant instant() { return now; }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
    }
    @BeforeEach void reset() { clock.at(Instant.parse("2026-11-23T10:00:00Z")); }
    private Account newAccount() { return accounts.save(new Account("wash-" + UUID.randomUUID(), "hash", "Test user")); }
    private Account resident(Building building) {
        Account a = newAccount();
        memberships.save(new Membership(building, a, Membership.Role.RESIDENT, Membership.Status.APPROVED));
        return a;
    }
    private record Fixture(Building building, Account manager, Account first, Account next, UUID machine) {}
    private Fixture fixture() {
        Account manager = newAccount();
        Building building = laundry.createBuilding(manager.getUsername(), "Tòa giặt", 1);
        Account first = resident(building), next = resident(building);
        UUID machine = laundry.view(manager.getUsername(), building.getId()).machines().getFirst().id();
        laundry.join(first.getUsername(), building.getId(), true);
        laundry.join(next.getUsername(), building.getId(), true);
        laundry.confirmMachineFree(manager.getUsername(), building.getId(), machine);
        return new Fixture(building, manager, first, next, machine);
    }
    private WashCycle start(Fixture f, WashCycle.HandoverMode mode) {
        var hold = allocation.activeHolds(f.manager.getUsername(), f.building.getId()).getFirst();
        allocation.confirmPhysicalCheck(f.first.getUsername(), f.building.getId(), hold.id());
        return allocation.start(f.first.getUsername(), f.building.getId(), hold.id(), 30, mode);
    }

    @Test void singleStartIdempotentAndOwnerStillWashingUntilPickup() {
        var f = fixture();
        var hold = allocation.activeHolds(f.first.getUsername(), f.building.getId()).getFirst();
        assertThrows(ResponseStatusException.class, () -> allocation.start(f.first.getUsername(), f.building.getId(), hold.id(), 30, WashCycle.HandoverMode.ALLOW_TRANSFER));
        allocation.confirmPhysicalCheck(f.first.getUsername(), f.building.getId(), hold.id());
        var c = allocation.start(f.first.getUsername(), f.building.getId(), hold.id(), 30, WashCycle.HandoverMode.ALLOW_TRANSFER);
        assertEquals(c.getId(), allocation.start(f.first.getUsername(), f.building.getId(), hold.id(), 30, WashCycle.HandoverMode.ALLOW_TRANSFER).getId());
        assertThrows(ResponseStatusException.class, () -> allocation.start(f.first.getUsername(), f.building.getId(), hold.id(), 31, WashCycle.HandoverMode.ALLOW_TRANSFER));
        assertEquals(QueueStatusService.State.WASHING, statuses.current(f.first.getUsername(), f.building.getId()).state());
        assertEquals(1, cycles.findByMachine_Building_IdAndCompletedAtIsNull(f.building.getId()).size());
        clock.plusSeconds(60);
        assertEquals(c.getId(), wash.pickup(f.first.getUsername(), f.building.getId(), c.getId(), true).id());
        assertEquals(QueueEntry.State.COMPLETED, queue.findById(c.getQueueEntryId()).orElseThrow().getState());
        assertEquals(QueueStatusService.State.NONE, statuses.current(f.first.getUsername(), f.building.getId()).state());
        assertEquals(QueueStatusService.State.HELD, statuses.current(f.next.getUsername(), f.building.getId()).state());
        assertEquals(WashCycle.Completion.OWNER_PICKUP, wash.pickup(f.first.getUsername(), f.building.getId(), c.getId(), true).completion());
    }

    @Test void selfPickupBoundaryIsTenMinutesAfterEstimatedEndNotScheduledJobTime() {
        var f = fixture();
        var old = start(f, WashCycle.HandoverMode.SELF_PICKUP);
        clock.at(old.getEstimatedEndAt());
        assertTrue(allocation.dispatch(f.building.getId()).isEmpty());
        assertEquals("SELF_PICKUP", wash.view(old).phase());
        clock.plusSeconds(599);
        assertTrue(allocation.dispatch(f.building.getId()).isEmpty());
        clock.plusSeconds(1);
        assertEquals("INSPECTION_ELIGIBLE", wash.view(old).phase());
        assertEquals(1, allocation.dispatch(f.building.getId()).size());
        assertEquals(QueueStatusService.State.WASHING, statuses.current(f.first.getUsername(), f.building.getId()).state());
    }

    @Test void inspectionHoldOverlapsOldClothesUntilPhysicalTransferThenAllowsNewStart() {
        var f = fixture();
        var old = start(f, WashCycle.HandoverMode.ALLOW_TRANSFER);
        clock.at(old.getEstimatedEndAt());
        var hold = allocation.dispatch(f.building.getId()).getFirst();
        assertEquals(f.next.getId(), hold.accountId());
        assertThrows(ResponseStatusException.class, () -> allocation.confirmPhysicalCheck(f.next.getUsername(), f.building.getId(), hold.id()));
        assertThrows(ResponseStatusException.class, () -> allocation.start(f.next.getUsername(), f.building.getId(), hold.id(), 40, WashCycle.HandoverMode.SELF_PICKUP));
        assertThrows(ResponseStatusException.class, () -> wash.transfer(f.first.getUsername(), f.building.getId(), old.getId(), hold.id(), true));
        var transferred = wash.transfer(f.next.getUsername(), f.building.getId(), old.getId(), hold.id(), true);
        assertEquals(WashCycle.Completion.TRANSFERRED, transferred.completion());
        assertEquals(WashCycle.Completion.TRANSFERRED, wash.transfer(f.next.getUsername(), f.building.getId(), old.getId(), hold.id(), true).completion());
        allocation.confirmPhysicalCheck(f.next.getUsername(), f.building.getId(), hold.id());
        var next = allocation.start(f.next.getUsername(), f.building.getId(), hold.id(), 40, WashCycle.HandoverMode.SELF_PICKUP);
        assertNotEquals(old.getId(), next.getId());
        assertEquals(QueueStatusService.State.NONE, statuses.current(f.first.getUsername(), f.building.getId()).state());
        assertEquals(QueueStatusService.State.WASHING, statuses.current(f.next.getUsername(), f.building.getId()).state());
        assertEquals(1, cycles.findByMachine_Building_IdAndCompletedAtIsNull(f.building.getId()).size());
        assertThrows(ResponseStatusException.class, () -> laundry.confirmMachineFree(f.manager.getUsername(), f.building.getId(), f.machine));
    }

    @Test void firstOverrunRestoresQueueAndDelaysNextHoldSecondEscalatesManager() {
        var f = fixture();
        var old = start(f, WashCycle.HandoverMode.ALLOW_TRANSFER);
        clock.at(old.getEstimatedEndAt());
        var firstHold = allocation.dispatch(f.building.getId()).getFirst();
        var shifted = wash.reportStillRunning(f.next.getUsername(), f.building.getId(), firstHold.id(), 12);
        assertEquals(1, shifted.overrunReports());
        assertEquals(clock.instant().plusSeconds(720), shifted.estimatedEndAt());
        assertEquals(QueueStatusService.State.WAITING, statuses.current(f.next.getUsername(), f.building.getId()).state());
        assertTrue(allocation.dispatch(f.building.getId()).isEmpty());
        clock.plusSeconds(720);
        var secondHold = allocation.dispatch(f.building.getId()).getFirst();
        var second = wash.reportStillRunning(f.next.getUsername(), f.building.getId(), secondHold.id(), 4);
        assertEquals(WashCycle.State.NEEDS_MANAGER, second.state());
        assertEquals(2, second.overrunReports());
        assertTrue(allocation.dispatch(f.building.getId()).isEmpty());
        assertThrows(ResponseStatusException.class, () -> laundry.confirmMachineFree(f.manager.getUsername(), f.building.getId(), f.machine));
        assertEquals(1, wash.managerIssues(f.manager.getUsername(), f.building.getId()).size());
        assertThrows(ResponseStatusException.class, () -> wash.resolve(f.next.getUsername(), f.building.getId(), old.getId(), "CLEARED", null, true));
        assertThrows(ResponseStatusException.class, () -> wash.resolve(f.manager.getUsername(), f.building.getId(), old.getId(), "CLEARED", null, false));
        wash.resolve(f.manager.getUsername(), f.building.getId(), old.getId(), "CLEARED", null, true);
        assertEquals(QueueStatusService.State.NONE, statuses.current(f.first.getUsername(), f.building.getId()).state());
        assertEquals(QueueStatusService.State.HELD, statuses.current(f.next.getUsername(), f.building.getId()).state());
    }

    @Test void unknownRemainingRequiresManagerAndCannotBeBypassed() {
        var f = fixture();
        var old = start(f, WashCycle.HandoverMode.ALLOW_TRANSFER);
        clock.at(old.getEstimatedEndAt());
        var hold = allocation.dispatch(f.building.getId()).getFirst();
        assertEquals(WashCycle.State.NEEDS_MANAGER, wash.reportStillRunning(f.next.getUsername(), f.building.getId(), hold.id(), null).state());
        assertThrows(ResponseStatusException.class, () -> wash.pickup(f.first.getUsername(), f.building.getId(), old.getId(), true));
        var deferred = wash.resolve(f.manager.getUsername(), f.building.getId(), old.getId(), "DEFER", 6, false);
        assertEquals(clock.instant().plusSeconds(360), deferred.estimatedEndAt());
        assertEquals(1, deferred.overrunReports());
        assertEquals(WashCycle.State.ACTIVE, deferred.state());
        clock.plusSeconds(360);
        var nextHold = allocation.dispatch(f.building.getId()).getFirst();
        assertEquals(WashCycle.State.NEEDS_MANAGER, wash.reportStillRunning(f.next.getUsername(), f.building.getId(), nextHold.id(), 3).state());
    }

    @Test void ownerCanUpdateOneTimeOnlyBeforeInspectionHoldAndKeepsOldRequest() {
        var f = fixture();
        var old = start(f, WashCycle.HandoverMode.ALLOW_TRANSFER);
        clock.plusSeconds(120);
        var newEta = wash.ownerRemaining(f.first.getUsername(), f.building.getId(), old.getId(), 8);
        assertEquals(clock.instant().plusSeconds(480), newEta.estimatedEndAt());
        assertEquals(QueueStatusService.State.WASHING, statuses.current(f.first.getUsername(), f.building.getId()).state());
        assertTrue(allocation.dispatch(f.building.getId()).isEmpty());
        clock.at(newEta.estimatedEndAt());
        var hold = allocation.dispatch(f.building.getId()).getFirst();
        assertThrows(ResponseStatusException.class, () -> wash.ownerRemaining(f.first.getUsername(), f.building.getId(), old.getId(), 7));
        assertEquals(QueueStatusService.State.HELD, statuses.current(f.next.getUsername(), f.building.getId()).state());
        assertEquals(old.getId(), wash.handover(f.next.getUsername(), f.building.getId(), hold.id()).id());
    }

}
