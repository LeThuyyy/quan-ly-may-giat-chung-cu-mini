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
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties="spring.datasource.url=jdbc:h2:mem:admin-api-expansion;DB_CLOSE_DELAY=-1")
@Transactional
class AdministrationApiTest {
    @Autowired MockMvc mvc;
    @Autowired LaundryService laundry;
    @Autowired InvitationService invitations;
    @Autowired AccountRepository accounts;
    @Autowired MembershipRepository memberships;
    @Autowired MemberAdministrationService administration;
    private Account account(){return accounts.save(new Account("api-admin-"+UUID.randomUUID(),"hash","Test"));}

    @Test void managerPagesNeverExposeRawInviteTokensAndRejectInvalidPaging()throws Exception{
        Account owner=account(),resident=account();Building building=laundry.createBuilding(owner.getUsername(),"Tòa API",1);
        memberships.save(new Membership(building,resident,Membership.Role.RESIDENT,Membership.Status.APPROVED));
        String token=invitations.create(owner.getUsername(),building.getId());
        String root="/api/buildings/"+building.getId();
        String body=mvc.perform(get(root+"/invitations").with(user(owner.getUsername())))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","private, no-store"))
            .andExpect(jsonPath("$.items[0].id").exists()).andExpect(jsonPath("$.items[0].status").value("ACTIVE"))
            .andExpect(jsonPath("$.items[0].tokenHash").doesNotExist()).andReturn().getResponse().getContentAsString();
        assertFalse(body.contains(token));
        for(String path:new String[]{"/invitations","/members/removed","/activity"}){
            mvc.perform(get(root+path)).andExpect(status().isUnauthorized());
            mvc.perform(get(root+path).with(user(resident.getUsername()))).andExpect(status().isForbidden());
            mvc.perform(get(root+path).param("size","51").with(user(owner.getUsername()))).andExpect(status().isBadRequest());
        }
    }
    @Test void removalAndRestoreRequireCsrfAndManagerAndCannotTargetAnotherBuilding()throws Exception{
        Account owner=account(),resident=account(),outsider=account();Building building=laundry.createBuilding(owner.getUsername(),"Tòa A",1);
        Building other=laundry.createBuilding(outsider.getUsername(),"Tòa B",1);
        memberships.save(new Membership(building,resident,Membership.Role.RESIDENT,Membership.Status.APPROVED));
        String path="/api/buildings/"+building.getId()+"/members/"+resident.getId();
        mvc.perform(delete(path).with(user(owner.getUsername()))).andExpect(status().isForbidden());
        mvc.perform(delete(path).with(user(resident.getUsername())).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(delete(path).with(user(outsider.getUsername())).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(delete("/api/buildings/"+other.getId()+"/members/"+resident.getId()).with(user(outsider.getUsername())).with(csrf()))
            .andExpect(status().isNotFound());
        mvc.perform(delete(path).with(user(owner.getUsername())).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/buildings/"+building.getId()).with(user(resident.getUsername()))).andExpect(status().isForbidden());
        mvc.perform(post(path+"/restore").with(user(owner.getUsername()))).andExpect(status().isForbidden());
        mvc.perform(post(path+"/restore").with(user(owner.getUsername())).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/buildings/"+building.getId()).with(user(resident.getUsername()))).andExpect(status().isForbidden());
    }
    @Test void revokeIsScopedAndActivityOnlyReportsCommittedAllowlistedMetadata()throws Exception{
        Account owner=account(),otherOwner=account();Building building=laundry.createBuilding(owner.getUsername(),"Tòa A",1);
        Building other=laundry.createBuilding(otherOwner.getUsername(),"Tòa B",1);
        String token=invitations.create(owner.getUsername(),building.getId());
        UUID id=invitations.list(owner.getUsername(),building.getId(),0,20).items().getFirst().id();
        String path="/api/buildings/"+building.getId()+"/invitations/"+id+"/revoke";
        mvc.perform(post(path).with(user(owner.getUsername()))).andExpect(status().isForbidden());
        mvc.perform(post("/api/buildings/"+other.getId()+"/invitations/"+id+"/revoke").with(user(otherOwner.getUsername())).with(csrf()))
            .andExpect(status().isNotFound());
        mvc.perform(post(path).with(user(owner.getUsername())).with(csrf())).andExpect(status().isOk());
        String audit=mvc.perform(get("/api/buildings/"+building.getId()+"/activity").param("type","INVITATION_REVOKED").with(user(owner.getUsername())))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
            .andExpect(jsonPath("$.items[0].actorId").value(owner.getId().toString()))
            .andExpect(jsonPath("$.items[0].targetId").value(id.toString())).andReturn().getResponse().getContentAsString();
        assertFalse(audit.contains(token));assertFalse(audit.contains("tokenHash"));
    }
}
