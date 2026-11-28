package com.laundry.shared;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import nl.martijndwars.webpush.Encoding;
import nl.martijndwars.webpush.Notification;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.springframework.stereotype.Component;

@Component
public class WebPushTransport implements PushTransport {
    private final PushSettings settings;
    private final ObjectMapper json;
    private final Clock clock;
    public WebPushTransport(PushSettings settings, ObjectMapper json, Clock clock) {
        this.settings = settings; this.json = json; this.clock = clock;
    }
    @Override
    public int send(PushOutboxService.Delivery delivery) throws Exception {
        if (!settings.enabled()) return 503;
        PushValidation.endpoint(delivery.endpoint());
        PushValidation.keys(delivery.p256dh(), delivery.auth());
        int ttl = (int) Math.min(480, Duration.between(clock.instant(), delivery.expiresAt()).getSeconds());
        if (ttl <= 0) return 204; // Never deliver past the hold deadline.
        byte[] payload = json.writeValueAsBytes(Map.of(
            "title", "Đến lượt kiểm tra máy giặt",
            "body", "Bạn có lượt tới kiểm tra máy. Hãy mở ứng dụng xem hạn giữ và kiểm tra thực tế; máy chưa chắc đã trống.",
            "url", "/buildings/" + delivery.buildingId() + "/overview",
            "tag", "hold:" + delivery.holdId(), "expiresAt", delivery.expiresAt().toString()));
        Notification notification = new Notification(delivery.endpoint(), delivery.p256dh(), delivery.auth(), payload, ttl);
        // Use the library for RFC8291 encryption/VAPID, but explicitly bound HTTP and disable redirects.
        var post = settings.service().preparePost(notification, Encoding.AES128GCM);
        RequestConfig config = RequestConfig.custom().setConnectTimeout(3000).setConnectionRequestTimeout(3000)
            .setSocketTimeout(5000).setRedirectsEnabled(false).build();
        try (CloseableHttpClient client = HttpClients.custom().disableRedirectHandling().disableAutomaticRetries()
                .setDefaultRequestConfig(config).build();
             var response = client.execute(post)) {
            return response.getStatusLine().getStatusCode();
        }
    }
}
