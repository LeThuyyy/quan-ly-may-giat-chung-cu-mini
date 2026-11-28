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

    private String accountIdOf(MockHttpSession session) throws Exception {
        String me = mvc.perform(get("/api/me").session(session))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return mapper.readTree(me).get("id").asText();
    }

    private String createBuilding(MockHttpSession session, String name, int machines) throws Exception {
        String response = mvc.perform(post("/api/buildings").session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + name + "\",\"machineCount\":" + machines + "}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).get("id").asText();
    }

    private String createInvite(MockHttpSession managerSession, String buildingId) throws Exception {
        String response = mvc.perform(post("/api/buildings/" + buildingId + "/invitations").session(managerSession).with(csrf()))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).get("token").asText();
    }

    @Test void registrationRequiresCsrfAndReadRequiresAuthentication() throws Exception {
        String body = "{\"username\":\"owner\",\"displayName\":\"Owner\",\"password\":\"strong-password-123\"}";
        mvc.perform(post("/api/accounts").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(get("/api/buildings")).andExpect(status().isUnauthorized());
        MockHttpSession session = registerAndLogin("owner", "Owner");
        mvc.perform(get("/api/buildings").session(session)).andExpect(status().isOk());
    }

    @Test void bcryptPasswordByteLimitIsValidatedWithoutServerError() throws Exception {
        for (String password : java.util.List.of("a".repeat(73), "ắ".repeat(25))) {
            String username = "long-" + java.util.UUID.randomUUID();
            String body = mapper.writeValueAsString(java.util.Map.of("username", username, "displayName", "Name", "password", password));
            mvc.perform(post("/api/accounts").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
        }
        String username = "boundary-" + java.util.UUID.randomUUID();
        String password = "ắ".repeat(24);
        String registration = mapper.writeValueAsString(java.util.Map.of("username", username, "displayName", "Name", "password", password));
        mvc.perform(post("/api/accounts").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(registration))
            .andExpect(status().isCreated());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(java.util.Map.of("username", username, "password", password))))
            .andExpect(status().isOk());
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

    @Test void multipleManagersCanManageBuildingAndCannotDemoteLastManager() throws Exception {
        MockHttpSession manager1 = registerAndLogin("mgr-one", "Quản lý 1");
        String manager1Id = accountIdOf(manager1);
        String buildingId = createBuilding(manager1, "Tòa Đa Quản Lý", 2);
        String token = createInvite(manager1, buildingId);

        MockHttpSession manager2 = registerAndLogin("mgr-two", "Quản lý 2");
        String manager2Id = accountIdOf(manager2);
        mvc.perform(post("/api/invitations/" + token + "/join").session(manager2).with(csrf()))
            .andExpect(status().isAccepted());

        // Chưa duyệt thì chưa thể cấp quyền quản lý
        mvc.perform(patch("/api/buildings/" + buildingId + "/members/" + manager2Id + "/role")
                .session(manager1).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"MANAGER\"}"))
            .andExpect(status().isBadRequest());

        // Duyệt và cấp quyền quản lý cho người thứ 2
        mvc.perform(post("/api/buildings/" + buildingId + "/members/" + manager2Id + "/approve")
                .session(manager1).with(csrf()))
            .andExpect(status().isOk());
        mvc.perform(patch("/api/buildings/" + buildingId + "/members/" + manager2Id + "/role")
                .session(manager1).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"MANAGER\"}"))
            .andExpect(status().isOk());

        // Quản lý 2 có quyền tạo mã mời và duyệt cư dân thứ 3
        MockHttpSession resident = registerAndLogin("res-three", "Cư dân 3");
        String residentId = accountIdOf(resident);
        String token2 = createInvite(manager2, buildingId);
        mvc.perform(post("/api/invitations/" + token2 + "/join").session(resident).with(csrf()))
            .andExpect(status().isAccepted());
        mvc.perform(post("/api/buildings/" + buildingId + "/members/" + residentId + "/approve")
                .session(manager2).with(csrf()))
            .andExpect(status().isOk());

        // Quản lý 2 có thể hạ quyền Quản lý 1 xuống RESIDENT vì vẫn còn Quản lý 2
        mvc.perform(patch("/api/buildings/" + buildingId + "/members/" + manager1Id + "/role")
                .session(manager2).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"RESIDENT\"}"))
            .andExpect(status().isOk());

        // Quản lý 2 (người quản lý cuối cùng) tự hạ quyền của chính mình phải bị từ chối (400)
        mvc.perform(patch("/api/buildings/" + buildingId + "/members/" + manager2Id + "/role")
                .session(manager2).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"RESIDENT\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test void unapprovedResidentSelfPromotionAndCrossBuildingAccessAreBlocked() throws Exception {
        MockHttpSession managerA = registerAndLogin("mgr-a", "Quản lý A");
        String buildingA = createBuilding(managerA, "Tòa A", 2);
        String tokenA = createInvite(managerA, buildingA);

        MockHttpSession managerB = registerAndLogin("mgr-b", "Quản lý B");
        String buildingB = createBuilding(managerB, "Tòa B", 2);

        MockHttpSession resident = registerAndLogin("res-a", "Cư dân A");
        String residentId = accountIdOf(resident);

        // Tham gia tòa A (trạng thái PENDING)
        mvc.perform(post("/api/invitations/" + tokenA + "/join").session(resident).with(csrf()))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.status").value("PENDING"));

        // Cư dân chưa duyệt không thể xem chi tiết tòa hay vào hàng đợi
        mvc.perform(get("/api/buildings/" + buildingA).session(resident))
            .andExpect(status().isForbidden());
        mvc.perform(post("/api/buildings/" + buildingA + "/queue").session(resident).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"ready\":true}"))
            .andExpect(status().isForbidden());

        // Quản lý A duyệt cư dân
        mvc.perform(post("/api/buildings/" + buildingA + "/members/" + residentId + "/approve")
                .session(managerA).with(csrf()))
            .andExpect(status().isOk());

        // Cư dân đã duyệt không thể tự nâng quyền mình lên MANAGER
        mvc.perform(patch("/api/buildings/" + buildingA + "/members/" + residentId + "/role")
                .session(resident).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"MANAGER\"}"))
            .andExpect(status().isForbidden());

        // Quản lý tòa B không thể xem hay chỉnh sửa thành viên/máy của tòa A
        mvc.perform(get("/api/buildings/" + buildingA + "/members").session(managerB))
            .andExpect(status().isForbidden());
        mvc.perform(patch("/api/buildings/" + buildingA + "/members/" + residentId + "/role")
                .session(managerB).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"MANAGER\"}"))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/buildings/" + buildingB).session(managerB))
            .andExpect(status().isOk());
    }
}