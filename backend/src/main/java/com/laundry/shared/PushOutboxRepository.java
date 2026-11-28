package com.laundry.shared;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PushOutboxRepository extends JpaRepository<PushOutbox, UUID> {
    List<PushOutbox> findByDoneFalseAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAsc(Instant now, Pageable page);
    long deleteByDoneTrueAndExpiresAtBefore(Instant cutoff);
}
