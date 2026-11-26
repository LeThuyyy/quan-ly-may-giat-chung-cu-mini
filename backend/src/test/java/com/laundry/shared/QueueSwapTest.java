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
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@TestPropertySource(properties="spring.datasource.url=jdbc:h2:mem:queue-swap-tests;DB_CLOSE_DELAY=-1")
class QueueSwapTest{
    @Autowired LaundryService laundry;@Autowired QueueSwapService swaps;@Autowired AccountRepository accounts;
    @Autowired MembershipRepository members;@Autowired QueueEntryRepository queue;@Autowired AllocationService allocation;
    @Autowired MemberAdministrationService admin;@Autowired QueueSwapRepository rows;@Autowired TestClock clock;
    @MockitoBean HoldExpiryJob holdJob;@MockitoBean WashDueJob washJob;
    @TestConfiguration static class Config{@Bean @Primary TestClock swapClock(){return new TestClock();}}
    static class TestClock extends Clock{volatile Instant time=Instant.parse("2026-11-25T00:00:00Z");public Instant instant(){return time;}public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}}
    @BeforeEach void reset(){clock.time=Instant.parse("2026-11-25T00:00:00Z");}
    Account user(){return accounts.save(new Account("swap-"+UUID.randomUUID(),"hash","Test"));}
    record Fixture(Account owner,Building building,List<Account> users,List<QueueEntry> entries,UUID machine){}
    Fixture setup(){
        Account owner=user();Building building=laundry.createBuilding(owner.getUsername(),"Tòa đổi lượt",1);
        List<Account> users=new ArrayList<>();List<QueueEntry> entries=new ArrayList<>();
        for(int i=0;i<4;i++){Account user=user();members.save(new Membership(building,user,Membership.Role.RESIDENT,Membership.Status.APPROVED));users.add(user);entries.add(laundry.join(user.getUsername(),building.getId(),i==1));}
        return new Fixture(owner,building,users,entries,laundry.view(owner.getUsername(),building.getId()).machines().getFirst().id());
    }
    List<UUID> order(Fixture f){return laundry.view(f.owner.getUsername(),f.building.getId()).queue().stream().map(LaundryService.QueueView::accountId).toList();}
    @Test void exchangesExactlyTwoKeysAndPreservesReadiness(){
        var f=setup();UUID b=f.building.getId();var invite=swaps.create(f.users.get(0).getUsername(),b,f.entries.get(3).getId());
        swaps.respond(f.users.get(3).getUsername(),b,invite.id(),"accept");
        assertEquals(List.of(f.users.get(3).getId(),f.users.get(1).getId(),f.users.get(2).getId(),f.users.get(0).getId()),order(f));
        assertFalse(queue.findById(f.entries.get(0).getId()).orElseThrow().isReady());
        assertTrue(queue.findById(f.entries.get(1).getId()).orElseThrow().isReady());
        assertEquals(4,queue.findById(f.entries.get(0).getId()).orElseThrow().getPosition());
        assertThrows(ResponseStatusException.class,()->swaps.respond(f.users.get(3).getUsername(),b,invite.id(),"accept"));
    }
    @Test void onlyOneOutgoingAndOnlyRecipientMayAcceptSenderMayCancel(){
        var f=setup();UUID b=f.building.getId();var invite=swaps.create(f.users.get(0).getUsername(),b,f.entries.get(2).getId());
        assertThrows(ResponseStatusException.class,()->swaps.create(f.users.get(0).getUsername(),b,f.entries.get(3).getId()));
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->swaps.respond(f.users.get(1).getUsername(),b,invite.id(),"accept")).getStatusCode());
        swaps.respond(f.users.get(0).getUsername(),b,invite.id(),"cancel");
        assertEquals(QueueSwapRequest.Status.CANCELLED,rows.findById(invite.id()).orElseThrow().getStatus());
        var another=swaps.create(f.users.get(0).getUsername(),b,f.entries.get(3).getId());swaps.respond(f.users.get(3).getUsername(),b,another.id(),"reject");
        assertEquals(QueueSwapRequest.Status.REJECTED,rows.findById(another.id()).orElseThrow().getStatus());
    }
    @Test void pendingOutgoingRemainsAccessibleBeyondFiftyNewerHistoryAndInboxRows(){
        var f=setup();UUID b=f.building.getId();Account actor=f.users.get(1);
        var sent=swaps.create(actor.getUsername(),b,f.entries.get(3).getId());
        for(int i=0;i<55;i++){
            clock.time=clock.time.plusSeconds(1);
            var incoming=swaps.create(f.users.get(0).getUsername(),b,f.entries.get(1).getId());
            swaps.respond(actor.getUsername(),b,incoming.id(),"reject");
        }
        clock.time=clock.time.plusSeconds(1);
        var newer=swaps.create(f.users.get(0).getUsername(),b,f.entries.get(1).getId());
        assertFalse(swaps.list(actor.getUsername(),b,0,50).items().stream().anyMatch(s->s.id().equals(sent.id())));
        assertEquals(sent.id(),swaps.outgoing(actor.getUsername(),b).getFirst().id());
        assertEquals(sent.id(),swaps.pending(actor.getUsername(),b,0,1).items().getFirst().id());
        assertTrue(swaps.pending(actor.getUsername(),b,0,1).hasNext());
        assertEquals(newer.id(),swaps.pending(actor.getUsername(),b,1,1).items().getFirst().id());
        Account outsider=user();assertThrows(ResponseStatusException.class,()->swaps.outgoing(outsider.getUsername(),b));
        clock.time=sent.expiresAt();
        assertTrue(swaps.outgoing(actor.getUsername(),b).isEmpty());
        assertEquals(newer.id(),swaps.pending(actor.getUsername(),b,0,20).items().getFirst().id());
        assertEquals(QueueSwapRequest.Status.PENDING,rows.findById(sent.id()).orElseThrow().getStatus());
    }
    @Test void exactDeadlineExpiresWithoutGetMutationAndAllowsNewInvitation(){
        var f=setup();UUID b=f.building.getId();var invite=swaps.create(f.users.get(0).getUsername(),b,f.entries.get(3).getId());
        clock.time=invite.expiresAt();
        assertEquals(QueueSwapRequest.Status.EXPIRED,swaps.list(f.users.get(0).getUsername(),b,0,20).items().getFirst().status());
        assertEquals(QueueSwapRequest.Status.PENDING,rows.findById(invite.id()).orElseThrow().getStatus());
        assertThrows(ResponseStatusException.class,()->swaps.respond(f.users.get(3).getUsername(),b,invite.id(),"accept"));
        swaps.create(f.users.get(0).getUsername(),b,f.entries.get(3).getId());
        assertEquals(QueueSwapRequest.Status.EXPIRED,rows.findById(invite.id()).orElseThrow().getStatus());
    }
    @Test void assignmentThenUnusableDoesNotReviveOldInvite(){
        var f=setup();UUID b=f.building.getId();var invite=swaps.create(f.users.get(1).getUsername(),b,f.entries.get(3).getId());
        laundry.confirmMachineFree(f.owner.getUsername(),b,f.machine);var hold=allocation.activeHolds(f.owner.getUsername(),b).getFirst();
        assertEquals(f.users.get(1).getId(),hold.accountId());
        allocation.reportUnusable(f.users.get(1).getUsername(),b,hold.id());
        assertEquals(QueueSwapRequest.Status.INVALIDATED,rows.findById(invite.id()).orElseThrow().getStatus());
        assertThrows(ResponseStatusException.class,()->swaps.respond(f.users.get(3).getUsername(),b,invite.id(),"accept"));
        assertEquals(f.entries.get(1).getPosition(),queue.findById(f.entries.get(1).getId()).orElseThrow().getPosition());
    }
    @Test void leaveRemovalAndChangedOrderingInvalidateAffectedInvites(){
        var f=setup();UUID b=f.building.getId();var invite=swaps.create(f.users.get(0).getUsername(),b,f.entries.get(3).getId());
        laundry.leave(f.users.get(3).getUsername(),b);assertEquals(QueueSwapRequest.Status.INVALIDATED,rows.findById(invite.id()).orElseThrow().getStatus());
        var removed=swaps.create(f.users.get(0).getUsername(),b,f.entries.get(2).getId());admin.remove(f.owner.getUsername(),b,f.users.get(2).getId());
        assertEquals(QueueSwapRequest.Status.INVALIDATED,rows.findById(removed.id()).orElseThrow().getStatus());
    }
    @Test void acceptingOtherSwapInvalidatesInvitationWhoseSenderIsNoLongerAhead(){
        var f=setup();UUID b=f.building.getId();
        var stale=swaps.create(f.users.get(1).getUsername(),b,f.entries.get(2).getId());
        var crossing=swaps.create(f.users.get(0).getUsername(),b,f.entries.get(2).getId());
        swaps.respond(f.users.get(2).getUsername(),b,crossing.id(),"accept");
        assertEquals(QueueSwapRequest.Status.INVALIDATED,rows.findById(stale.id()).orElseThrow().getStatus());
        assertEquals(List.of(f.users.get(2).getId(),f.users.get(1).getId(),f.users.get(0).getId(),f.users.get(3).getId()),order(f));
    }
    @Test void duplicateConcurrentAcceptSwapsOnlyOnce()throws Exception{
        var f=setup();UUID b=f.building.getId();var invite=swaps.create(f.users.get(0).getUsername(),b,f.entries.get(3).getId());
        var wins=new java.util.concurrent.atomic.AtomicInteger();
        Runnable accept=()->{try{swaps.respond(f.users.get(3).getUsername(),b,invite.id(),"accept");wins.incrementAndGet();}catch(ResponseStatusException e){assertEquals(HttpStatus.CONFLICT,e.getStatusCode());}};
        CountDownLatch ready=new CountDownLatch(2),start=new CountDownLatch(1);var workers=Executors.newFixedThreadPool(2);
        try{var left=workers.submit(()->{ready.countDown();start.await();accept.run();return null;});var right=workers.submit(()->{ready.countDown();start.await();accept.run();return null;});
            assertTrue(ready.await(5,TimeUnit.SECONDS));start.countDown();left.get(10,TimeUnit.SECONDS);right.get(10,TimeUnit.SECONDS);
        }finally{start.countDown();workers.shutdownNow();assertTrue(workers.awaitTermination(5,TimeUnit.SECONDS));}
        assertEquals(1,wins.get());assertEquals(f.users.get(3).getId(),order(f).getFirst());assertEquals(f.users.get(0).getId(),order(f).getLast());
    }
    @Test void acceptRacingDispatchDoesNotDuplicateOrChangeHeldKey()throws Exception{
        var f=setup();UUID b=f.building.getId();var invite=swaps.create(f.users.get(0).getUsername(),b,f.entries.get(1).getId());
        CountDownLatch ready=new CountDownLatch(2),start=new CountDownLatch(1);var workers=Executors.newFixedThreadPool(2);
        try{
            var a=workers.submit(()->{ready.countDown();start.await();try{swaps.respond(f.users.get(1).getUsername(),b,invite.id(),"accept");}catch(ResponseStatusException e){assertEquals(HttpStatus.CONFLICT,e.getStatusCode());}return null;});
            var d=workers.submit(()->{ready.countDown();start.await();laundry.confirmMachineFree(f.owner.getUsername(),b,f.machine);return null;});
            assertTrue(ready.await(5,TimeUnit.SECONDS));start.countDown();a.get(10,TimeUnit.SECONDS);d.get(10,TimeUnit.SECONDS);
        }finally{start.countDown();workers.shutdownNow();assertTrue(workers.awaitTermination(5,TimeUnit.SECONDS));}
        var holds=allocation.activeHolds(f.owner.getUsername(),b);assertEquals(1,holds.size());assertEquals(f.users.get(1).getId(),holds.getFirst().accountId());
        assertTrue(Set.of(QueueSwapRequest.Status.ACCEPTED,QueueSwapRequest.Status.INVALIDATED).contains(rows.findById(invite.id()).orElseThrow().getStatus()));
        assertEquals(3,laundry.view(f.owner.getUsername(),b).queue().size());
    }

    @Test void acceptRacingMemberRemovalSerializesSafelyUnderBuildingLock() throws Exception {
        var f = setup();
        UUID b = f.building.getId();
        var invite = swaps.create(f.users.get(0).getUsername(), b, f.entries.get(2).getId());
        CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        var workers = Executors.newFixedThreadPool(2);
        try {
            var acceptWorker = workers.submit(() -> {
                ready.countDown();
                start.await();
                try {
                    swaps.respond(f.users.get(2).getUsername(), b, invite.id(), "accept");
                } catch (ResponseStatusException e) {
                    assertTrue(Set.of(HttpStatus.CONFLICT, HttpStatus.FORBIDDEN).contains(e.getStatusCode()));
                }
                return null;
            });
            var removeWorker = workers.submit(() -> {
                ready.countDown();
                start.await();
                admin.remove(f.owner.getUsername(), b, f.users.get(0).getId());
                return null;
            });
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();
            acceptWorker.get(10, TimeUnit.SECONDS);
            removeWorker.get(10, TimeUnit.SECONDS);
        } finally {
            start.countDown();
            workers.shutdownNow();
            assertTrue(workers.awaitTermination(5, TimeUnit.SECONDS));
        }
        assertEquals(Membership.Status.REMOVED, members.findByBuilding_IdAndAccount_Id(b, f.users.get(0).getId()).orElseThrow().getStatus());
        assertEquals(QueueEntry.State.LEFT, queue.findById(f.entries.get(0).getId()).orElseThrow().getState());
        assertNotEquals(QueueSwapRequest.Status.PENDING, rows.findById(invite.id()).orElseThrow().getStatus());
    }
}
