package com.laundry.shared;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.*;
import java.util.UUID;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@TestPropertySource(properties="spring.datasource.url=jdbc:h2:mem:admin-expansion;DB_CLOSE_DELAY=-1")
class BuildingAdministrationTest {
    @Autowired LaundryService laundry;
    @Autowired AllocationService allocation;
    @Autowired WashService wash;
    @Autowired InvitationService invitations;
    @Autowired MemberAdministrationService admin;
    @Autowired ActivityService activity;
    @Autowired ActivityRepository events;
    @Autowired MembershipRepository memberships;
    @Autowired MachineHoldRepository holds;
    @Autowired AccountRepository accounts;
    @Autowired QueueStatusService statuses;
    @Autowired InvitationRepository invitationRows;
    @Autowired InvitationMetadataMigration migration;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired TestClock clock;
    @MockitoBean HoldExpiryJob holdJob;
    @MockitoBean WashDueJob dueJob;
    @TestConfiguration static class Config { @Bean @Primary TestClock adminClock(){return new TestClock();} }
    static class TestClock extends Clock {
        volatile Instant time=Instant.parse("2026-11-25T00:00:00Z");
        @Override public Instant instant(){return time;}
        @Override public ZoneId getZone(){return ZoneOffset.UTC;}
        @Override public Clock withZone(ZoneId zone){return this;}
    }
    @BeforeEach void reset(){clock.time=Instant.parse("2026-11-25T00:00:00Z");}
    Account account(){return accounts.save(new Account("admin-test-"+UUID.randomUUID(),"hash","Test"));}
    record Fixture(Account owner,Account resident,Account next,Building building,UUID machine){}
    Fixture fixture(){
        Account owner=account(),resident=account(),next=account();
        Building building=laundry.createBuilding(owner.getUsername(),"Tòa quản trị",1);
        memberships.save(new Membership(building,resident,Membership.Role.RESIDENT,Membership.Status.APPROVED));
        memberships.save(new Membership(building,next,Membership.Role.RESIDENT,Membership.Status.APPROVED));
        UUID machine=laundry.view(owner.getUsername(),building.getId()).machines().getFirst().id();
        return new Fixture(owner,resident,next,building,machine);
    }
    void error(HttpStatus status,Runnable action){assertEquals(status,assertThrows(ResponseStatusException.class,action::run).getStatusCode());}

    @Test void removingWaitingMemberBlocksAccessAndTokenRejoinUntilRestoreAndApproval(){
        var f=fixture(); UUID b=f.building.getId(); String token=invitations.create(f.owner.getUsername(),b);
        laundry.join(f.resident.getUsername(),b,false);
        admin.remove(f.owner.getUsername(),b,f.resident.getId());
        assertTrue(laundry.view(f.owner.getUsername(),b).queue().isEmpty());
        assertTrue(laundry.myBuildings(f.resident.getUsername()).isEmpty());
        error(HttpStatus.FORBIDDEN,()->laundry.view(f.resident.getUsername(),b));
        error(HttpStatus.FORBIDDEN,()->invitations.request(f.resident.getUsername(),token));
        long before=events.count(); admin.remove(f.owner.getUsername(),b,f.resident.getId()); assertEquals(before,events.count());
        assertEquals(f.resident.getId(),admin.removed(f.owner.getUsername(),b,0,20).items().getFirst().id());
        admin.restore(f.owner.getUsername(),b,f.resident.getId());
        assertEquals(Membership.Status.PENDING,memberships.findByBuilding_IdAndAccount_Id(b,f.resident.getId()).orElseThrow().getStatus());
        error(HttpStatus.FORBIDDEN,()->laundry.join(f.resident.getUsername(),b,true));
        invitations.approve(f.owner.getUsername(),b,f.resident.getId());
        laundry.join(f.resident.getUsername(),b,false);
        assertEquals(QueueStatusService.State.WAITING,statuses.current(f.resident.getUsername(),b).state());
    }
    @Test void removingHeldMemberClosesHoldAndDispatchesToNext(){
        var f=fixture();UUID b=f.building.getId();
        laundry.join(f.resident.getUsername(),b,true);laundry.join(f.next.getUsername(),b,true);
        laundry.confirmMachineFree(f.owner.getUsername(),b,f.machine);
        UUID old=statuses.current(f.resident.getUsername(),b).holdId();
        admin.remove(f.owner.getUsername(),b,f.resident.getId());
        assertEquals(MachineHold.Status.MEMBER_REMOVED,holds.findById(old).orElseThrow().getStatus());
        assertEquals(QueueStatusService.State.HELD,statuses.current(f.next.getUsername(),b).state());
        error(HttpStatus.FORBIDDEN,()->allocation.confirmPhysicalCheck(f.resident.getUsername(),b,old));
    }
    @Test void cannotRemoveUnfinishedWashSelfOrManager(){
        var f=fixture();UUID b=f.building.getId();
        error(HttpStatus.CONFLICT,()->admin.remove(f.owner.getUsername(),b,f.owner.getId()));
        invitations.updateRole(f.owner.getUsername(),b,f.next.getId(),Membership.Role.MANAGER);
        error(HttpStatus.CONFLICT,()->admin.remove(f.owner.getUsername(),b,f.next.getId()));
        laundry.join(f.resident.getUsername(),b,true);laundry.confirmMachineFree(f.owner.getUsername(),b,f.machine);
        UUID hold=statuses.current(f.resident.getUsername(),b).holdId();
        allocation.confirmPhysicalCheck(f.resident.getUsername(),b,hold);
        var cycle=allocation.start(f.resident.getUsername(),b,hold,1,WashCycle.HandoverMode.ALLOW_TRANSFER);
        error(HttpStatus.CONFLICT,()->admin.remove(f.owner.getUsername(),b,f.resident.getId()));
        assertEquals(Membership.Status.APPROVED,memberships.findByBuilding_IdAndAccount_Id(b,f.resident.getId()).orElseThrow().getStatus());
        wash.pickup(f.resident.getUsername(),b,cycle.getId(),true);
        admin.remove(f.owner.getUsername(),b,f.resident.getId());
    }
    @Test void revokeOneLinkIsIdempotentPreservesPendingAndOtherLinksAndDoesNotExposeHash(){
        var f=fixture();UUID b=f.building.getId();
        String first=invitations.create(f.owner.getUsername(),b),second=invitations.create(f.owner.getUsername(),b);
        var list=invitations.list(f.owner.getUsername(),b,0,20);assertEquals(2,list.items().size());
        // Identify the token row privately in the test, not through a public DTO.
        var row=invitationRows.findWithBuildingByTokenHash(hash(first)).orElseThrow();
        Account applicant=account();invitations.request(applicant.getUsername(),first);
        invitations.revoke(f.owner.getUsername(),b,row.getManagementId());long count=events.count();
        invitations.revoke(f.owner.getUsername(),b,row.getManagementId());assertEquals(count,events.count());
        error(HttpStatus.GONE,()->invitations.request(account().getUsername(),first));
        assertEquals(Membership.Status.PENDING,memberships.findByBuilding_IdAndAccount_Id(b,applicant.getId()).orElseThrow().getStatus());
        assertEquals(Membership.Status.PENDING,invitations.request(account().getUsername(),second).status());
        assertTrue(invitations.list(f.owner.getUsername(),b,0,20).items().stream().anyMatch(i->i.status().equals("REVOKED")));
        error(HttpStatus.FORBIDDEN,()->invitations.list(f.resident.getUsername(),b,0,20));
        error(HttpStatus.BAD_REQUEST,()->invitations.list(f.owner.getUsername(),b,0,51));
    }
    @Test void expirationUsesClockAndMetadataBackfillPreservesLegacyToken(){
        var f=fixture();UUID b=f.building.getId();String token=invitations.create(f.owner.getUsername(),b);
        jdbc.update("update invitations set management_id=null,created_at=null where token_hash=?",hash(token));
        migration.run(null);
        var updated=invitationRows.findWithBuildingByTokenHash(hash(token)).orElseThrow();assertNotNull(updated.getManagementId());
        clock.time=updated.getExpiresAt().minusNanos(1);
        assertEquals(Membership.Status.PENDING,invitations.request(account().getUsername(),token).status());
        clock.time=updated.getExpiresAt();error(HttpStatus.GONE,()->invitations.request(account().getUsername(),token));
        assertEquals("EXPIRED",invitations.list(f.owner.getUsername(),b,0,20).items().getFirst().status());
    }
    @Test void failedTransactionRollsBackAuditAndNinetyDayCutoffIsEnforced(){
        var f=fixture();UUID b=f.building.getId();long count=events.count();
        assertThrows(IllegalStateException.class,()->new TransactionTemplate(transactions).execute(tx->{
            activity.record(b,f.owner.getId(),"TEST_ROLLBACK",null,null,"OLD","NEW");throw new IllegalStateException("rollback");
        }));assertEquals(count,events.count());
        error(HttpStatus.FORBIDDEN,()->activity.list(f.resident.getUsername(),b,0,20,null,null));
        assertFalse(activity.list(f.owner.getUsername(),b,0,20,null,null).items().isEmpty());
        clock.time=clock.instant().plus(Duration.ofDays(90));
        assertTrue(activity.list(f.owner.getUsername(),b,0,20,null,null).items().isEmpty());
        activity.cleanup();
        assertTrue(activity.list(f.owner.getUsername(),b,0,20,null,null).items().isEmpty());
    }
    @Test void concurrentRevokeAndJoinSerializeAndRemovedStartCannotWinAfterRemoval() throws Exception {
        var f=fixture();UUID b=f.building.getId();String token=invitations.create(f.owner.getUsername(),b);
        UUID invitationId=invitationRows.findWithBuildingByTokenHash(hash(token)).orElseThrow().getManagementId();Account applicant=account();
        race(()->invitations.revoke(f.owner.getUsername(),b,invitationId),()->{
            try{invitations.request(applicant.getUsername(),token);}catch(ResponseStatusException e){assertEquals(HttpStatus.GONE,e.getStatusCode());}
        });
        error(HttpStatus.GONE,()->invitations.request(account().getUsername(),token));
        laundry.join(f.resident.getUsername(),b,true);laundry.confirmMachineFree(f.owner.getUsername(),b,f.machine);
        UUID hold=statuses.current(f.resident.getUsername(),b).holdId();allocation.confirmPhysicalCheck(f.resident.getUsername(),b,hold);
        race(()->{try{admin.remove(f.owner.getUsername(),b,f.resident.getId());}catch(ResponseStatusException e){assertEquals(HttpStatus.CONFLICT,e.getStatusCode());}},
            ()->{try{allocation.start(f.resident.getUsername(),b,hold,1,WashCycle.HandoverMode.ALLOW_TRANSFER);}catch(ResponseStatusException e){assertEquals(HttpStatus.FORBIDDEN,e.getStatusCode());}});
        var member=memberships.findByBuilding_IdAndAccount_Id(b,f.resident.getId()).orElseThrow();
        if(member.getStatus()==Membership.Status.REMOVED) assertEquals(MachineHold.Status.MEMBER_REMOVED,holds.findById(hold).orElseThrow().getStatus());
        else assertEquals(QueueStatusService.State.WASHING,statuses.current(f.resident.getUsername(),b).state());
    }
    private String hash(String token){try{return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(token.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(Exception e){throw new AssertionError(e);}}
    private void race(Runnable first,Runnable second)throws Exception{
        CountDownLatch ready=new CountDownLatch(2),start=new CountDownLatch(1);var executor=Executors.newFixedThreadPool(2);
        try{var a=executor.submit(()->{ready.countDown();start.await();first.run();return null;});var b=executor.submit(()->{ready.countDown();start.await();second.run();return null;});
            assertTrue(ready.await(5,TimeUnit.SECONDS));start.countDown();a.get(10,TimeUnit.SECONDS);b.get(10,TimeUnit.SECONDS);
        }finally{start.countDown();executor.shutdownNow();assertTrue(executor.awaitTermination(5,TimeUnit.SECONDS));}
    }
}
