package com.laundry.shared;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name="chat_reports",uniqueConstraints=@UniqueConstraint(columnNames={"messageId","reporterId"}),indexes=@Index(columnList="buildingId,reportedAt,id"))
public class ChatReport {
    public enum Reason { SPAM, ABUSE, OTHER }
    @Id private UUID id;
    @Column(nullable=false) private UUID buildingId;
    @Column(nullable=false) private UUID messageId;
    @Column(nullable=false) private UUID reporterId;
    @Enumerated(EnumType.STRING) @Column(nullable=false) private Reason reasonCode;
    @Column(nullable=false) private Instant reportedAt;
    protected ChatReport() {}
    public ChatReport(UUID buildingId,UUID messageId,UUID reporterId,Reason reason,Instant now) {
        id=UUID.randomUUID(); this.buildingId=buildingId; this.messageId=messageId;
        this.reporterId=reporterId; reasonCode=reason; reportedAt=now;
    }
    public UUID getId() { return id; }
    public UUID getBuildingId() { return buildingId; }
    public UUID getMessageId() { return messageId; }
    public UUID getReporterId() { return reporterId; }
    public Reason getReasonCode() { return reasonCode; }
    public Instant getReportedAt() { return reportedAt; }
}
