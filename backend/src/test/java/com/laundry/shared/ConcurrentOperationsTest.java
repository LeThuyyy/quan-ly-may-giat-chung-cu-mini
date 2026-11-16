package com.laundry.shared;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:concurrent-test;DB_CLOSE_DELAY=-1")
class ConcurrentOperationsTest {
    @Autowired LaundryService service;
    @Autowired InvitationService invitations;
    @Autowired AccountRepository accounts;
    @Autowired MembershipRepository memberships;

    private Account account(String prefix) {
        return accounts.save(new Account(prefix + UUID.randomUUID(), "test-hash", prefix));
    }

    @Test void leavingAndChangingReadinessCannotBringBackAnEntry() throws Exception {
        Account owner = account("owner");
        Building building = service.createBuilding(owner.getUsername(), "Tòa đồng thời", 1);
        for (int i = 0; i < 8; i++) {
            service.join(owner.getUsername(), building.getId(), false);
            simultaneously(
                () -> service.leave(owner.getUsername(), building.getId()),
                () -> {
                    try { service.setReady(owner.getUsername(), building.getId(), true); }
                    catch (ResponseStatusException e) {
                        if (e.getStatusCode() != HttpStatus.BAD_REQUEST) throw e;
                    }
                });
            assertTrue(service.view(owner.getUsername(), building.getId()).queue().isEmpty(),
                "Một lượt đã rời không được sống lại khi đổi trạng thái đồng thời");
        }
    }

    @Test void repeatedInvitationJoinCannotCreateTwoMemberships() throws Exception {
        Account owner = account("owner");
        Account resident = account("resident");
        Building building = service.createBuilding(owner.getUsername(), "Tòa mời", 1);
        String token = invitations.create(owner.getUsername(), building.getId());
        simultaneously(
            () -> assertEquals(Membership.Status.PENDING, invitations.request(resident.getUsername(), token).status()),
            () -> assertEquals(Membership.Status.PENDING, invitations.request(resident.getUsername(), token).status()));
        assertEquals(1, memberships.findByBuilding_IdAndStatus(building.getId(), Membership.Status.PENDING).size());
    }

    private void simultaneously(Runnable first, Runnable second) throws InterruptedException {
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService workers = Executors.newFixedThreadPool(2)) {
            var left = workers.submit(() -> { start.await(); first.run(); return null; });
            var right = workers.submit(() -> { start.await(); second.run(); return null; });
            start.countDown();
            left.get(10, TimeUnit.SECONDS);
            right.get(10, TimeUnit.SECONDS);
        } catch (java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException e) {
            throw new AssertionError("Concurrent operation failed", e);
        }
    }
}
