package com.laundry.shared;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:laundry-test;DB_CLOSE_DELAY=-1")
@Transactional
class LaundryServiceTest {
    @Autowired LaundryService service;
    @Autowired AccountRepository accounts;
    @Autowired MembershipRepository memberships;
    @Autowired InvitationService invitations;

    private Account account(String name) {
        return accounts.save(new Account(name + UUID.randomUUID(), "test-hash", name));
    }

    @Test void managerChoosesMachineCountForEachBuilding() {
        Account manager = account("manager");
        Building a = service.createBuilding(manager.getUsername(), "Tòa A", 1);
        Building b = service.createBuilding(manager.getUsername(), "Tòa B", 4);
        assertEquals(1, service.view(manager.getUsername(), a.getId()).machines().size());
        assertEquals(4, service.view(manager.getUsername(), b.getId()).machines().size());
        service.addMachine(manager.getUsername(), a.getId(), "Máy mới");
        assertEquals(2, service.view(manager.getUsername(), a.getId()).machines().size());
        assertEquals(4, service.view(manager.getUsername(), b.getId()).machines().size());
        assertThrows(ResponseStatusException.class, () -> service.createBuilding(manager.getUsername(), "Sai", 0));
        assertThrows(ResponseStatusException.class, () -> service.createBuilding(manager.getUsername(), "Sai", 31));
    }

    @Test void residentNeedsApprovalAndCannotChangeMachines() {
        Account owner = account("owner");
        Account resident = account("resident");
        Building building = service.createBuilding(owner.getUsername(), "Tòa A", 2);
        assertThrows(ResponseStatusException.class, () -> service.view(resident.getUsername(), building.getId()));
        memberships.save(new Membership(building, resident, Membership.Role.RESIDENT, Membership.Status.PENDING));
        assertThrows(ResponseStatusException.class, () -> service.join(resident.getUsername(), building.getId(), true));
        Membership membership = memberships.findByBuilding_IdAndAccount_Id(building.getId(), resident.getId()).orElseThrow();
        membership.approve();
        service.join(resident.getUsername(), building.getId(), false);
        assertFalse(service.view(resident.getUsername(), building.getId()).queue().getFirst().ready());
        service.setReady(resident.getUsername(), building.getId(), true);
        assertTrue(service.view(resident.getUsername(), building.getId()).queue().getFirst().ready());
        assertThrows(ResponseStatusException.class, () -> service.addMachine(resident.getUsername(), building.getId(), "Máy 3"));
        service.leave(resident.getUsername(), building.getId());
        assertTrue(service.view(resident.getUsername(), building.getId()).queue().isEmpty());
    }

    @Test void inviteRequiresManagerAndResidentApproval() {
        Account owner = account("owner");
        Account resident = account("resident");
        Building building = service.createBuilding(owner.getUsername(), "Tòa A", 2);
        assertThrows(ResponseStatusException.class, () -> invitations.create(resident.getUsername(), building.getId()));
        String token = invitations.create(owner.getUsername(), building.getId());
        assertThrows(ResponseStatusException.class, () -> invitations.request(resident.getUsername(), "invalid"));
        invitations.request(resident.getUsername(), token);
        assertEquals(1, invitations.pending(owner.getUsername(), building.getId()).size());
        assertThrows(ResponseStatusException.class, () -> service.join(resident.getUsername(), building.getId(), true));
        invitations.approve(owner.getUsername(), building.getId(), resident.getId());
        service.join(resident.getUsername(), building.getId(), true);
        assertEquals(1, service.view(resident.getUsername(), building.getId()).queue().size());
    }

    @Test void onlyOneActiveQueueEntryPerAccountAndBuilding() {
        Account owner = account("owner");
        Building building = service.createBuilding(owner.getUsername(), "Tòa A", 1);
        service.join(owner.getUsername(), building.getId(), true);
        assertThrows(ResponseStatusException.class, () -> service.join(owner.getUsername(), building.getId(), true));
        service.leave(owner.getUsername(), building.getId());
        service.join(owner.getUsername(), building.getId(), false);
        assertEquals(2, service.view(owner.getUsername(), building.getId()).queue().getFirst().position());
    }
}
