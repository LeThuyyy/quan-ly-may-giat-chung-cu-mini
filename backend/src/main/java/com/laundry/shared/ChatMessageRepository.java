package com.laundry.shared;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface ChatMessageRepository extends JpaRepository<ChatMessage,UUID> {
    Slice<ChatMessage> findByBuildingIdAndSentAtGreaterThan(UUID buildingId, Instant cutoff, Pageable page);
    Optional<ChatMessage> findByBuildingIdAndAuthor_IdAndClientRequestId(UUID buildingId, UUID authorId, UUID requestId);
    Optional<ChatMessage> findFirstByBuildingIdAndAuthor_IdOrderBySentAtDesc(UUID buildingId, UUID authorId);
    Optional<ChatMessage> findByIdAndBuildingIdAndSentAtGreaterThan(UUID id, UUID buildingId, Instant cutoff);
    Slice<ChatMessage> findBySentAtLessThanEqual(Instant cutoff, Pageable page);
}
