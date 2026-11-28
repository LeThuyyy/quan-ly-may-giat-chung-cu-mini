package com.laundry.shared;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/push")
public class PushController {
    private final PushSettings settings;
    private final PushSubscriptionService subscriptions;
    public PushController(PushSettings settings, PushSubscriptionService subscriptions) {
        this.settings = settings; this.subscriptions = subscriptions;
    }
    public record Config(boolean enabled, String publicKey) {}
    public record Keys(String p256dh, String auth) {}
    public record Registration(String endpoint, @NotNull @Valid Keys keys) {}
    public record Endpoint(String endpoint) {}
    public record Status(boolean subscribed) {}
    @GetMapping("/config")
    public ResponseEntity<Config> config() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new Config(settings.enabled(), settings.publicKey()));
    }
    @PostMapping("/subscriptions")
    public void register(Authentication auth, @Valid @RequestBody Registration body) {
        subscriptions.register(auth.getName(), body.endpoint(), body.keys().p256dh(), body.keys().auth());
    }
    @PostMapping("/subscriptions/status")
    public ResponseEntity<Status> status(Authentication auth, @RequestBody Endpoint body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new Status(subscriptions.status(auth.getName(), body.endpoint())));
    }
    @DeleteMapping("/subscriptions")
    public void delete(Authentication auth, @RequestBody Endpoint body) { subscriptions.delete(auth.getName(), body.endpoint()); }
}
