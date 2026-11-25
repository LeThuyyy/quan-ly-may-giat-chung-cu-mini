package com.laundry.shared;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.*;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@TestPropertySource(properties="spring.datasource.url=jdbc:h2:mem:chat-tests;DB_CLOSE_DELAY=-1")
class ChatServiceTest {
    @Autowired ChatService chat;
    @Autowired LaundryService laundry;
    @Autowired AccountRepository accounts;
    @Autowired MembershipRepository members;
    @Autowired MemberAdministrationService admin;
    @Autowired ChatMessageRepository messages;
    @Autowired ChatReportRepository reports;
    @Autowired ChatRetentionJob retention;
    @Autowired ActivityRepository events;
    @Autowired TestClock clock;
    @MockitoBean HoldExpiryJob holdJob;
    @MockitoBean WashDueJob washJob;
    @TestConfiguration static class Config { @Bean @Primary TestClock chatClock(){return new TestClock();} }
    static class TestClock extends Clock {
        Instant now=Instant.parse("2026-11-25T00:00:00Z");
        public Instant instant(){return now;} public ZoneId getZone(){return ZoneOffset.UTC;} public Clock withZone(ZoneId z){return this;}
    }
    Account owner,resident,pending; UUID building;
    @BeforeEach void setup(){
        clock.now=Instant.parse("2026-11-25T00:00:00Z");
        owner=account();resident=account();pending=account();
        var b=laundry.createBuilding(owner.getUsername(),"Chat",1);building=b.getId();
        members.save(new Membership(b,resident,Membership.Role.RESIDENT,Membership.Status.APPROVED));
        members.save(new Membership(b,pending,Membership.Role.RESIDENT,Membership.Status.PENDING));
    }
    Account account(){return accounts.save(new Account("chat-"+UUID.randomUUID(),"hash","Name"));}
    void error(HttpStatus status,Runnable action){assertEquals(status,assertThrows(ResponseStatusException.class,action::run).getStatusCode());}
    ChatService.MessageView post(){return chat.post(resident.getUsername(),building,UUID.randomUUID()," hi ");}
    @Test void duplicateCooldownAndBoundary(){
        UUID request=UUID.randomUUID(); var first=chat.post(resident.getUsername(),building,request," text ");
        long audit=events.count(); assertEquals("text",first.body());assertEquals(clock.now,first.sentAt());
        assertEquals(first.id(),chat.post(resident.getUsername(),building,request,"different").id());
        error(HttpStatus.TOO_MANY_REQUESTS,()->post());assertEquals(audit,events.count());
        clock.now=clock.now.plusSeconds(5);assertNotEquals(first.id(),post().id());
        error(HttpStatus.BAD_REQUEST,()->chat.post(resident.getUsername(),building,UUID.randomUUID(),"x".repeat(1001)));
        error(HttpStatus.BAD_REQUEST,()->chat.post(resident.getUsername(),building,UUID.randomUUID(),"  "));
    }
    @Test void concurrentPostsEnforceCooldownAndDuplicateRequestId()throws Exception{
        var wins=new java.util.concurrent.atomic.AtomicInteger();var limited=new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.Callable<Void> post=()->{try{chat.post(resident.getUsername(),building,UUID.randomUUID(),"concurrent");wins.incrementAndGet();}
            catch(ResponseStatusException e){assertEquals(HttpStatus.TOO_MANY_REQUESTS,e.getStatusCode());limited.incrementAndGet();}return null;};
        race(post,post);assertEquals(1,wins.get());assertEquals(1,limited.get());
        clock.now=clock.now.plusSeconds(5);UUID request=UUID.randomUUID();
        var ids=java.util.Collections.synchronizedSet(new java.util.HashSet<UUID>());
        java.util.concurrent.Callable<Void> duplicate=()->{ids.add(chat.post(resident.getUsername(),building,request,"same").id());return null;};
        race(duplicate,duplicate);assertEquals(1,ids.size());assertEquals(2,chat.list(owner.getUsername(),building,0,20).items().size());
    }
    private void race(java.util.concurrent.Callable<Void> first,java.util.concurrent.Callable<Void> second)throws Exception{
        var ready=new java.util.concurrent.CountDownLatch(2);var start=new java.util.concurrent.CountDownLatch(1);var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        try{var a=pool.submit(()->{ready.countDown();start.await();return first.call();});var b=pool.submit(()->{ready.countDown();start.await();return second.call();});
            assertTrue(ready.await(5,java.util.concurrent.TimeUnit.SECONDS));start.countDown();a.get(10,java.util.concurrent.TimeUnit.SECONDS);b.get(10,java.util.concurrent.TimeUnit.SECONDS);
        }finally{start.countDown();pool.shutdownNow();assertTrue(pool.awaitTermination(5,java.util.concurrent.TimeUnit.SECONDS));}
    }
    @Test void reportOnceNoAutoHideAndManagerTombstone(){
        var msg=post();long audit=events.count();
        var report=chat.report(owner.getUsername(),building,msg.id(),ChatReport.Reason.SPAM);
        assertEquals(report.id(),chat.report(owner.getUsername(),building,msg.id(),ChatReport.Reason.ABUSE).id());
        assertEquals(audit+1,events.count());assertEquals("hi",chat.list(resident.getUsername(),building,0,10).items().getFirst().body());
        error(HttpStatus.FORBIDDEN,()->chat.hide(resident.getUsername(),building,msg.id(),ChatReport.Reason.SPAM));
        assertNull(chat.hide(owner.getUsername(),building,msg.id(),ChatReport.Reason.SPAM).body());
        var hidden=chat.list(resident.getUsername(),building,0,10).items().getFirst();assertNull(hidden.body());assertNotNull(hidden.hiddenAt());
        assertEquals(1,chat.reports(owner.getUsername(),building,0,10).items().size());
        audit=events.count();chat.hide(owner.getUsername(),building,msg.id(),ChatReport.Reason.OTHER);assertEquals(audit,events.count());
    }
    @Test void pendingRemovedManagerAndCrossBuildingChecks(){
        var msg=post();
        error(HttpStatus.FORBIDDEN,()->chat.list(pending.getUsername(),building,0,10));
        error(HttpStatus.FORBIDDEN,()->chat.post(pending.getUsername(),building,UUID.randomUUID(),"no"));
        error(HttpStatus.FORBIDDEN,()->chat.reports(resident.getUsername(),building,0,10));
        var other=laundry.createBuilding(owner.getUsername(),"Other",1).getId();
        error(HttpStatus.NOT_FOUND,()->chat.hide(owner.getUsername(),other,msg.id(),ChatReport.Reason.OTHER));
        error(HttpStatus.NOT_FOUND,()->chat.report(owner.getUsername(),other,msg.id(),ChatReport.Reason.OTHER));
        admin.remove(owner.getUsername(),building,resident.getId());
        error(HttpStatus.FORBIDDEN,()->chat.list(resident.getUsername(),building,0,10));
        error(HttpStatus.FORBIDDEN,()->chat.post(resident.getUsername(),building,UUID.randomUUID(),"no"));
        error(HttpStatus.FORBIDDEN,()->chat.report(resident.getUsername(),building,msg.id(),ChatReport.Reason.OTHER));
    }
    @Test void cleanupLimitsEachBatch(){
        Instant old=clock.now.minus(Duration.ofDays(31));
        for(int i=0;i<105;i++) {
            var row=messages.save(new ChatMessage(building,resident,UUID.randomUUID(),"expired",old));
            reports.save(new ChatReport(building,row.getId(),owner.getId(),ChatReport.Reason.SPAM,old));
        }
        long beforeMessages=messages.count(),beforeReports=reports.count();
        retention.cleanup();
        assertEquals(beforeMessages-100,messages.count());assertEquals(beforeReports-100,reports.count());
        retention.cleanup();assertTrue(chat.list(owner.getUsername(),building,0,10).items().isEmpty());
    }
    @Test void cutoffAndBoundedRetention(){
        var msg=post();clock.now=clock.now.plus(Duration.ofDays(29));
        chat.report(owner.getUsername(),building,msg.id(),ChatReport.Reason.OTHER);
        clock.now=clock.now.plus(Duration.ofDays(1));
        assertTrue(chat.list(owner.getUsername(),building,0,10).items().isEmpty());
        assertTrue(chat.reports(owner.getUsername(),building,0,10).items().isEmpty());
        error(HttpStatus.NOT_FOUND,()->chat.hide(owner.getUsername(),building,msg.id(),ChatReport.Reason.OTHER));
        retention.cleanup(); assertFalse(messages.existsById(msg.id()));assertTrue(reports.findByMessageIdAndReporterId(msg.id(),owner.getId()).isEmpty());
        error(HttpStatus.BAD_REQUEST,()->chat.list(owner.getUsername(),building,0,51));
    }
}
