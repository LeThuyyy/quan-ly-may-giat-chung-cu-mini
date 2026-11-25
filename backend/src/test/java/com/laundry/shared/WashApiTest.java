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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:wash-api-tests;DB_CLOSE_DELAY=-1")
@Transactional
class WashApiTest {
    @Autowired MockMvc mvc;
    @Autowired LaundryService laundry;
    @Autowired AllocationService allocation;
    @Autowired AccountRepository accounts;
    @Autowired MembershipRepository memberships;
    @Autowired WashCycleRepository cycles;

    @Test void singleStartRouteAcceptsFormAndIsIdempotentWithCsrfAndPermissions() throws Exception {
        Account manager = accounts.save(new Account("mgr" + UUID.randomUUID(), "hash", "Quản lý"));
        Building building = laundry.createBuilding(manager.getUsername(), "Tòa B", 1);
        Account owner = accounts.save(new Account("owner" + UUID.randomUUID(), "hash", "Chủ mẻ"));
        Account outsider = accounts.save(new Account("other" + UUID.randomUUID(), "hash", "Ngoài tòa"));
        memberships.save(new Membership(building, owner, Membership.Role.RESIDENT, Membership.Status.APPROVED));
        laundry.join(owner.getUsername(), building.getId(), true);
        UUID machine = laundry.view(manager.getUsername(), building.getId()).machines().getFirst().id();
        laundry.confirmMachineFree(manager.getUsername(), building.getId(), machine);
        UUID holdId = allocation.activeHolds(owner.getUsername(), building.getId()).getFirst().id();
        String url = "/api/buildings/" + building.getId() + "/holds/" + holdId + "/start";
        String json = "{\"durationMinutes\":30,\"handoverMode\":\"SELF_PICKUP\"}";
        mvc.perform(post(url).with(user(owner.getUsername())).contentType("application/json").content(json))
            .andExpect(status().isForbidden());
        mvc.perform(post(url).with(user(outsider.getUsername())).with(csrf()).contentType("application/json").content(json))
            .andExpect(status().isForbidden());
        mvc.perform(post(url).with(user(owner.getUsername())).with(csrf()).contentType("application/json").content(json))
            .andExpect(status().isConflict());
        mvc.perform(post("/api/buildings/" + building.getId() + "/holds/" + holdId + "/confirm-check")
            .with(user(owner.getUsername())).with(csrf())).andExpect(status().isOk());
        mvc.perform(post(url).with(user(owner.getUsername())).with(csrf()).contentType("application/json").content(json))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.durationMinutes").value(30))
            .andExpect(jsonPath("$.handoverMode").value("SELF_PICKUP"))
            .andExpect(jsonPath("$.state").value("ACTIVE"));
        mvc.perform(post(url).with(user(owner.getUsername())).with(csrf()).contentType("application/json").content(json))
            .andExpect(status().isOk());
        mvc.perform(post(url).with(user(owner.getUsername())).with(csrf()).contentType("application/json")
            .content("{\"durationMinutes\":31,\"handoverMode\":\"SELF_PICKUP\"}"))
            .andExpect(status().isConflict());
        mvc.perform(get("/api/buildings/" + building.getId() + "/queue/me").with(user(owner.getUsername())))
            .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("WASHING"));
        mvc.perform(get("/api/buildings/" + building.getId() + "/wash-cycles/me").with(user(owner.getUsername())))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].ownerName").value("Chủ mẻ"));
        mvc.perform(get("/api/buildings/" + building.getId() + "/wash-cycles/issues").with(user(owner.getUsername())))
            .andExpect(status().isForbidden());
        org.junit.jupiter.api.Assertions.assertEquals(1, cycles.findByMachine_Building_IdAndCompletedAtIsNull(building.getId()).size());
    }
}
