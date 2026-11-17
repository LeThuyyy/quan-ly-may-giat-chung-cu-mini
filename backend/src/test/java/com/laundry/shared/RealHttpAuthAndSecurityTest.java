package com.laundry.shared;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.TestPropertySource;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:real-http-test;DB_CLOSE_DELAY=-1",
    "server.address=127.0.0.1"
})
class RealHttpAuthAndSecurityTest {
    @LocalServerPort int port;
    private final ObjectMapper mapper = new ObjectMapper();

    private String baseUrl() {
        return "http://127.0.0.1:" + port;
    }

    private HttpClient newClient(CookieManager cookies) {
        return HttpClient.newBuilder()
            .cookieHandler(cookies)
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    }

    private record CsrfInfo(String headerName, String token) {}

    private CsrfInfo fetchCsrf(HttpClient client) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl() + "/api/csrf")).GET().build();
        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, res.statusCode());
        JsonNode json = mapper.readTree(res.body());
        return new CsrfInfo(json.get("headerName").asText(), json.get("token").asText());
    }

    private HttpResponse<String> sendJson(HttpClient client, String method, String path, String body, CsrfInfo csrf) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl() + path))
            .header("Content-Type", "application/json");
        if (csrf != null) {
            builder.header(csrf.headerName(), csrf.token());
        }
        HttpRequest.BodyPublisher publisher = body == null
            ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(body);
        builder.method(method, publisher);
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void sessionCookiePersistsAcrossRequestsCsrfBlocksBadTokensAndLogoutInvalidatesSession() throws Exception {
        CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        HttpClient client = newClient(cookies);
        String username = "httpuser_" + UUID.randomUUID().toString().substring(0, 8);
        String password = "strong-password-123";

        // Unauthenticated requests return 401 without redirect or Basic auth challenge
        HttpResponse<String> unauthMe = client.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + "/api/me")).GET().build(),
            HttpResponse.BodyHandlers.ofString());
        assertEquals(401, unauthMe.statusCode());
        assertTrue(unauthMe.headers().firstValue("WWW-Authenticate").isEmpty());

        // Fetch CSRF token & initial session cookie
        CsrfInfo csrf = fetchCsrf(client);

        // Wrong CSRF token is rejected on registration and login
        HttpResponse<String> badRegCsrf = sendJson(client, "POST", "/api/accounts",
            "{\"username\":\"" + username + "\",\"displayName\":\"User\",\"password\":\"" + password + "\"}",
            new CsrfInfo(csrf.headerName(), "wrong-csrf-token"));
        assertEquals(403, badRegCsrf.statusCode());

        // Valid CSRF registers account
        HttpResponse<String> regRes = sendJson(client, "POST", "/api/accounts",
            "{\"username\":\"" + username + "\",\"displayName\":\"User\",\"password\":\"" + password + "\"}",
            csrf);
        assertEquals(201, regRes.statusCode());

        // Wrong password returns 401
        HttpResponse<String> badPass = sendJson(client, "POST", "/api/auth/login",
            "{\"username\":\"" + username + "\",\"password\":\"wrong-password-123\"}",
            csrf);
        assertEquals(401, badPass.statusCode());

        // Wrong CSRF on login returns 403
        HttpResponse<String> badLoginCsrf = sendJson(client, "POST", "/api/auth/login",
            "{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}",
            new CsrfInfo(csrf.headerName(), "invalid-token"));
        assertEquals(403, badLoginCsrf.statusCode());

        // Valid login establishes authenticated session cookie
        HttpResponse<String> loginRes = sendJson(client, "POST", "/api/auth/login",
            "{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}",
            csrf);
        assertEquals(200, loginRes.statusCode());
        assertEquals(username, mapper.readTree(loginRes.body()).get("username").asText());

        // Capture the authenticated JSESSIONID cookie value
        List<String> cookieValues = cookies.getCookieStore().getCookies().stream()
            .filter(c -> "JSESSIONID".equalsIgnoreCase(c.getName()))
            .map(c -> c.getName() + "=" + c.getValue())
            .toList();
        assertFalse(cookieValues.isEmpty(), "Expected JSESSIONID cookie after login");
        String capturedSessionCookie = cookieValues.getFirst();

        // Subsequent request using ONLY session cookie succeeds
        HttpResponse<String> meRes = client.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + "/api/me")).GET().build(),
            HttpResponse.BodyHandlers.ofString());
        assertEquals(200, meRes.statusCode());
        assertEquals(username, mapper.readTree(meRes.body()).get("username").asText());

        // Fetch fresh CSRF token after login (rotated on login)
        CsrfInfo postLoginCsrf = fetchCsrf(client);

        // Mutating request with wrong CSRF token is blocked (403)
        HttpResponse<String> badBuildCsrf = sendJson(client, "POST", "/api/buildings",
            "{\"name\":\"Tòa X\",\"machineCount\":2}",
            new CsrfInfo(postLoginCsrf.headerName(), "tampered-token"));
        assertEquals(403, badBuildCsrf.statusCode());

        // Logout without/wrong CSRF is blocked (403)
        HttpResponse<String> badLogoutCsrf = sendJson(client, "POST", "/api/auth/logout", null,
            new CsrfInfo(postLoginCsrf.headerName(), "tampered-token"));
        assertEquals(403, badLogoutCsrf.statusCode());

        // Logout with valid CSRF invalidates session (204)
        HttpResponse<String> logoutRes = sendJson(client, "POST", "/api/auth/logout", null, postLoginCsrf);
        assertEquals(204, logoutRes.statusCode());

        // Subsequent request with same client fails (401)
        HttpResponse<String> afterLogout = client.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + "/api/me")).GET().build(),
            HttpResponse.BodyHandlers.ofString());
        assertEquals(401, afterLogout.statusCode());

        // Replaying the old captured JSESSIONID cookie manually also fails (401)
        HttpClient rawClient = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();
        HttpResponse<String> replayOldCookie = rawClient.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + "/api/me"))
                .header("Cookie", capturedSessionCookie)
                .GET().build(),
            HttpResponse.BodyHandlers.ofString());
        assertEquals(401, replayOldCookie.statusCode());
    }

    @Test
    void buildingPermissionsAndQueueFlowOverRealHttp() throws Exception {
        CookieManager managerCookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        HttpClient managerClient = newClient(managerCookies);
        String managerUser = "mgr_" + UUID.randomUUID().toString().substring(0, 8);
        String password = "strong-password-123";

        CsrfInfo mgrCsrf = fetchCsrf(managerClient);
        assertEquals(201, sendJson(managerClient, "POST", "/api/accounts",
            "{\"username\":\"" + managerUser + "\",\"displayName\":\"Quản lý\",\"password\":\"" + password + "\"}", mgrCsrf).statusCode());
        assertEquals(200, sendJson(managerClient, "POST", "/api/auth/login",
            "{\"username\":\"" + managerUser + "\",\"password\":\"" + password + "\"}", mgrCsrf).statusCode());
        mgrCsrf = fetchCsrf(managerClient);

        // Manager creates building with 3 machines
        HttpResponse<String> bRes = sendJson(managerClient, "POST", "/api/buildings",
            "{\"name\":\"Chung cư Mini 1\",\"machineCount\":3}", mgrCsrf);
        assertEquals(201, bRes.statusCode());
        JsonNode building = mapper.readTree(bRes.body());
        String buildingId = building.get("id").asText();
        assertEquals(3, building.get("machines").size());
        String machineId = building.get("machines").get(0).get("id").asText();

        // Manager creates invitation
        HttpResponse<String> invRes = sendJson(managerClient, "POST", "/api/buildings/" + buildingId + "/invitations", null, mgrCsrf);
        assertEquals(201, invRes.statusCode());
        String token = mapper.readTree(invRes.body()).get("token").asText();

        // Resident registers and logs in with separate session
        CookieManager resCookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        HttpClient resClient = newClient(resCookies);
        String resUser = "res_" + UUID.randomUUID().toString().substring(0, 8);
        CsrfInfo resCsrf = fetchCsrf(resClient);
        assertEquals(201, sendJson(resClient, "POST", "/api/accounts",
            "{\"username\":\"" + resUser + "\",\"displayName\":\"Cư dân A\",\"password\":\"" + password + "\"}", resCsrf).statusCode());
        assertEquals(200, sendJson(resClient, "POST", "/api/auth/login",
            "{\"username\":\"" + resUser + "\",\"password\":\"" + password + "\"}", resCsrf).statusCode());
        resCsrf = fetchCsrf(resClient);

        // Unapproved resident cannot view building (403)
        assertEquals(403, resClient.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + "/api/buildings/" + buildingId)).GET().build(),
            HttpResponse.BodyHandlers.ofString()).statusCode());

        // Resident requests to join via invitation (202)
        HttpResponse<String> joinReq = sendJson(resClient, "POST", "/api/invitations/" + token + "/join", null, resCsrf);
        assertEquals(202, joinReq.statusCode());
        assertEquals("PENDING", mapper.readTree(joinReq.body()).get("status").asText());

        // Resident cannot approve themselves (403)
        HttpResponse<String> pendingRes = managerClient.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + "/api/buildings/" + buildingId + "/members/pending")).GET().build(),
            HttpResponse.BodyHandlers.ofString());
        assertEquals(200, pendingRes.statusCode());
        String resAccountId = mapper.readTree(pendingRes.body()).get(0).get("id").asText();
        assertEquals(403, sendJson(resClient, "POST", "/api/buildings/" + buildingId + "/members/" + resAccountId + "/approve", null, resCsrf).statusCode());

        // Manager approves resident (200)
        assertEquals(200, sendJson(managerClient, "POST", "/api/buildings/" + buildingId + "/members/" + resAccountId + "/approve", null, mgrCsrf).statusCode());

        // Approved resident cannot add machine or set maintenance (403)
        assertEquals(403, sendJson(resClient, "POST", "/api/buildings/" + buildingId + "/machines", "{\"label\":\"Máy lậu\"}", resCsrf).statusCode());
        assertEquals(403, sendJson(resClient, "PATCH", "/api/buildings/" + buildingId + "/machines/" + machineId, "{\"maintenance\":true}", resCsrf).statusCode());

        // Approved resident joins queue, toggles ready, leaves queue
        assertEquals(201, sendJson(resClient, "POST", "/api/buildings/" + buildingId + "/queue", "{\"ready\":false}", resCsrf).statusCode());
        assertEquals(200, sendJson(resClient, "PATCH", "/api/buildings/" + buildingId + "/queue/me", "{\"ready\":true}", resCsrf).statusCode());

        HttpResponse<String> viewAfterReady = resClient.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + "/api/buildings/" + buildingId)).GET().build(),
            HttpResponse.BodyHandlers.ofString());
        assertEquals(200, viewAfterReady.statusCode());
        assertTrue(mapper.readTree(viewAfterReady.body()).get("queue").get(0).get("ready").asBoolean());

        assertEquals(200, sendJson(resClient, "DELETE", "/api/buildings/" + buildingId + "/queue/me", null, resCsrf).statusCode());
    }
}
