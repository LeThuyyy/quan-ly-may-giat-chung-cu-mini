package com.laundry.shared;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:api-test;DB_CLOSE_DELAY=-1")
@Transactional
class LaundryApiTest {
    @Autowired MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();

    private MockHttpSession registerAndLogin(String username, String displayName) throws Exception {
        MockHttpSession session = new MockHttpSession();
        mvc.perform(post("/api/accounts").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"displayName\":\"" + displayName + "\",\"password\":\"strong-password-123\"}"))
            .andExpect(status().isCreated());
        mvc.perform(post("/api/auth/login").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"password\":\"strong-password-123\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value(username));
        return session;
    }

    @Test void registrationRequiresCsrfAndReadRequiresAuthentication() throws Exception {
        String body = "{\"username\":\"owner\",\"displayName\":\"Owner\",\"password\":\"strong-password-123\"}";
        mvc.perform(post("/api/accounts").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(get("/api/buildings")).andExpect(status().isUnauthorized());
        MockHttpSession session = registerAndLogin("owner", "Owner");
        mvc.perform(get("/api/buildings").session(session)).andExpect(status().isOk());
    }

    @Test void createBuildingWithChosenMachineCountAndRejectUnauthorizedReader() throws Exception {
        MockHttpSession session = registerAndLogin("manager", "Manager");
        String response = mvc.perform(post("/api/buildings").session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Tòa A\",\"machineCount\":4}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.machines.length()").value(4))
            .andReturn().getResponse().getContentAsString();
        String id = mapper.readTree(response).get("id").asText();
        mvc.perform(get("/api/buildings/" + id)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/buildings/" + id).session(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.machines.length()").value(4));
    }

    @Test void emptyMaintenancePatchCannotOpenMachine() throws Exception {
        MockHttpSession session = registerAndLogin("patch-owner", "Owner");
        String response = mvc.perform(post("/api/buildings").session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Tòa A\",\"machineCount\":1}"))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        var tree = mapper.readTree(response);
        String id = tree.get("id").asText();
        String machineId = tree.get("machines").get(0).get("id").asText();
        String url = "/api/buildings/" + id + "/machines/" + machineId;
        mvc.perform(patch(url).session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"maintenance\":true}"))
            .andExpect(status().isOk());
        mvc.perform(patch(url).session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/buildings/" + id).session(session))
            .andExpect(jsonPath("$.machines[0].status").value("MAINTENANCE"));
    }

    @Test void authenticatedUserStillCannotMutateWithoutCsrf() throws Exception {
        MockHttpSession session = registerAndLogin("csrf-owner", "Owner");
        mvc.perform(post("/api/buildings").session(session)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Tòa A\",\"machineCount\":2}"))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/csrf")).andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty());
    }
}
