package com.laundry.shared;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PushSubscriptionRepository extends JpaRepository<PushSubscription, String> {
    List<PushSubscription> findByAccountId(UUID accountId);
    long countByAccountId(UUID accountId);
}
