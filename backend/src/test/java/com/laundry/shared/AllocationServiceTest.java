package com.laundry.shared;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:allocation-tests;DB_CLOSE_DELAY=-1")
class AllocationServiceTest {
    @Autowired LaundryService laundry;
    @Autowired AllocationService allocation;
    @Autowired AccountRepository accounts;
    @Autowired MembershipRepository memberships;
    @Autowired AdjustableClock clock;
    @Autowired MachineHoldRepository holds;
    // Invoke a fresh job explicitly in tests; a background scheduler must not race the test clock.
    @MockitoBean HoldExpiryJob scheduledJob;

    @BeforeEach void resetClock() {
        clock.set(Instant.parse("2026-11-18T00:00:00Z"));
    }

    @TestConfiguration
    static class ClockConfig {
        @Bean @Primary AdjustableClock allocationTestClock() { return new AdjustableClock(); }
    }
    static class AdjustableClock extends Clock {
        private volatile Instant instant = Instant.parse("2026-11-18T00:00:00Z");
        void set(Instant value) { instant = value; }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return instant; }
    }

    private Account account(String prefix) {
        return accounts.save(new Account(prefix + UUID.randomUUID(), "hash", prefix));
    }
    private Account resident(Building building, String prefix) {
        Account user = account(prefix);
        memberships.save(new Membership(building, user, Membership.Role.RESIDENT, Membership.Status.APPROVED));
        return user;
    }

    @Test void onlyVerifiedMachinesAreAssignedAndUnreadyResidentsKeepPosition() {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa thử cấp máy", 2);
        Account a = resident(building, "a");
        Account b = resident(building, "b");
        Account c = resident(building, "c");
        laundry.join(a.getUsername(), building.getId(), true);
        laundry.join(b.getUsername(), building.getId(), false);
        laundry.join(c.getUsername(), building.getId(), true);
        assertTrue(allocation.activeHolds(owner.getUsername(), building.getId()).isEmpty());
        List<LaundryService.MachineView> machineList = laundry.view(owner.getUsername(), building.getId()).machines();
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineList.get(0).id());
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineList.get(1).id());
        var holds = allocation.activeHolds(owner.getUsername(), building.getId());
        assertEquals(2, holds.size());
        assertEquals(java.util.Set.of(a.getId(), c.getId()),
            holds.stream().map(AllocationService.HoldView::accountId).collect(java.util.stream.Collectors.toSet()));
        assertEquals(b.getId(), laundry.view(owner.getUsername(), building.getId()).queue().getFirst().accountId());
        assertThrows(ResponseStatusException.class, () -> laundry.setReady(a.getUsername(), building.getId(), false));
    }

    @Test void startNeedsPhysicalCheckAndCannotBeRepeated() {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa kiểm tra", 1);
        Account resident = resident(building, "resident");
        laundry.join(resident.getUsername(), building.getId(), true);
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        UUID holdId = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst().id();
        assertThrows(ResponseStatusException.class, () -> allocation.start(resident.getUsername(), building.getId(), holdId));
        allocation.confirmPhysicalCheck(resident.getUsername(), building.getId(), holdId);
        allocation.start(resident.getUsername(), building.getId(), holdId);
        assertThrows(ResponseStatusException.class, () -> allocation.start(resident.getUsername(), building.getId(), holdId));
        assertEquals(Machine.Status.RUNNING, laundry.view(owner.getUsername(), building.getId()).machines().getFirst().status());
        assertTrue(allocation.activeHolds(owner.getUsername(), building.getId()).isEmpty());
        assertThrows(ResponseStatusException.class, () -> laundry.join(resident.getUsername(), building.getId(), true));
        var maintenanceError = assertThrows(ResponseStatusException.class,
            () -> laundry.setMaintenance(owner.getUsername(), building.getId(), machineId, false));
        assertEquals(HttpStatus.CONFLICT, maintenanceError.getStatusCode());
        var freeError = assertThrows(ResponseStatusException.class,
            () -> laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId));
        assertEquals(HttpStatus.CONFLICT, freeError.getStatusCode());
        assertEquals(Machine.Status.RUNNING, laundry.view(owner.getUsername(), building.getId()).machines().getFirst().status());
    }

    @Test void exactEightMinuteBoundaryExpiresAndDispatchesOnlyReadySuccessor() {
        clock.set(Instant.parse("2026-11-18T02:00:00Z"));
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa hết hạn", 1);
        Account a = resident(building, "a");
        Account b = resident(building, "b");
        Account c = resident(building, "c");
        laundry.join(a.getUsername(), building.getId(), true);
        laundry.join(b.getUsername(), building.getId(), false);
        laundry.join(c.getUsername(), building.getId(), true);
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        var first = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        assertEquals(clock.instant().plusSeconds(480), first.expiresAt());
        clock.set(first.expiresAt().minusNanos(1));
        allocation.confirmPhysicalCheck(a.getUsername(), building.getId(), first.id());
        allocation.expire(building.getId());
        assertEquals(first.id(), allocation.activeHolds(owner.getUsername(), building.getId()).getFirst().id());
        clock.set(first.expiresAt());
        allocation.expire(building.getId());
        var replacement = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        assertEquals(c.getId(), replacement.accountId());
        assertEquals(first.expiresAt().plusSeconds(480), replacement.expiresAt());
        assertThrows(ResponseStatusException.class, () -> allocation.confirmPhysicalCheck(a.getUsername(), building.getId(), first.id()));
        assertThrows(ResponseStatusException.class, () -> allocation.start(a.getUsername(), building.getId(), first.id()));
        assertThrows(ResponseStatusException.class, () -> allocation.reportUnusable(a.getUsername(), building.getId(), first.id()));
        allocation.expire(building.getId());
        assertEquals(replacement.id(), allocation.activeHolds(owner.getUsername(), building.getId()).getFirst().id());
        assertEquals(b.getId(), laundry.view(owner.getUsername(), building.getId()).queue().getFirst().accountId());
    }

    @Test void maintenanceCannotInvalidateAnActiveHoldAndReopeningNeedsVerification() {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa bảo trì", 1);
        Account a = resident(building, "a");
        laundry.join(a.getUsername(), building.getId(), true);
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        laundry.setMaintenance(owner.getUsername(), building.getId(), machineId, true);
        var error = assertThrows(ResponseStatusException.class,
            () -> laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId));
        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        laundry.setMaintenance(owner.getUsername(), building.getId(), machineId, false);
        assertTrue(allocation.activeHolds(owner.getUsername(), building.getId()).isEmpty());
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        var hold = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        for (boolean maintenance : new boolean[] { false, true }) {
            var conflict = assertThrows(ResponseStatusException.class,
                () -> laundry.setMaintenance(owner.getUsername(), building.getId(), machineId, maintenance));
            assertEquals(HttpStatus.CONFLICT, conflict.getStatusCode());
        }
        assertEquals(hold.id(), allocation.activeHolds(owner.getUsername(), building.getId()).getFirst().id());
    }

    @Test void startingJustBeforeDeadlineIsNotUndoneByExpiryJob() {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa bắt đầu sát hạn", 1);
        Account a = resident(building, "a");
        Account b = resident(building, "b");
        laundry.join(a.getUsername(), building.getId(), true);
        laundry.join(b.getUsername(), building.getId(), true);
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        var hold = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        allocation.confirmPhysicalCheck(a.getUsername(), building.getId(), hold.id());
        clock.set(hold.expiresAt().minusNanos(1));
        allocation.start(a.getUsername(), building.getId(), hold.id());
        clock.set(hold.expiresAt());
        new HoldExpiryJob(holds, allocation, clock).expireHolds();
        assertTrue(allocation.activeHolds(owner.getUsername(), building.getId()).isEmpty());
        assertEquals(Machine.Status.RUNNING, laundry.view(owner.getUsername(), building.getId()).machines().getFirst().status());
        assertEquals(b.getId(), laundry.view(owner.getUsername(), building.getId()).queue().getFirst().accountId());
        assertThrows(ResponseStatusException.class, () -> laundry.join(a.getUsername(), building.getId(), true));
    }

    @Test void idleMachineWaitsUntilSomeoneIsReady() {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa chờ sẵn sàng", 1);
        Account a = resident(building, "a");
        Account b = resident(building, "b");
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        laundry.join(a.getUsername(), building.getId(), false);
        laundry.join(b.getUsername(), building.getId(), false);
        assertTrue(allocation.activeHolds(owner.getUsername(), building.getId()).isEmpty());
        laundry.setReady(b.getUsername(), building.getId(), true);
        var assigned = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        assertEquals(b.getId(), assigned.accountId());
        laundry.setReady(a.getUsername(), building.getId(), true);
        assertEquals(assigned.id(), allocation.activeHolds(owner.getUsername(), building.getId()).getFirst().id());
        assertEquals(a.getId(), laundry.view(owner.getUsername(), building.getId()).queue().getFirst().accountId());
    }

    @Test void repeatedExpiryJobDispatchesOnceAndStartsNewDeadlineAtActualDispatch() {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa job", 1);
        Account a = resident(building, "a");
        Account b = resident(building, "b");
        laundry.join(a.getUsername(), building.getId(), true);
        laundry.join(b.getUsername(), building.getId(), true);
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        var first = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        clock.set(first.expiresAt().plusSeconds(90));
        var job = new HoldExpiryJob(holds, allocation, clock);
        job.expireHolds();
        var replacement = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        assertEquals(b.getId(), replacement.accountId());
        assertEquals(clock.instant().plusSeconds(480), replacement.expiresAt());
        job.expireHolds();
        assertEquals(replacement.id(), allocation.activeHolds(owner.getUsername(), building.getId()).getFirst().id());
    }

    @Test void concurrentJoinsCannotAssignSameMachineTwice() throws Exception {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa vào đồng thời", 1);
        Account a = resident(building, "a");
        Account b = resident(building, "b");
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        simultaneously(
            () -> laundry.join(a.getUsername(), building.getId(), true),
            () -> laundry.join(b.getUsername(), building.getId(), true));
        var active = allocation.activeHolds(owner.getUsername(), building.getId());
        var waiting = laundry.view(owner.getUsername(), building.getId()).queue();
        assertEquals(1, active.size());
        assertEquals(1, waiting.size());
        assertNotEquals(active.getFirst().accountId(), waiting.getFirst().accountId());
        assertEquals(machineId, active.getFirst().machineId());
    }

    @Test void concurrentDispatchCannotAssignOneRequestToTwoMachines() throws Exception {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa hai máy", 2);
        Account a = resident(building, "a");
        laundry.join(a.getUsername(), building.getId(), true);
        var machines = laundry.view(owner.getUsername(), building.getId()).machines();
        simultaneously(
            () -> laundry.confirmMachineFree(owner.getUsername(), building.getId(), machines.get(0).id()),
            () -> laundry.confirmMachineFree(owner.getUsername(), building.getId(), machines.get(1).id()));
        var active = allocation.activeHolds(owner.getUsername(), building.getId());
        assertEquals(1, active.size());
        assertEquals(a.getId(), active.getFirst().accountId());
        assertTrue(laundry.view(owner.getUsername(), building.getId()).queue().isEmpty());
    }

    @Test void startAndExpiryAtDeadlineCannotResurrectOldHold() throws Exception {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa đua hết hạn", 1);
        Account a = resident(building, "a");
        Account b = resident(building, "b");
        laundry.join(a.getUsername(), building.getId(), true);
        laundry.join(b.getUsername(), building.getId(), true);
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        var first = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        allocation.confirmPhysicalCheck(a.getUsername(), building.getId(), first.id());
        clock.set(first.expiresAt());
        simultaneously(
            () -> {
                var error = assertThrows(ResponseStatusException.class,
                    () -> allocation.start(a.getUsername(), building.getId(), first.id()));
                assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
            },
            () -> allocation.expire(building.getId()));
        var active = allocation.activeHolds(owner.getUsername(), building.getId());
        assertEquals(1, active.size());
        assertEquals(b.getId(), active.getFirst().accountId());
        assertEquals(Machine.Status.AVAILABLE, laundry.view(owner.getUsername(), building.getId()).machines().getFirst().status());
    }

    @Test void concurrentRepeatedYieldCreatesOnlyOneReplacement() throws Exception {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa nhường lặp", 1);
        Account a = resident(building, "a");
        Account b = resident(building, "b");
        laundry.join(a.getUsername(), building.getId(), true);
        laundry.join(b.getUsername(), building.getId(), true);
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        var first = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        AtomicInteger successes = new AtomicInteger();
        Runnable yield = () -> {
            try {
                allocation.yield(a.getUsername(), building.getId(), first.id());
                successes.incrementAndGet();
            } catch (ResponseStatusException error) {
                assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
            }
        };
        simultaneously(yield, yield);
        assertEquals(1, successes.get());
        var active = allocation.activeHolds(owner.getUsername(), building.getId());
        assertEquals(1, active.size());
        assertEquals(b.getId(), active.getFirst().accountId());
        laundry.join(a.getUsername(), building.getId(), true);
        assertEquals(a.getId(), laundry.view(owner.getUsername(), building.getId()).queue().getFirst().accountId());
    }

    private void simultaneously(Runnable first, Runnable second) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var left = workers.submit(() -> { start.await(); first.run(); return null; });
            var right = workers.submit(() -> { start.await(); second.run(); return null; });
            start.countDown();
            left.get(10, TimeUnit.SECONDS);
            right.get(10, TimeUnit.SECONDS);
        }
    }

    @Test void yieldingSkipsUnreadyAndFailureRestoresOriginalRank() {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa thử lỗi máy", 1);
        Account a = resident(building, "a");
        Account b = resident(building, "b");
        Account c = resident(building, "c");
        laundry.join(a.getUsername(), building.getId(), true);
        laundry.join(b.getUsername(), building.getId(), false);
        laundry.join(c.getUsername(), building.getId(), true);
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        var holdA = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        allocation.yield(a.getUsername(), building.getId(), holdA.id());
        var holdC = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        assertEquals(c.getId(), holdC.accountId());
        assertThrows(ResponseStatusException.class, () -> allocation.yield(a.getUsername(), building.getId(), holdA.id()));
        allocation.reportUnusable(c.getUsername(), building.getId(), holdC.id());
        var waiting = laundry.view(owner.getUsername(), building.getId()).queue();
        assertEquals(b.getId(), waiting.get(0).accountId());
        assertEquals(c.getId(), waiting.get(1).accountId());
        assertTrue(allocation.activeHolds(owner.getUsername(), building.getId()).isEmpty());
        assertEquals(Machine.Status.NEEDS_CHECK, laundry.view(owner.getUsername(), building.getId()).machines().getFirst().status());
    }
}
