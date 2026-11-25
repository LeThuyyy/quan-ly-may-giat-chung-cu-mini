package com.laundry.shared;

import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;
import java.time.Clock;
import java.time.Duration;

@Component
public class ChatRetentionJob {
    private final ChatMessageRepository messages;
    private final ChatReportRepository reports;
    private final BuildingRepository buildings;
    private final Clock clock;
    public ChatRetentionJob(ChatMessageRepository messages,ChatReportRepository reports,BuildingRepository buildings,Clock clock) {
        this.messages=messages; this.reports=reports; this.buildings=buildings; this.clock=clock;
    }
    @Scheduled(fixedDelay=3600000)
    @Transactional
    public void cleanup() {
        var cutoff=clock.instant().minus(Duration.ofDays(30));
        var expired=messages.findBySentAtLessThanEqual(cutoff,PageRequest.of(0,100));
        var expiredReports=reports.expired(cutoff,PageRequest.of(0,100));
        // Stable building order avoids deadlocks when jobs overlap; both batches are bounded.
        java.util.stream.Stream.concat(expired.getContent().stream().map(ChatMessage::getBuildingId),
            expiredReports.getContent().stream().map(ChatReport::getBuildingId)).distinct().sorted()
            .forEach(id->buildings.findLockedById(id));
        reports.deleteAll(expiredReports.getContent());
        messages.deleteAll(expired.getContent());
    }
}
