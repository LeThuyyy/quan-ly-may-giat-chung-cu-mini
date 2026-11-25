package com.laundry.shared;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface ChatReportRepository extends JpaRepository<ChatReport,UUID> {
    Optional<ChatReport> findByMessageIdAndReporterId(UUID messageId,UUID reporterId);
    @org.springframework.data.jpa.repository.Query("select r from ChatReport r, ChatMessage m where r.messageId=m.id and r.buildingId=:buildingId and m.sentAt>:cutoff")
    Slice<ChatReport> findByBuildingIdAndReportedAtGreaterThan(UUID buildingId,Instant cutoff,Pageable page);
    @org.springframework.data.jpa.repository.Query("select r from ChatReport r where not exists (select m.id from ChatMessage m where m.id=r.messageId and m.sentAt>:cutoff)")
    Slice<ChatReport> expired(Instant cutoff,Pageable page);
}
