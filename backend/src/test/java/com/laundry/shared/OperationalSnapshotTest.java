package com.laundry.shared;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@TestPropertySource(properties="spring.datasource.url=jdbc:h2:mem:operational-snapshot;DB_CLOSE_DELAY=-1")
@Transactional
class OperationalSnapshotTest {
 @Autowired OperationalSnapshotService snapshots;@Autowired LaundryService laundry;@Autowired AllocationService allocation;
 @Autowired AccountRepository accounts;@Autowired MembershipRepository members;@Autowired MachineHoldRepository holds;@Autowired ActivityRepository events;
 private Account user(){return accounts.save(new Account("snapshot-"+UUID.randomUUID(),"hash","Test"));}
 @Test void coherentHeldAndWashingSnapshotsHaveNoWriteSideEffects(){
  Account owner=user(),resident=user();var b=laundry.createBuilding(owner.getUsername(),"Snapshot",1);members.save(new Membership(b,resident,Membership.Role.RESIDENT,Membership.Status.APPROVED));
  var entry=laundry.join(resident.getUsername(),b.getId(),true);var machine=laundry.view(owner.getUsername(),b.getId()).machines().getFirst();
  laundry.confirmMachineFree(owner.getUsername(),b.getId(),machine.id());long holdCount=holds.count(),eventCount=events.count();
  var s=snapshots.get(resident.getUsername(),b.getId());assertEquals(QueueStatusService.State.HELD,s.queueStatus().state());assertEquals(entry.getId(),s.queueStatus().queueEntryId());
  assertEquals(1,s.holds().size());assertEquals(s.queueStatus().holdId(),s.holds().getFirst().id());assertTrue(s.building().queue().isEmpty());assertTrue(s.myCycles().isEmpty());assertNull(s.previousCycle());
  assertEquals(s.serverNow(),s.queueStatus().serverNow());assertEquals(s.serverNow(),s.eta().serverNow());assertEquals(holdCount,holds.count());assertEquals(eventCount,events.count());
  allocation.confirmPhysicalCheck(resident.getUsername(),b.getId(),s.queueStatus().holdId());allocation.start(resident.getUsername(),b.getId(),s.queueStatus().holdId(),1,WashCycle.HandoverMode.ALLOW_TRANSFER);
  var washing=snapshots.get(resident.getUsername(),b.getId());assertEquals(QueueStatusService.State.WASHING,washing.queueStatus().state());assertTrue(washing.holds().isEmpty());assertEquals(1,washing.myCycles().size());
 }
 @Test void outsiderAndPendingCannotReadSnapshot(){Account owner=user(),outsider=user();var b=laundry.createBuilding(owner.getUsername(),"Forbidden",1);
  assertThrows(ResponseStatusException.class,()->snapshots.get(outsider.getUsername(),b.getId()));members.save(new Membership(b,outsider,Membership.Role.RESIDENT,Membership.Status.PENDING));
  assertThrows(ResponseStatusException.class,()->snapshots.get(outsider.getUsername(),b.getId()));
 }
}
