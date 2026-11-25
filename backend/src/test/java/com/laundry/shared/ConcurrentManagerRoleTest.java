package com.laundry.shared;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:concurrent-manager-test;DB_CLOSE_DELAY=-1")
class ConcurrentManagerRoleTest {
    @Autowired MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();

    private MockHttpSession registerAndLogin(String username, String displayName) throws Exception {
        MockHttpSession session = new MockHttpSession();
        mvc.perform(post("/api/accounts").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"displayName\":\"" + displayName + "\",\"password\":\"strong-password-123\"}"))
            .andExpect(status().isCreated());
        mvc.perform(post("/api/auth/login").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"password\":\"strong-password-123\"}"))
            .andExpect(status().isOk());
        return session;
    }

    private String accountIdOf(MockHttpSession session) throws Exception {
        String me = mvc.perform(get("/api/me").session(session))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return mapper.readTree(me).get("id").asText();
    }

    @Test
    void concurrentMutualDemotionLeavesExactlyOneManager() throws Exception {
        MockHttpSession mgr1Session = registerAndLogin("conc-mgr-1", "Quản lý 1");
        String mgr1Id = accountIdOf(mgr1Session);

        String buildingJson = mvc.perform(post("/api/buildings").session(mgr1Session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Tòa Đồng Thời\",\"machineCount\":2}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        String buildingId = mapper.readTree(buildingJson).get("id").asText();

        String inviteJson = mvc.perform(post("/api/buildings/" + buildingId + "/invitations").session(mgr1Session).with(csrf()))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        String token = mapper.readTree(inviteJson).get("token").asText();

        MockHttpSession mgr2Session = registerAndLogin("conc-mgr-2", "Quản lý 2");
        String mgr2Id = accountIdOf(mgr2Session);

        mvc.perform(post("/api/invitations/" + token + "/join").session(mgr2Session).with(csrf()))
            .andExpect(status().isAccepted());
        mvc.perform(post("/api/buildings/" + buildingId + "/members/" + mgr2Id + "/approve").session(mgr1Session).with(csrf()))
            .andExpect(status().isOk());
        mvc.perform(patch("/api/buildings/" + buildingId + "/members/" + mgr2Id + "/role")
                .session(mgr1Session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"MANAGER\"}"))
            .andExpect(status().isOk());

        // Hai quản lý đồng thời hạ quyền lẫn nhau tại cùng một thời điểm
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);

        Callable<Integer> mgr1DemotesMgr2 = () -> {
            ready.countDown();
            assertTrue(start.await(5, TimeUnit.SECONDS));
            return mvc.perform(patch("/api/buildings/" + buildingId + "/members/" + mgr2Id + "/role")
                    .session(mgr1Session).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"role\":\"RESIDENT\"}"))
                .andReturn().getResponse().getStatus();
        };

        Callable<Integer> mgr2DemotesMgr1 = () -> {
            ready.countDown();
            assertTrue(start.await(5, TimeUnit.SECONDS));
            return mvc.perform(patch("/api/buildings/" + buildingId + "/members/" + mgr1Id + "/role")
                    .session(mgr2Session).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"role\":\"RESIDENT\"}"))
                .andReturn().getResponse().getStatus();
        };

        Future<Integer> res1 = pool.submit(mgr1DemotesMgr2);
        Future<Integer> res2 = pool.submit(mgr2DemotesMgr1);
        assertTrue(ready.await(5, TimeUnit.SECONDS));
        start.countDown();

        int status1 = res1.get(10, TimeUnit.SECONDS);
        int status2 = res2.get(10, TimeUnit.SECONDS);
        pool.shutdownNow();

        List<Integer> statuses = List.of(status1, status2);
        assertEquals(1, statuses.stream().filter(s -> s == 200).count(), "Chỉ 1 thao tác hạ quyền được phép thành công");
        assertEquals(1, statuses.stream().filter(s -> s == 400 || s == 403).count(), "Thao tác còn lại phải bị chặn (400 hoặc 403) để giữ lại quản lý cuối cùng");

        // Dùng phiên của người quản lý còn lại để kiểm tra danh sách thành viên thực tế trong tòa
        MockHttpSession survivingManagerSession = status1 == 200 ? mgr1Session : mgr2Session;
        String membersJson = mvc.perform(get("/api/buildings/" + buildingId + "/members").session(survivingManagerSession))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        JsonNode membersTree = mapper.readTree(membersJson);
        int managerCount = 0;
        for (JsonNode member : membersTree) {
            if ("MANAGER".equals(member.get("role").asText())) {
                managerCount++;
            }
        }
        assertEquals(1, managerCount, "Tòa nhà phải luôn giữ lại đúng 1 quản lý duy nhất");
    }
}