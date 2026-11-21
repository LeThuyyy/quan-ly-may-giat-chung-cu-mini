package com.laundry.shared;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:allocation-api-tests;DB_CLOSE_DELAY=-1")
@Transactional
class AllocationApiTest {
    @Autowired MockMvc mvc;
    @Autowired LaundryService laundry;
    @Autowired AllocationService allocation;
    @Autowired AccountRepository accounts;
    @Autowired MembershipRepository memberships;

    private Account account(String prefix) {
        return accounts.save(new Account(prefix + UUID.randomUUID(), "test-hash", prefix));
    }

    private Account resident(Building building, String prefix) {
        Account account = account(prefix);
        memberships.save(new Membership(building, account, Membership.Role.RESIDENT, Membership.Status.APPROVED));
        return account;
    }

    @Test void holdReadsRequireAuthenticationAndApprovedBuildingMembership() throws Exception {
        Account owner = account("owner");
        Account outsider = account("outsider");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa quyền xem", 1);
        String path = "/api/buildings/" + building.getId() + "/holds";
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(get(path).with(user(outsider.getUsername()))).andExpect(status().isForbidden());
        memberships.save(new Membership(building, outsider, Membership.Role.RESIDENT, Membership.Status.PENDING));
        mvc.perform(get(path).with(user(outsider.getUsername()))).andExpect(status().isForbidden());
        mvc.perform(get(path).with(user(owner.getUsername()))).andExpect(status().isOk()).andExpect(content().json("[]"));
    }

    @Test void onlyManagerCanConfirmFreeAndEveryMutationNeedsCsrf() throws Exception {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa quyền máy", 1);
        Account resident = resident(building, "resident");
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        String path = "/api/buildings/" + building.getId() + "/machines/" + machineId + "/confirm-free";
        mvc.perform(post(path).with(user(owner.getUsername()))).andExpect(status().isForbidden());
        mvc.perform(post(path).with(user(resident.getUsername())).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(post(path).with(user(owner.getUsername())).with(csrf())).andExpect(status().isOk());
        laundry.join(resident.getUsername(), building.getId(), true);
        UUID holdId = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst().id();
        String holdPath = "/api/buildings/" + building.getId() + "/holds/" + holdId;
        for (String action : new String[] { "yield", "confirm-check", "unusable", "start" }) {
            mvc.perform(post(holdPath + "/" + action).with(user(resident.getUsername())))
                .andExpect(status().isForbidden());
        }
    }

    @Test void onlyHoldOwnerCanActAndFinishedHoldCannotBeReused() throws Exception {
        Account owner = account("owner");
        Building building = laundry.createBuilding(owner.getUsername(), "Tòa quyền lượt", 1);
        Account a = resident(building, "a");
        Account b = resident(building, "b");
        laundry.join(a.getUsername(), building.getId(), true);
        UUID machineId = laundry.view(owner.getUsername(), building.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(owner.getUsername(), building.getId(), machineId);
        var hold = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst();
        String path = "/api/buildings/" + building.getId() + "/holds/" + hold.id();
        for (String action : new String[] { "yield", "confirm-check", "unusable", "start" }) {
            mvc.perform(post(path + "/" + action).with(user(b.getUsername())).with(csrf()))
                .andExpect(status().isForbidden());
        }
        mvc.perform(post(path + "/confirm-check").with(user(a.getUsername())).with(csrf())).andExpect(status().isOk());
        mvc.perform(post(path + "/yield").with(user(a.getUsername())).with(csrf())).andExpect(status().isOk());
        mvc.perform(post(path + "/yield").with(user(a.getUsername())).with(csrf())).andExpect(status().isConflict());
        mvc.perform(get("/api/buildings/" + building.getId() + "/holds").with(user(a.getUsername())))
            .andExpect(status().isOk()).andExpect(content().json("[]"));
    }

    @Test void holdCannotBeAccessedThroughAnotherBuildingPath() throws Exception {
        Account owner = account("owner");
        Building first = laundry.createBuilding(owner.getUsername(), "Tòa A", 1);
        Building second = laundry.createBuilding(owner.getUsername(), "Tòa B", 1);
        laundry.join(owner.getUsername(), first.getId(), true);
        UUID machineId = laundry.view(owner.getUsername(), first.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(owner.getUsername(), first.getId(), machineId);
        UUID holdId = allocation.activeHolds(owner.getUsername(), first.getId()).getFirst().id();
        mvc.perform(post("/api/buildings/" + second.getId() + "/holds/" + holdId + "/yield")
                .with(user(owner.getUsername())).with(csrf()))
            .andExpect(status().isNotFound());
        mvc.perform(get("/api/buildings/" + first.getId() + "/holds").with(user(owner.getUsername())))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(holdId.toString()));
    }
}
