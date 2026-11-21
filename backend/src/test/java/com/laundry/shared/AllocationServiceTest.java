package com.laundry.shared;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
    @Autowired QueueEntryRepository queue;
    @Autowired QueueStatusService statuses;
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

    @RepeatedTest(3)
    void sameAccountJoiningConcurrentlyCreatesOnlyOneActiveRequest() throws Exception {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa gửi trùng", 1);
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        AtomicInteger successes = new AtomicInteger();
        AtomicInteger rejected = new AtomicInteger();
        Runnable join = () -> {
            try {
                laundry.join(owner.getUsername(), building.getId(), true);
                successes.incrementAndGet();
            } catch (ResponseStatusException error) {
                assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
                rejected.incrementAndGet();
            }
        };
        simultaneously(join, join);
        assertEquals(1, successes.get());
        assertEquals(1, rejected.get());
        var entries = queue.findByBuilding_IdAndAccount_IdAndActiveTrue(building.getId(), owner.getId());
        assertEquals(1, entries.size());
        assertEquals(QueueEntry.State.HELD, entries.getFirst().getState());
        var active = allocation.activeHolds(owner.getUsername(), building.getId());
        assertEquals(1, active.size());
        assertEquals(entries.getFirst().getId(), active.getFirst().queueEntryId());
        assertEquals(machineId, active.getFirst().machineId());
    }

    @ParameterizedTest
    @ValueSource(booleans = { false, true })
    void readinessAndDispatchAlwaysProduceOneConsistentOutcome(boolean initiallyReady) throws Exception {
        // Exercise several independent races, but do not require a particular scheduling winner.
        for (int attempt = 0; attempt < 3; attempt++) {
            Account owner = account("owner");
            Building building = laundry.createBuilding(owner.getUsername(), "Tòa đổi sẵn sàng", 1);
            var entry = laundry.join(owner.getUsername(), building.getId(), initiallyReady);
            UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
            AtomicInteger readyChanges = new AtomicInteger();
            simultaneously(
                () -> {
                    try {
                        laundry.setReady(owner.getUsername(), building.getId(), !initiallyReady);
                        readyChanges.incrementAndGet();
                    } catch (ResponseStatusException error) {
                        assertTrue(initiallyReady, "Bật Sẵn sàng từ WAITING phải thành công");
                        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
                    }
                },
                () -> laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId));
            var snapshot = statuses.current(owner.getUsername(), building.getId());
            var persisted = queue.findById(entry.getId()).orElseThrow();
            var active = allocation.activeHolds(owner.getUsername(), building.getId());
            if (!initiallyReady || readyChanges.get() == 0) {
                assertEquals(QueueStatusService.State.HELD, snapshot.state());
                assertEquals(QueueEntry.State.HELD, persisted.getState());
                assertTrue(persisted.isReady());
                assertEquals(1, active.size());
                assertEquals(entry.getId(), active.getFirst().queueEntryId());
                assertTrue(laundry.view(owner.getUsername(), building.getId()).queue().isEmpty());
            } else {
                assertEquals(QueueStatusService.State.WAITING, snapshot.state());
                assertEquals(QueueEntry.State.WAITING, persisted.getState());
                assertFalse(persisted.isReady());
                assertTrue(active.isEmpty());
                assertEquals(entry.getId(), laundry.view(owner.getUsername(), building.getId()).queue().getFirst().id());
            }
            assertEquals(1, queue.findByBuilding_IdAndAccount_IdAndActiveTrue(building.getId(), owner.getId()).size());
        }
    }

    @RepeatedTest(3)
    void startAndYieldOfSameHoldHaveExactlyOneWinner() throws Exception {
        var fixture = heldFixture();
        allocation.confirmPhysicalCheck(fixture.first().getUsername(), fixture.buildingId(), fixture.hold().id());
        AtomicInteger started = new AtomicInteger();
        AtomicInteger yielded = new AtomicInteger();
        AtomicInteger conflicts = new AtomicInteger();
        simultaneously(
            () -> expectSuccessOrConflict(() -> allocation.start(fixture.first().getUsername(), fixture.buildingId(), fixture.hold().id()), started, conflicts),
            () -> expectSuccessOrConflict(() -> allocation.yield(fixture.first().getUsername(), fixture.buildingId(), fixture.hold().id()), yielded, conflicts));
        assertEquals(1, started.get() + yielded.get());
        assertEquals(1, conflicts.get());
        var original = holds.findById(fixture.hold().id()).orElseThrow();
        var active = allocation.activeHolds(fixture.owner().getUsername(), fixture.buildingId());
        var machine = laundry.view(fixture.owner().getUsername(), fixture.buildingId()).machines().getFirst();
        if (started.get() == 1) {
            assertEquals(MachineHold.Status.STARTED, original.getStatus());
            assertEquals(Machine.Status.RUNNING, machine.status());
            assertEquals(QueueStatusService.State.WASHING, statuses.current(fixture.first().getUsername(), fixture.buildingId()).state());
            assertEquals(QueueStatusService.State.WAITING, statuses.current(fixture.next().getUsername(), fixture.buildingId()).state());
            assertTrue(active.isEmpty());
        } else {
            assertEquals(MachineHold.Status.YIELDED, original.getStatus());
            assertEquals(Machine.Status.AVAILABLE, machine.status());
            assertEquals(QueueStatusService.State.NONE, statuses.current(fixture.first().getUsername(), fixture.buildingId()).state());
            assertEquals(1, active.size());
            assertEquals(fixture.next().getId(), active.getFirst().accountId());
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = { false, true })
    void unusableAndExpiryDoNotResurrectExpiredRequests(boolean atDeadline) throws Exception {
        var fixture = heldFixture();
        clock.set(atDeadline ? fixture.hold().expiresAt() : fixture.hold().expiresAt().minusNanos(1));
        simultaneously(
            () -> {
                if (atDeadline) {
                    var error = assertThrows(ResponseStatusException.class,
                        () -> allocation.reportUnusable(fixture.first().getUsername(), fixture.buildingId(), fixture.hold().id()));
                    assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
                } else {
                    allocation.reportUnusable(fixture.first().getUsername(), fixture.buildingId(), fixture.hold().id());
                }
            },
            () -> allocation.expire(fixture.buildingId()));
        var original = holds.findById(fixture.hold().id()).orElseThrow();
        var current = statuses.current(fixture.first().getUsername(), fixture.buildingId());
        var active = allocation.activeHolds(fixture.owner().getUsername(), fixture.buildingId());
        if (atDeadline) {
            assertEquals(MachineHold.Status.EXPIRED, original.getStatus());
            assertEquals(QueueStatusService.State.NONE, current.state());
            assertEquals(1, active.size());
            assertEquals(fixture.next().getId(), active.getFirst().accountId());
        } else {
            assertEquals(MachineHold.Status.UNUSABLE, original.getStatus());
            assertEquals(QueueStatusService.State.WAITING, current.state());
            assertEquals(fixture.hold().queueEntryId(), current.queueEntryId());
            assertEquals(List.of(fixture.first().getId(), fixture.next().getId()),
                laundry.view(fixture.owner().getUsername(), fixture.buildingId()).queue().stream()
                    .map(LaundryService.QueueView::accountId).toList());
            assertTrue(active.isEmpty());
            assertEquals(Machine.Status.NEEDS_CHECK,
                laundry.view(fixture.owner().getUsername(), fixture.buildingId()).machines().getFirst().status());
            var repeat = assertThrows(ResponseStatusException.class,
                () -> allocation.reportUnusable(fixture.first().getUsername(), fixture.buildingId(), fixture.hold().id()));
            assertEquals(HttpStatus.CONFLICT, repeat.getStatusCode());
            assertEquals(1, queue.findByBuilding_IdAndAccount_IdAndActiveTrue(fixture.buildingId(), fixture.first().getId()).size());
        }
    }

    @Test void overlappingExpiryJobsProcessMultipleBuildingsWithoutTouchingUnexpiredHold() throws Exception {
        var first = heldFixture();
        var second = heldFixture();
        // Second building has no ready successor; it must not receive a new hold.
        laundry.setReady(second.next().getUsername(), second.buildingId(), false);
        clock.set(clock.instant().plusSeconds(120));
        var unexpired = heldFixture();
        clock.set(first.hold().expiresAt());
        var job = new HoldExpiryJob(holds, allocation, clock);
        simultaneously(job::expireHolds, job::expireHolds);
        assertEquals(MachineHold.Status.EXPIRED, holds.findById(first.hold().id()).orElseThrow().getStatus());
        assertEquals(MachineHold.Status.EXPIRED, holds.findById(second.hold().id()).orElseThrow().getStatus());
        var replacement = allocation.activeHolds(first.owner().getUsername(), first.buildingId());
        assertEquals(1, replacement.size());
        assertEquals(first.next().getId(), replacement.getFirst().accountId());
        assertEquals(clock.instant().plusSeconds(480), replacement.getFirst().expiresAt());
        assertTrue(allocation.activeHolds(second.owner().getUsername(), second.buildingId()).isEmpty());
        assertEquals(QueueStatusService.State.WAITING, statuses.current(second.next().getUsername(), second.buildingId()).state());
        assertEquals(false, statuses.current(second.next().getUsername(), second.buildingId()).ready());
        var untouched = allocation.activeHolds(unexpired.owner().getUsername(), unexpired.buildingId());
        assertEquals(1, untouched.size());
        assertEquals(unexpired.hold().id(), untouched.getFirst().id());
        assertEquals(unexpired.hold().expiresAt(), untouched.getFirst().expiresAt());
        job.expireHolds();
        assertEquals(replacement.getFirst().id(), allocation.activeHolds(first.owner().getUsername(), first.buildingId()).getFirst().id());
    }

    private record HeldFixture(Account owner, UUID buildingId, Account first, Account next,
                               AllocationService.HoldView hold) {}

    private HeldFixture heldFixture() {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa kiểm thử cạnh tranh", 1);
        Account first = resident(building, "first");
        Account next = resident(building, "next");
        laundry.join(first.getUsername(), building.getId(), true);
        laundry.join(next.getUsername(), building.getId(), true);
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        return new HeldFixture(owner, building.getId(), first, next,
            allocation.activeHolds(owner.getUsername(), building.getId()).getFirst());
    }

    private void expectSuccessOrConflict(Runnable action, AtomicInteger successes, AtomicInteger conflicts) {
        try {
            action.run();
            successes.incrementAndGet();
        } catch (ResponseStatusException error) {
            assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
            conflicts.incrementAndGet();
        }
    }

    private void simultaneously(Runnable first, Runnable second) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        var workers = Executors.newFixedThreadPool(2);
        try {
            var left = workers.submit(() -> { ready.countDown(); start.await(); first.run(); return null; });
            var right = workers.submit(() -> { ready.countDown(); start.await(); second.run(); return null; });
            assertTrue(ready.await(5, TimeUnit.SECONDS), "Hai worker phải sẵn sàng trước khi bắt đầu");
            start.countDown();
            left.get(10, TimeUnit.SECONDS);
            right.get(10, TimeUnit.SECONDS);
        } finally {
            start.countDown();
            workers.shutdownNow();
            assertTrue(workers.awaitTermination(5, TimeUnit.SECONDS), "Worker không kết thúc sau timeout");
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
