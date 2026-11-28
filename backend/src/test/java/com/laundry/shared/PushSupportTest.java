package com.laundry.shared;

import java.security.KeyPairGenerator;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:push-tests;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class PushSupportTest {
    @Autowired PushSubscriptionService subscriptions;
    @Autowired PushSubscriptionRepository devices;
    @Autowired PushOutboxRepository rows;
    @Autowired PushOutboxService outbox;
    @Autowired AccountRepository accounts;
    @Autowired LaundryService laundry;
    @Autowired AllocationService allocation;
    @Autowired MembershipRepository memberships;
    @Autowired TransactionTemplate transactions;
    @Autowired MockMvc mvc;
    @Autowired TestClock clock;
    @MockitoBean PushSettings settings;
    @MockitoBean PushTransport transport;
    @MockitoBean PushSenderJob scheduledSender;
    @MockitoBean HoldExpiryJob scheduledExpiry;
    private String key;
    private final String auth = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]);
    @TestConfiguration static class Config {
        @Bean @Primary TestClock pushClock() { return new TestClock(); }
    }
    static class TestClock extends Clock {
        Instant now = Instant.parse("2026-11-28T00:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
    @BeforeEach void setup() throws Exception {
        rows.deleteAll(); devices.deleteAll();
        clock.now = Instant.parse("2026-11-28T00:00:00Z");
        when(settings.enabled()).thenReturn(true);
        var generator = KeyPairGenerator.getInstance("EC"); generator.initialize(new ECGenParameterSpec("secp256r1"));
        var publicKey = (ECPublicKey) generator.generateKeyPair().getPublic();
        byte[] bytes = new byte[65]; bytes[0] = 4;
        coordinate(publicKey.getW().getAffineX().toByteArray(), bytes, 1);
        coordinate(publicKey.getW().getAffineY().toByteArray(), bytes, 33);
        key = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    private void coordinate(byte[] value, byte[] output, int offset) {
        int n = Math.min(value.length, 32); System.arraycopy(value, value.length - n, output, offset + 32 - n, n);
    }
    private Account account() { return accounts.save(new Account("push" + UUID.randomUUID(), "hash", "Test")); }
    private String endpoint() { return "https://fcm.googleapis.com/fcm/send/" + UUID.randomUUID(); }
    private record Assigned(Account owner, Account resident, UUID buildingId, UUID holdId, String endpoint) {}
    private Assigned assign() {
        Account owner = account(), resident = account();
        var building = laundry.createBuilding(owner.getUsername(), "Push test", 1);
        memberships.save(new Membership(building, resident, Membership.Role.RESIDENT, Membership.Status.APPROVED));
        String endpoint = endpoint(); subscriptions.register(resident.getUsername(), endpoint, key, auth);
        laundry.join(resident.getUsername(), building.getId(), true);
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id());
        return new Assigned(owner, resident, building.getId(), allocation.activeHolds(owner.getUsername(), building.getId()).getFirst().id(), endpoint);
    }
    private UUID row(Assigned assigned) {
        return rows.findAll().stream().filter(r -> r.getHoldId().equals(assigned.holdId())).findFirst().orElseThrow().getId();
    }
    private PushSenderJob sender() { return new PushSenderJob(outbox, transport, settings); }
    @Test void ownerScopedRebindStatusDeleteAndQuota() {
        Account a = account(), b = account(); String endpoint = endpoint();
        subscriptions.register(a.getUsername(), endpoint, key, auth);
        assertTrue(subscriptions.status(a.getUsername(), endpoint)); assertFalse(subscriptions.status(b.getUsername(), endpoint));
        subscriptions.delete(b.getUsername(), endpoint); assertTrue(subscriptions.status(a.getUsername(), endpoint));
        subscriptions.register(b.getUsername(), endpoint, key, auth);
        assertFalse(subscriptions.status(a.getUsername(), endpoint)); assertTrue(subscriptions.status(b.getUsername(), endpoint));
        subscriptions.delete(a.getUsername(), endpoint); assertTrue(subscriptions.status(b.getUsername(), endpoint));
        subscriptions.delete(b.getUsername(), endpoint); assertFalse(subscriptions.status(b.getUsername(), endpoint));
        for (int i = 0; i < 10; i++) subscriptions.register(a.getUsername(), endpoint(), key, auth);
        assertThrows(Exception.class, () -> subscriptions.register(a.getUsername(), endpoint(), key, auth));
    }
    @Test void strictEndpointsAndKeys() {
        for (String value : List.of("http://fcm.googleapis.com/fcm/send/x", "https://fcm.googleapis.com.evil.test/fcm/send/x",
            "https://user@fcm.googleapis.com/fcm/send/x", "https://fcm.googleapis.com:443/fcm/send/x", "https://127.0.0.1/x",
            "https://fcm.googleapis.com/fcm/send/x#fragment", "https://fcm.googleapis.com/fcm/send/x?q=x",
            "https://push.apple.com.evil.test/x", "https://fcm.googleapis.com/fcm/send/%2e%2e/x"))
            assertThrows(Exception.class, () -> PushValidation.endpoint(value), value);
        for (String value : List.of(endpoint(), "https://updates.push.services.mozilla.com/wpush/v2/token", "https://web.push.apple.com/token"))
            assertDoesNotThrow(() -> PushValidation.endpoint(value));
        PushValidation.keys(key, auth);
        assertThrows(Exception.class, () -> PushValidation.keys(auth, auth));
        assertThrows(Exception.class, () -> PushValidation.keys(key, key));
        assertThrows(Exception.class, () -> PushValidation.keys(Base64.getUrlEncoder().encodeToString(new byte[65]), auth));
    }
    @Test void authenticatedAndCsrfProtectedApi() throws Exception {
        mvc.perform(get("/api/push/config")).andExpect(status().isUnauthorized());
        Account a = account(); String body = "{\"endpoint\":\"" + endpoint() + "\",\"keys\":{\"p256dh\":\"" + key + "\",\"auth\":\"" + auth + "\"}}";
        mvc.perform(get("/api/push/config").with(user(a.getUsername()))).andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(true));
        mvc.perform(post("/api/push/subscriptions").with(user(a.getUsername())).contentType("application/json").content(body)).andExpect(status().isForbidden());
        mvc.perform(post("/api/push/subscriptions").with(user(a.getUsername())).with(csrf()).contentType("application/json").content(body)).andExpect(status().isOk());
        mvc.perform(post("/api/push/subscriptions/status").with(user(a.getUsername())).contentType("application/json").content("{\"endpoint\":\"https://fcm.googleapis.com/fcm/send/token\"}")).andExpect(status().isForbidden());
        mvc.perform(delete("/api/push/subscriptions").with(user(a.getUsername())).contentType("application/json").content("{}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/push/subscriptions").with(user(a.getUsername())).with(csrf()).contentType("application/json").content("{\"endpoint\":\"https://localhost/x\",\"keys\":{\"p256dh\":\"bad\",\"auth\":\"bad\"}}")).andExpect(status().isBadRequest());
    }
    @Test void assignmentCommitsBeforeSendAndSuccessfulDeliveryDeduplicates() throws Exception {
        var assigned = assign();
        verifyNoInteractions(transport);
        when(transport.send(any())).thenAnswer(invocation -> {
            assertFalse(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
            var delivery = (PushOutboxService.Delivery) invocation.getArgument(0);
            assertEquals(assigned.holdId(), delivery.holdId()); return 201;
        });
        sender().sendDue(); sender().sendDue();
        verify(transport, times(1)).send(any());
        assertTrue(rows.findById(row(assigned)).orElseThrow().isDone());
        clearInvocations(transport); sender().sendDue(); verifyNoInteractions(transport);
    }
    @Test void sendsToEachEnabledDeviceAndKeepsOthersWhenOneIsDisabled() throws Exception {
        var assigned = assign();
        String secondDevice = endpoint();
        subscriptions.register(assigned.resident().getUsername(), secondDevice, key, auth);
        allocation.yield(assigned.resident().getUsername(), assigned.buildingId(), assigned.holdId());
        laundry.join(assigned.resident().getUsername(), assigned.buildingId(), true);
        var currentHold = allocation.activeHolds(assigned.resident().getUsername(), assigned.buildingId()).getFirst();
        assertEquals(2, rows.findAll().stream().filter(r -> r.getHoldId().equals(currentHold.id())).count());
        subscriptions.delete(assigned.resident().getUsername(), assigned.endpoint());
        when(transport.send(any())).thenReturn(201);
        sender().sendDue();
        verify(transport, times(1)).send(argThat(delivery -> delivery.endpoint().equals(secondDevice)
            && delivery.holdId().equals(currentHold.id())));
        assertTrue(subscriptions.status(assigned.resident().getUsername(), secondDevice));
        assertFalse(subscriptions.status(assigned.resident().getUsername(), assigned.endpoint()));
    }
    @Test void rollbackRemovesOutboxAndDoesNotSend() {
        long before = rows.count();
        transactions.executeWithoutResult(tx -> { assign(); assertTrue(rows.count() > before); tx.setRollbackOnly(); });
        assertEquals(before, rows.count()); verifyNoInteractions(transport);
    }
    @Test void retriesBoundedAndExpiredInactiveReboundMembershipRemovedAreSkipped() throws Exception {
        var assigned = assign(); when(transport.send(any())).thenReturn(503);
        UUID id = row(assigned);
        for (int i = 0; i < 5; i++) { sender().sendDue(); clock.now = clock.now.plusSeconds(81); }
        assertEquals(4, rows.findById(id).orElseThrow().getAttempts()); assertTrue(rows.findById(id).orElseThrow().isDone());
        var expired = assign(); clock.now = clock.now.plusSeconds(480); assertNull(outbox.claim(row(expired)));
        var inactive = assign(); allocation.yield(inactive.resident().getUsername(), inactive.buildingId(), inactive.holdId()); assertNull(outbox.claim(row(inactive)));
        var rebound = assign(); subscriptions.register(account().getUsername(), rebound.endpoint(), key, auth); assertNull(outbox.claim(row(rebound)));
        var removed = assign(); transactions.executeWithoutResult(tx -> memberships.delete(memberships.findByBuilding_IdAndAccount_Id(removed.buildingId(), removed.resident().getId()).orElseThrow()));
        assertNull(outbox.claim(row(removed)));
    }
    @Test void goneSubscriptionsDeletedButNewRevisionIsPreserved() {
        var first = assign(); var delivery = outbox.claim(row(first)); outbox.complete(delivery, 410);
        assertFalse(subscriptions.status(first.resident().getUsername(), first.endpoint()));
        var next = assign(); var oldDelivery = outbox.claim(row(next));
        subscriptions.register(next.resident().getUsername(), next.endpoint(), key, auth);
        outbox.complete(oldDelivery, 404); assertTrue(subscriptions.status(next.resident().getUsername(), next.endpoint()));
    }
    @Test void claimLeaseAndUnexpectedFailuresRemainBounded() throws Exception {
        var assigned = assign(); UUID id = row(assigned);
        var first = outbox.claim(id); assertNotNull(first); assertNull(outbox.claim(id));
        clock.now = clock.now.plusSeconds(30);
        var second = outbox.claim(id); assertNotNull(second);
        outbox.complete(first, 201); // Stale worker cannot complete a reclaimed delivery.
        assertFalse(rows.findById(id).orElseThrow().isDone());
        outbox.complete(second, 302); // Redirects never redirect transport to another host.
        clock.now = clock.now.plusSeconds(30);
        when(transport.send(any())).thenThrow(new java.io.IOException("sensitive endpoint must not be logged"));
        sender().sendDue(); clock.now = clock.now.plusSeconds(81); sender().sendDue();
        assertTrue(rows.findById(id).orElseThrow().isDone());
        assertEquals(4, rows.findById(id).orElseThrow().getAttempts());
    }
    @Test void unconfiguredIsCleanlyDisabled() {
        var disabled = new PushSettings("", "", ""); assertFalse(disabled.enabled()); assertNull(disabled.publicKey());
        when(settings.enabled()).thenReturn(false);
        assertThrows(Exception.class, () -> subscriptions.register(account().getUsername(), endpoint(), key, auth));
        sender().sendDue(); verifyNoInteractions(transport);
    }
}
