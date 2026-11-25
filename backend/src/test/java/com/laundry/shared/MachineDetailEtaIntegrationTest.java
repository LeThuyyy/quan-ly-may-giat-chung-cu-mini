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
}
