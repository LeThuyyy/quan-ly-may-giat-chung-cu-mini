package com.laundry.shared;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:owner-adjustment-tests;DB_CLOSE_DELAY=-1")
class OwnerAdjustmentIdempotencyTest {
    @Autowired LaundryService laundry;
    @Autowired AllocationService allocation;
    @Autowired WashService wash;
    @Autowired AccountRepository accounts;
    @Autowired MembershipRepository memberships;
    @Autowired WashCycleRepository cycles;
    @Autowired MachineRepository machines;
    @Autowired ActivityRepository activity;
    @Autowired PlatformTransactionManager transactions;
    @Autowired MockMvc mvc;
    @Autowired AdjustableClock clock;
    @MockitoBean HoldExpiryJob holdJob;
    @MockitoBean WashDueJob dueJob;
    @MockitoBean PickupReminderJob pickupJob;
    @MockitoBean PushSenderJob pushJob;
    @MockitoBean ChatRetentionJob chatJob;

    @TestConfiguration
    static class ClockConfig {
        @Bean @Primary AdjustableClock ownerAdjustmentClock() { return new AdjustableClock(); }
    }
    static class AdjustableClock extends Clock {
        private volatile Instant now = Instant.parse("2026-11-28T10:00:00Z");
        void advance(long seconds) { now = now.plusSeconds(seconds); }
        @Override public Instant instant() { return now; }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
    }
    @BeforeEach void resetClock() { clock.now = Instant.parse("2026-11-28T10:00:00Z"); }

    private Account account() {
        return accounts.save(new Account("adjust-" + UUID.randomUUID(), "hash", "Test user"));
    }
    private Account resident(Building building) {
        Account account = account();
        memberships.save(new Membership(building, account, Membership.Role.RESIDENT, Membership.Status.APPROVED));
        return account;
    }
    private record Fixture(Building building, Account manager, Account owner, Account next, UUID machine, UUID cycle) {}
    private Fixture fixture(WashCycle.HandoverMode mode) {
        Account manager = account();
        Building building = laundry.createBuilding(manager.getUsername(), "Tòa kiểm tra gửi lặp", 1);
        Account owner = resident(building), next = resident(building);
        UUID machine = laundry.view(manager.getUsername(), building.getId()).machines().getFirst().id();
        laundry.join(owner.getUsername(), building.getId(), true);
        laundry.join(next.getUsername(), building.getId(), true);
        laundry.confirmMachineFree(manager.getUsername(), building.getId(), machine);
        UUID hold = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst().id();
        allocation.confirmPhysicalCheck(owner.getUsername(), building.getId(), hold);
        WashCycle cycle = allocation.start(owner.getUsername(), building.getId(), hold, 30, mode);
        return new Fixture(building, manager, owner, next, machine, cycle.getId());
    }
    private Fixture fixture() { return fixture(WashCycle.HandoverMode.ALLOW_TRANSFER); }
    private WashService.CycleView adjust(Fixture f, UUID request, Integer minutes) {
        return wash.ownerRemaining(f.owner.getUsername(), f.building.getId(), f.cycle, minutes, request);
    }
    private WashCycle persisted(Fixture f) { return cycles.findById(f.cycle).orElseThrow(); }
    private long reportCount(Fixture f) {
        return activity.findByBuildingIdAndOccurredAtGreaterThanAndAction(f.building.getId(), Instant.EPOCH,
            "WASH_REMAINING_REPORTED", PageRequest.of(0, 100)).getTotalElements();
    }
    private void assertConflict(Runnable action) {
        assertEquals(HttpStatus.CONFLICT, assertThrows(ResponseStatusException.class, action::run).getStatusCode());
    }

    @Test void identicalKeyAndPayloadAfterClockAdvanceDoesNotExtendOrEscalate() {
        Fixture f = fixture();
        UUID request = UUID.randomUUID();
        var first = adjust(f, request, 12);
        clock.advance(90);
        var replay = adjust(f, request, 12);
        assertEquals(first.estimatedEndAt(), replay.estimatedEndAt());
        assertEquals(clock.instant(), replay.serverNow());
        assertEquals(1, replay.overrunReports());
        assertEquals(WashCycle.State.ACTIVE, replay.state());
        assertEquals(Machine.Status.RUNNING, machines.findById(f.machine).orElseThrow().getStatus());
        WashCycle saved = persisted(f);
        assertEquals(first.estimatedEndAt(), saved.getEstimatedEndAt());
        assertEquals(1, saved.getOverrunReports());
        assertEquals(request, saved.getLastOwnerAdjustmentRequestId());
        assertEquals(12, saved.getLastOwnerAdjustmentMinutes());
        assertEquals(1, reportCount(f));
    }

    @Test void reusedKeyWithChangedPayloadConflictsWithoutChangingState() {
        Fixture f = fixture();
        UUID request = UUID.randomUUID();
        var first = adjust(f, request, 12);
        clock.advance(60);
        assertConflict(() -> adjust(f, request, 13));
        assertConflict(() -> adjust(f, request, null));
        assertEquals(first.estimatedEndAt(), persisted(f).getEstimatedEndAt());
        assertEquals(1, persisted(f).getOverrunReports());
        assertEquals(12, persisted(f).getLastOwnerAdjustmentMinutes());
        assertEquals(1, reportCount(f));
    }

    @Test void distinctSecondRequestStillEscalatesAndItsReplayDoesNotAddAReport() {
        Fixture f = fixture();
        adjust(f, UUID.randomUUID(), 12);
        clock.advance(60);
        UUID second = UUID.randomUUID();
        var escalated = adjust(f, second, 12);
        assertEquals(WashCycle.State.NEEDS_MANAGER, escalated.state());
        assertEquals(2, escalated.overrunReports());
        assertEquals(Machine.Status.NEEDS_CHECK, machines.findById(f.machine).orElseThrow().getStatus());
        clock.advance(60);
        var replay = adjust(f, second, 12);
        assertEquals(WashCycle.State.NEEDS_MANAGER, replay.state());
        assertEquals(2, replay.overrunReports());
        assertEquals(escalated.estimatedEndAt(), replay.estimatedEndAt());
        assertEquals(2, reportCount(f));
    }

    @Test void replayAfterInspectionHoldDoesNotRevokeHoldOrMakeAnotherDecision() {
        Fixture f = fixture();
        UUID request = UUID.randomUUID();
        adjust(f, request, 1);
        clock.advance(60);
        var hold = allocation.dispatch(f.building.getId()).getFirst();
        assertEquals(f.next.getId(), hold.accountId());
        var replay = adjust(f, request, 1);
        assertEquals(1, replay.overrunReports());
        assertEquals(hold.id(), allocation.activeHolds(f.owner.getUsername(), f.building.getId()).getFirst().id());
        assertConflict(() -> adjust(f, UUID.randomUUID(), 1));
        assertEquals(1, reportCount(f));
    }

    @Test void replayAfterSelfPickupWindowStartsOrCycleCompletesReturnsCurrentState() {
        Fixture f = fixture(WashCycle.HandoverMode.SELF_PICKUP);
        UUID request = UUID.randomUUID();
        adjust(f, request, 1);
        clock.advance(60);
        assertEquals("SELF_PICKUP", adjust(f, request, 1).phase());
        assertConflict(() -> adjust(f, UUID.randomUUID(), 1));
        wash.pickup(f.owner.getUsername(), f.building.getId(), f.cycle, true);
        var replay = adjust(f, request, 1);
        assertEquals(WashCycle.State.COMPLETED, replay.state());
        assertEquals(WashCycle.Completion.OWNER_PICKUP, replay.completion());
        assertEquals(1, persisted(f).getOverrunReports());
        assertEquals(1, reportCount(f));
    }

    @Test void ownershipMembershipAndBuildingAreCheckedBeforeReplay() {
        Fixture f = fixture();
        UUID request = UUID.randomUUID();
        adjust(f, request, 12);
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
            () -> wash.ownerRemaining(f.next.getUsername(), f.building.getId(), f.cycle, 12, request)).getStatusCode());
        Building other = laundry.createBuilding(f.owner.getUsername(), "Tòa khác", 1);
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
            () -> wash.ownerRemaining(f.owner.getUsername(), other.getId(), f.cycle, 12, request)).getStatusCode());
        Membership membership = memberships.findByBuilding_IdAndAccount_Id(f.building.getId(), f.owner.getId()).orElseThrow();
        membership.remove();
        memberships.save(membership);
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
            () -> adjust(f, request, 12)).getStatusCode());
        assertEquals(1, persisted(f).getOverrunReports());
        assertEquals(1, reportCount(f));
    }

    @Test void rolledBackAdjustmentDoesNotConsumeRequestIdOrRetainItsAuditEvent() {
        Fixture f = fixture();
        UUID request = UUID.randomUUID();
        Instant initialEnd = persisted(f).getEstimatedEndAt();
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            assertEquals(1, adjust(f, request, 12).overrunReports());
            cycles.flush();
            assertEquals(1, reportCount(f));
            status.setRollbackOnly();
        });
        WashCycle rolledBack = persisted(f);
        assertEquals(0, rolledBack.getOverrunReports());
        assertEquals(initialEnd, rolledBack.getEstimatedEndAt());
        assertNull(rolledBack.getLastOwnerAdjustmentRequestId());
        assertNull(rolledBack.getLastOwnerAdjustmentMinutes());
        assertEquals(0, reportCount(f));
        clock.advance(60);
        var committed = adjust(f, request, 12);
        assertEquals(clock.instant().plusSeconds(720), committed.estimatedEndAt());
        assertEquals(1, committed.overrunReports());
        assertEquals(1, reportCount(f));
    }

    @Test void httpContractAcceptsOptionalUuidAndProtectsKeyedReplay() throws Exception {
        Fixture f = fixture();
        String url = "/api/buildings/" + f.building.getId() + "/wash-cycles/" + f.cycle + "/remaining";
        UUID request = UUID.randomUUID();
        String json = "{\"remainingMinutes\":12,\"clientRequestId\":\"" + request + "\"}";
        mvc.perform(post(url).with(user(f.owner.getUsername())).contentType("application/json").content(json))
            .andExpect(status().isForbidden());
        mvc.perform(post(url).with(user(f.owner.getUsername())).with(csrf()).contentType("application/json").content(json))
            .andExpect(status().isOk()).andExpect(jsonPath("$.overrunReports").value(1));
        clock.advance(90);
        mvc.perform(post(url).with(user(f.owner.getUsername())).with(csrf()).contentType("application/json").content(json))
            .andExpect(status().isOk()).andExpect(jsonPath("$.overrunReports").value(1))
            .andExpect(jsonPath("$.state").value("ACTIVE"));
        mvc.perform(post(url).with(user(f.next.getUsername())).with(csrf()).contentType("application/json").content(json))
            .andExpect(status().isForbidden());
        mvc.perform(post(url).with(user(f.owner.getUsername())).with(csrf()).contentType("application/json")
            .content("{\"remainingMinutes\":13,\"clientRequestId\":\"" + request + "\"}"))
            .andExpect(status().isConflict());
        mvc.perform(post(url).with(user(f.owner.getUsername())).with(csrf()).contentType("application/json")
            .content("{\"remainingMinutes\":12,\"clientRequestId\":\"not-a-uuid\"}"))
            .andExpect(status().isBadRequest());
        assertEquals(1, reportCount(f));
    }

    @Test void legacyMinutesOnlyHttpRequestRemainsAcceptedWithoutRetryGuarantee() throws Exception {
        Fixture f = fixture();
        String url = "/api/buildings/" + f.building.getId() + "/wash-cycles/" + f.cycle + "/remaining";
        mvc.perform(post(url).with(user(f.owner.getUsername())).with(csrf()).contentType("application/json")
            .content("{\"remainingMinutes\":12}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.overrunReports").value(1));
        assertNull(persisted(f).getLastOwnerAdjustmentRequestId());
        assertEquals(1, reportCount(f));
    }
}
