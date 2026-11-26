package com.laundry.shared;

import java.time.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@TestPropertySource(properties="spring.datasource.url=jdbc:h2:mem:eta-detail;DB_CLOSE_DELAY=-1")
class MachineDetailEtaIntegrationTest {
    @Autowired LaundryService laundry;
    @Autowired AllocationService allocation;
    @Autowired EtaService eta;
    @Autowired MachineDetailService detail;
    @Autowired AccountRepository accounts;
    @Autowired MembershipRepository members;
    @Autowired MachineHoldRepository holds;
    @Autowired QueueEntryRepository queue;
    @MockitoBean HoldExpiryJob expiry;
    @MockitoBean WashDueJob due;
    static final Instant NOW=Instant.parse("2026-11-25T00:00:00Z");
    @TestConfiguration static class Time {
        @Bean @Primary Clock etaClock() {return Clock.fixed(NOW,ZoneOffset.UTC);}
    }
    Account account() {return accounts.save(new Account("eta"+UUID.randomUUID(),"hash","Resident"));}
    Account resident(Building b) {
        Account a=account(); members.save(new Membership(b,a,Membership.Role.RESIDENT,Membership.Status.APPROVED));return a;
    }
    @Test void exactHeldTimesAndReadOnlySnapshots() {
        Account manager=account();var b=laundry.createBuilding(manager.getUsername(),"ETA",1);
        Account a=resident(b), skip=resident(b), target=resident(b);
        var m=laundry.view(manager.getUsername(),b.getId()).machines().getFirst();
        laundry.confirmMachineFree(manager.getUsername(),b.getId(),m.id());
        laundry.join(a.getUsername(),b.getId(),true);
        laundry.join(skip.getUsername(),b.getId(),false);
        laundry.join(target.getUsername(),b.getId(),true);
        long hc=holds.count(),qc=queue.count();
        var e=eta.me(target.getUsername(),b.getId());
        assertEquals("READY",e.state());assertEquals(2,e.rank());assertEquals(0,e.readyAhead());
        assertEquals(NOW,e.serverNow());assertEquals(NOW.plusSeconds(3000),e.rangeStart());
        assertEquals(NOW.plusSeconds(3780),e.rangeEnd());
        assertEquals("UNREADY",eta.me(skip.getUsername(),b.getId()).state());
        assertEquals("NOT_WAITING",eta.me(a.getUsername(),b.getId()).state());
        assertNull(detail.get(target.getUsername(),b.getId(),m.id()).ownHold());
        assertNull(detail.get(target.getUsername(),b.getId(),m.id()).previousCycle());
        assertNotNull(detail.get(a.getUsername(),b.getId(),m.id()).ownHold());
        assertEquals(NOW,detail.get(a.getUsername(),b.getId(),m.id()).serverNow());
        assertEquals(hc,holds.count());assertEquals(qc,queue.count());
        assertEquals(1,allocation.activeHolds(manager.getUsername(),b.getId()).size());
        assertThrows(ResponseStatusException.class,() -> eta.me(account().getUsername(),b.getId()));
        assertThrows(ResponseStatusException.class,() -> detail.get(target.getUsername(),b.getId(),UUID.randomUUID()));
    }
    @Test void staleUnprocessedHoldNeverLooksImmediatelyFreeInEstimate() {
        Account manager=account();var b=laundry.createBuilding(manager.getUsername(),"Stale",1);
        Account a=resident(b),target=resident(b);
        var m=laundry.view(manager.getUsername(),b.getId()).machines().getFirst();
        laundry.confirmMachineFree(manager.getUsername(),b.getId(),m.id());
        laundry.join(a.getUsername(),b.getId(),true);laundry.join(target.getUsername(),b.getId(),true);
        new org.springframework.jdbc.core.JdbcTemplate(dataSource).update("update machine_holds set expires_at=? where machine_id=? and status='ACTIVE'",java.sql.Timestamp.from(NOW),m.id());
        assertEquals("UNAVAILABLE",eta.me(target.getUsername(),b.getId()).state());
        assertEquals(MachineHold.Status.ACTIVE,holds.findByMachine_Building_IdAndStatus(b.getId(),MachineHold.Status.ACTIVE).getFirst().getStatus());
    }
    @Autowired javax.sql.DataSource dataSource;
    @Test void unverifiedMachineIsUnavailableAndDoesNotDispatch() {
        Account manager=account();var b=laundry.createBuilding(manager.getUsername(),"Unverified",1);
        Account a=resident(b);laundry.join(a.getUsername(),b.getId(),true);
        assertEquals("UNAVAILABLE",eta.me(a.getUsername(),b.getId()).state());
        assertTrue(allocation.activeHolds(manager.getUsername(),b.getId()).isEmpty());
        assertEquals(1,laundry.view(a.getUsername(),b.getId()).queue().size());
    }

    @Test void multiMachineEtaExcludesMaintenanceAndSimulatesParallelSlots() {
        Account manager = account();
        var b = laundry.createBuilding(manager.getUsername(), "MultiMachine", 3);
        var machines = laundry.view(manager.getUsername(), b.getId()).machines();
        // Machine 1: confirmed free and started by resident1 for 20 minutes
        Account r1 = resident(b), r2 = resident(b), rUnready = resident(b), rTarget = resident(b);
        laundry.join(r1.getUsername(), b.getId(), true);
        laundry.confirmMachineFree(manager.getUsername(), b.getId(), machines.get(0).id());
        var hold1 = allocation.activeHolds(manager.getUsername(), b.getId()).getFirst();
        allocation.confirmPhysicalCheck(r1.getUsername(), b.getId(), hold1.id());
        allocation.start(r1.getUsername(), b.getId(), hold1.id(), 20, WashCycle.HandoverMode.ALLOW_TRANSFER);
        // Machine 2: marked maintenance (must be excluded from ETA)
        laundry.setMaintenance(manager.getUsername(), b.getId(), machines.get(1).id(), true);
        // Machine 3: confirmed free and held by r2
        laundry.join(r2.getUsername(), b.getId(), true);
        laundry.confirmMachineFree(manager.getUsername(), b.getId(), machines.get(2).id());
        // rUnready joins unready (ahead of rTarget in queue, but not readyAhead)
        laundry.join(rUnready.getUsername(), b.getId(), false);
        laundry.join(rTarget.getUsername(), b.getId(), true);

        var estimate = eta.me(rTarget.getUsername(), b.getId());
        assertEquals("READY", estimate.state());
        assertEquals(2, estimate.rank());
        assertEquals(0, estimate.readyAhead());
        // Earliest slot among Machine 1 (NOW + 20m) and Machine 3 (held: NOW + 50m..55m+8m) is Machine 1 at NOW + 20m
        assertEquals(NOW.plusSeconds(20 * 60), estimate.rangeStart());
        assertEquals(NOW.plusSeconds(20 * 60), estimate.rangeEnd());
    }
}
