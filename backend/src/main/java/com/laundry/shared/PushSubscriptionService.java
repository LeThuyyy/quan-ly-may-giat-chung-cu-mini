package com.laundry.shared;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PushSubscriptionService {
    private final PushSubscriptionRepository subscriptions;
    private final AccountRepository accounts;
    private final EntityManager em;
    private final Clock clock;
    private final PushSettings settings;
    public PushSubscriptionService(PushSubscriptionRepository subscriptions, AccountRepository accounts,
                                   EntityManager em, Clock clock, PushSettings settings) {
        this.subscriptions = subscriptions; this.accounts = accounts; this.em = em; this.clock = clock; this.settings = settings;
    }
    @Transactional
    public void register(String username, String endpoint, String p256dh, String auth) {
        PushValidation.endpoint(endpoint); PushValidation.keys(p256dh, auth);
        if (!settings.enabled()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Thông báo đẩy chưa được cấu hình");
        Account account = account(username);
        // Serialize per-account quota checks; no building locks are involved.
        em.lock(account, LockModeType.PESSIMISTIC_WRITE);
        String id = endpointId(endpoint);
        PushSubscription existing = em.find(PushSubscription.class, id, LockModeType.PESSIMISTIC_WRITE);
        if ((existing == null || !existing.getAccountId().equals(account.getId())) && subscriptions.countByAccountId(account.getId()) >= 10)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tối đa 10 thiết bị thông báo cho mỗi tài khoản");
        if (existing == null) existing = new PushSubscription(id, endpoint);
        existing.bind(account.getId(), p256dh, auth, clock.instant());
        subscriptions.saveAndFlush(existing);
    }
    @Transactional(readOnly = true)
    public boolean status(String username, String endpoint) {
        return subscriptions.findById(endpointId(PushValidation.endpoint(endpoint)))
            .map(s -> s.getAccountId().equals(account(username).getId())).orElse(false);
    }
    @Transactional
    public void delete(String username, String endpoint) {
        UUID owner = account(username).getId();
        PushSubscription subscription = em.find(PushSubscription.class, endpointId(PushValidation.endpoint(endpoint)), LockModeType.PESSIMISTIC_WRITE);
        if (subscription != null && subscription.getAccountId().equals(owner)) subscriptions.delete(subscription);
    }
    private Account account(String username) {
        return accounts.findByUsername(username).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }
    static String endpointId(String endpoint) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(endpoint.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
}
