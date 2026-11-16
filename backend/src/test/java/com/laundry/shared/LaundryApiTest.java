package com.laundry.shared;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:api-test;DB_CLOSE_DELAY=-1")
@Transactional
class LaundryApiTest {
    @Autowired MockMvc mvc;

    @Test void registrationRequiresCsrfAndReadRequiresAuthentication() throws Exception {
        String body = "{\"username\":\"owner\",\"displayName\":\"Owner\",\"password\":\"strong-password-123\"}";
        mvc.perform(post("/api/accounts").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(post("/api/accounts").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
        mvc.perform(get("/api/buildings")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/buildings").with(httpBasic("owner", "strong-password-123"))).andExpect(status().isOk());
    }

    @Test void createBuildingWithChosenMachineCountAndRejectUnauthorizedReader() throws Exception {
        mvc.perform(post("/api/accounts").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"manager\",\"displayName\":\"Manager\",\"password\":\"strong-password-123\"}"))
            .andExpect(status().isCreated());
        String response = mvc.perform(post("/api/buildings").with(csrf()).with(httpBasic("manager", "strong-password-123"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Tòa A\",\"machineCount\":4}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.machines.length()").value(4))
            .andReturn().getResponse().getContentAsString();
        String id = new com.fasterxml.jackson.databind.ObjectMapper().readTree(response).get("id").asText();
        mvc.perform(get("/api/buildings/" + id)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/buildings/" + id).with(httpBasic("manager", "strong-password-123")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.machines.length()").value(4));
    }

    @Test void emptyMaintenancePatchCannotOpenMachine() throws Exception {
        mvc.perform(post("/api/accounts").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"patch-owner\",\"displayName\":\"Owner\",\"password\":\"strong-password-123\"}"))
            .andExpect(status().isCreated());
        String response = mvc.perform(post("/api/buildings").with(csrf()).with(httpBasic("patch-owner", "strong-password-123"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Tòa A\",\"machineCount\":1}"))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        var tree = new com.fasterxml.jackson.databind.ObjectMapper().readTree(response);
        String id = tree.get("id").asText();
        String machineId = tree.get("machines").get(0).get("id").asText();
        String url = "/api/buildings/" + id + "/machines/" + machineId;
        mvc.perform(patch(url).with(csrf()).with(httpBasic("patch-owner", "strong-password-123"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"maintenance\":true}"))
            .andExpect(status().isOk());
        mvc.perform(patch(url).with(csrf()).with(httpBasic("patch-owner", "strong-password-123"))
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/buildings/" + id).with(httpBasic("patch-owner", "strong-password-123")))
            .andExpect(jsonPath("$.machines[0].status").value("MAINTENANCE"));
    }

    @Test void authenticatedUserStillCannotMutateWithoutCsrf() throws Exception {
        mvc.perform(post("/api/buildings").with(httpBasic("unknown", "password"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Tòa A\",\"machineCount\":2}"))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/csrf")).andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty());
    }
}
