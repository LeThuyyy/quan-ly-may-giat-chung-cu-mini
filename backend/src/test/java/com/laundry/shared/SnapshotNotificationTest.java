package com.laundry.shared;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.Instant;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@TestPropertySource(properties="spring.datasource.url=jdbc:h2:mem:snapshot-notifications;DB_CLOSE_DELAY=-1")
@Transactional
class SnapshotNotificationTest {
 @Autowired SnapshotNotificationService facts;@Autowired OperationalSnapshotService snapshots;
 @Autowired LaundryService laundry;@Autowired AllocationService allocation;@Autowired QueueSwapService swaps;
 @Autowired AccountRepository accounts;@Autowired MembershipRepository members;@Autowired MachineHoldRepository holds;
 @Autowired ActivityRepository audit;@Autowired JdbcTemplate jdbc;
 Account account(){return accounts.save(new Account("notify-"+UUID.randomUUID(),"hash","Test"));}
 Account resident(Building building){Account actor=account();members.save(new Membership(building,actor,Membership.Role.RESIDENT,Membership.Status.APPROVED));return actor;}
 @Test void reportsOnlyOwnActualHoldLifecycleAndDoesNotInventExpiry(){
  Account owner=account();Building building=laundry.createBuilding(owner.getUsername(),"Thông báo",1);Account a=resident(building),b=resident(building);
  UUID id=building.getId(),machine=laundry.view(owner.getUsername(),id).machines().getFirst().id();
  laundry.join(a.getUsername(),id,true);laundry.confirmMachineFree(owner.getUsername(),id,machine);
  var hold=facts.get(a.getUsername(),id).latestHold();assertNotNull(hold);assertEquals(MachineHold.Status.ACTIVE,hold.status());
  assertNull(facts.get(b.getUsername(),id).latestHold());
  jdbc.update("update machine_holds set expires_at=? where id=?",java.sql.Timestamp.from(Instant.now().minusSeconds(1)),hold.id());
  // Refresh the managed hold because this test changes it directly through JDBC.
  entityManager.clear();long count=audit.count();
  assertEquals(MachineHold.Status.ACTIVE,facts.get(a.getUsername(),id).latestHold().status());assertEquals(count,audit.count());
  allocation.expire(id);assertEquals(MachineHold.Status.EXPIRED,facts.get(a.getUsername(),id).latestHold().status());
  laundry.join(a.getUsername(),id,true);var next=facts.get(a.getUsername(),id).latestHold();assertNotEquals(hold.id(),next.id());
  allocation.yield(a.getUsername(),id,next.id());assertEquals(MachineHold.Status.YIELDED,facts.get(a.getUsername(),id).latestHold().status());
 }
 @Autowired jakarta.persistence.EntityManager entityManager;
 @Test void includesRealIncomingAndOutgoingResponseScopedToAccountAndBuilding(){
  Account owner=account();Building building=laundry.createBuilding(owner.getUsername(),"Đổi lượt",1);Account a=resident(building),b=resident(building),c=resident(building);
  var first=laundry.join(a.getUsername(),building.getId(),false);var second=laundry.join(b.getUsername(),building.getId(),false);
  var invitation=swaps.create(a.getUsername(),building.getId(),second.getId());
  assertEquals(invitation.id(),facts.get(b.getUsername(),building.getId()).incomingSwaps().getFirst().id());
  assertTrue(facts.get(a.getUsername(),building.getId()).incomingSwaps().isEmpty());
  assertTrue(facts.get(c.getUsername(),building.getId()).incomingSwaps().isEmpty());
  swaps.respond(b.getUsername(),building.getId(),invitation.id(),"reject");
  var result=snapshots.get(a.getUsername(),building.getId());assertEquals(QueueSwapRequest.Status.REJECTED,result.notifications().outgoingResponses().getFirst().status());
  assertTrue(facts.get(b.getUsername(),building.getId()).incomingSwaps().isEmpty());
  Building other=laundry.createBuilding(owner.getUsername(),"Khác",1);members.save(new Membership(other,a,Membership.Role.RESIDENT,Membership.Status.APPROVED));
  assertTrue(facts.get(a.getUsername(),other.getId()).outgoingResponses().isEmpty());
 }
 @Test void outsiderAndPendingCannotReadNotificationFacts(){
  Account owner=account(),outsider=account();Building building=laundry.createBuilding(owner.getUsername(),"Quyền",1);
  assertThrows(ResponseStatusException.class,()->facts.get(outsider.getUsername(),building.getId()));
  members.save(new Membership(building,outsider,Membership.Role.RESIDENT,Membership.Status.PENDING));
  assertThrows(ResponseStatusException.class,()->snapshots.get(outsider.getUsername(),building.getId()));
 }
}
