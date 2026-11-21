package com.laundry.shared;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:queue-status-tests;DB_CLOSE_DELAY=-1")
class QueueStatusTest {
    @Autowired QueueStatusService status;
    @Autowired LaundryService laundry;
    @Autowired AllocationService allocation;
    @Autowired AccountRepository accounts;
    @Autowired MembershipRepository memberships;
    @Autowired QueueEntryRepository queue;
    @Autowired MockMvc mvc;
    @Autowired TestClock clock;
    @MockitoBean HoldExpiryJob job;

    @TestConfiguration
    static class ClockConfig {
        @Bean @Primary TestClock queueStatusClock() { return new TestClock(); }
    }
    static class TestClock extends Clock {
        private volatile Instant time = Instant.parse("2026-11-21T10:00:00Z");
        void set(Instant value) { time = value; }
        @Override public Instant instant() { return time; }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
    }
    @BeforeEach void resetClock() { clock.set(Instant.parse("2026-11-21T10:00:00Z")); }
    private Account account() { return accounts.save(new Account("user" + UUID.randomUUID(), "hash", "Cư dân")); }
    private Account resident(Building building) {
        Account user = account();
        memberships.save(new Membership(building, user, Membership.Role.RESIDENT, Membership.Status.APPROVED));
        return user;
    }
    private Building building(Account owner) { return laundry.createBuilding(owner.getUsername(), "Tòa trạng thái", 1); }
    private UUID machine(Account owner, Building building) {
        return laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
    }

    @Test void noneWaitingReadinessAndLeftAreDistinguished() {
        Account owner = account();
        Building building = building(owner);
        var empty = status.current(owner.getUsername(), building.getId());
        assertEquals(QueueStatusService.State.NONE, empty.state());
        assertNull(empty.queueEntryId()); assertNull(empty.ready()); assertNull(empty.holdId());
        assertNull(empty.machineId()); assertNull(empty.expiresAt());
        assertEquals(clock.instant(), empty.serverNow());
        var entry = laundry.join(owner.getUsername(), building.getId(), false);
        var waiting = status.current(owner.getUsername(), building.getId());
        assertEquals(QueueStatusService.State.WAITING, waiting.state());
        assertEquals(entry.getId(), waiting.queueEntryId());
        assertEquals(false, waiting.ready());
        assertNull(waiting.holdId());
        laundry.setReady(owner.getUsername(), building.getId(), true);
        assertEquals(true, status.current(owner.getUsername(), building.getId()).ready());
        laundry.leave(owner.getUsername(), building.getId());
        assertEquals(QueueStatusService.State.NONE, status.current(owner.getUsername(), building.getId()).state());
    }

    @Test void heldAndWashingReturnLinkedMachineWithoutRejoinEligibility() {
        Account owner = account();
        Building building = building(owner);
        var entry = laundry.join(owner.getUsername(), building.getId(), true);
        UUID machineId = machine(owner, building);
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        var hold = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        var held = status.current(owner.getUsername(), building.getId());
        assertEquals(QueueStatusService.State.HELD, held.state());
        assertEquals(entry.getId(), held.queueEntryId());
        assertEquals(hold.id(), held.holdId());
        assertEquals(machineId, held.machineId());
        assertEquals(hold.expiresAt(), held.expiresAt());
        assertNull(held.ready());
        allocation.confirmPhysicalCheck(owner.getUsername(), building.getId(), hold.id());
        allocation.start(owner.getUsername(), building.getId(), hold.id());
        var washing = status.current(owner.getUsername(), building.getId());
        assertEquals(QueueStatusService.State.WASHING, washing.state());
        assertEquals(entry.getId(), washing.queueEntryId());
        assertEquals(hold.id(), washing.holdId());
        assertEquals(machineId, washing.machineId());
        assertNull(washing.ready()); assertNull(washing.expiresAt());
    }

    @Test void expiredButUnprocessedHoldRemainsHeldAndGetHasNoSideEffects() {
        Account owner = account();
        Building building = building(owner);
        Account next = resident(building);
        laundry.join(owner.getUsername(), building.getId(), true);
        laundry.join(next.getUsername(), building.getId(), true);
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machine(owner, building));
        var hold = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        clock.set(hold.expiresAt());
        var snapshot = status.current(owner.getUsername(), building.getId());
        assertEquals(QueueStatusService.State.HELD, snapshot.state());
        assertEquals(snapshot.serverNow(), snapshot.expiresAt());
        assertEquals(QueueEntry.State.HELD, queue.findById(hold.queueEntryId()).orElseThrow().getState());
        assertEquals(QueueStatusService.State.WAITING, status.current(next.getUsername(), building.getId()).state());
        allocation.expire(building.getId());
        assertEquals(QueueStatusService.State.NONE, status.current(owner.getUsername(), building.getId()).state());
        assertEquals(QueueStatusService.State.HELD, status.current(next.getUsername(), building.getId()).state());
    }

    @Test void yieldingEndsRequestButUnusableRestoresSameRequest() {
        Account owner = account();
        Building building = building(owner);
        Account next = resident(building);
        laundry.join(owner.getUsername(), building.getId(), true);
        var nextEntry = laundry.join(next.getUsername(), building.getId(), true);
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machine(owner, building));
        var first = status.current(owner.getUsername(), building.getId());
        allocation.yield(owner.getUsername(), building.getId(), first.holdId());
        assertEquals(QueueStatusService.State.NONE, status.current(owner.getUsername(), building.getId()).state());
        var second = status.current(next.getUsername(), building.getId());
        allocation.reportUnusable(next.getUsername(), building.getId(), second.holdId());
        var restored = status.current(next.getUsername(), building.getId());
        assertEquals(QueueStatusService.State.WAITING, restored.state());
        assertEquals(nextEntry.getId(), restored.queueEntryId());
        assertEquals(true, restored.ready()); assertNull(restored.holdId());
    }

    @Test void inconsistentActiveRowsOrMissingHoldFailClosed() {
        Account owner = account();
        Building building = building(owner);
        var entry = laundry.join(owner.getUsername(), building.getId(), true);
        entry.hold();
        queue.save(entry);
        var missingHold = assertThrows(ResponseStatusException.class, () -> status.current(owner.getUsername(), building.getId()));
        assertEquals(HttpStatus.CONFLICT, missingHold.getStatusCode());
        queue.save(new QueueEntry(building, owner, 2, true));
        var duplicate = assertThrows(ResponseStatusException.class, () -> status.current(owner.getUsername(), building.getId()));
        assertEquals(HttpStatus.CONFLICT, duplicate.getStatusCode());
    }

    @Test void httpRequiresLoginApprovalAndMembershipInTheRequestedBuilding() throws Exception {
        Account owner = account();
        Building building = building(owner);
        Account outsider = account();
        String url = "/api/buildings/" + building.getId() + "/queue/me";
        mvc.perform(get(url)).andExpect(status().isUnauthorized());
        mvc.perform(get(url).with(user(outsider.getUsername()))).andExpect(status().isForbidden());
        memberships.save(new Membership(building, outsider, Membership.Role.RESIDENT, Membership.Status.PENDING));
        mvc.perform(get(url).with(user(outsider.getUsername()))).andExpect(status().isForbidden());
        Building other = building(outsider);
        mvc.perform(get("/api/buildings/" + other.getId() + "/queue/me").with(user(owner.getUsername())))
            .andExpect(status().isForbidden());
    }

    @Test void httpReturnsOnlyAuthenticatedUsersStateAndDoesNotAcceptAccountOverride() throws Exception {
        Account owner = account();
        Building building = building(owner);
        Account other = resident(building);
        var entry = laundry.join(other.getUsername(), building.getId(), false);
        String url = "/api/buildings/" + building.getId() + "/queue/me";
        mvc.perform(get(url).param("accountId", other.getId().toString()).with(user(owner.getUsername())))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "private, no-store"))
            .andExpect(jsonPath("$.state").value("NONE"))
            .andExpect(jsonPath("$.queueEntryId").isEmpty()).andExpect(jsonPath("$.serverNow").exists());
        mvc.perform(get(url).with(user(other.getUsername())))
            .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("WAITING"))
            .andExpect(jsonPath("$.queueEntryId").value(entry.getId().toString()))
            .andExpect(jsonPath("$.ready").value(false));
        mvc.perform(get("/api/buildings/not-a-uuid/queue/me").with(user(owner.getUsername())))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/buildings/" + UUID.randomUUID() + "/queue/me").with(user(owner.getUsername())))
            .andExpect(status().isNotFound());
    }

    @Test void concurrentReadAndDispatchCannotReturnMixedEntryAndHold() throws Exception {
        Account owner = account();
        Building building = building(owner);
        laundry.join(owner.getUsername(), building.getId(), true);
        UUID machineId = machine(owner, building);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var read = executor.submit(() -> { start.await(); return status.current(owner.getUsername(), building.getId()); });
            var dispatch = executor.submit(() -> { start.await(); laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId); return null; });
            start.countDown();
            var snapshot = read.get(10, TimeUnit.SECONDS);
            dispatch.get(10, TimeUnit.SECONDS);
            assertTrue(snapshot.state() == QueueStatusService.State.WAITING || snapshot.state() == QueueStatusService.State.HELD);
            if (snapshot.state() == QueueStatusService.State.HELD) {
                assertNotNull(snapshot.holdId()); assertEquals(machineId, snapshot.machineId());
                assertNotNull(snapshot.expiresAt());
            } else {
                assertNull(snapshot.holdId()); assertNull(snapshot.machineId());
            }
        }
        assertEquals(QueueStatusService.State.HELD, status.current(owner.getUsername(), building.getId()).state());
    }
}
