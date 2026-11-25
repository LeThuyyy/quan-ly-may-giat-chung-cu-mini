package com.laundry.shared;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name="chat_messages", uniqueConstraints=@UniqueConstraint(columnNames={"buildingId","author_id","clientRequestId"}),
    indexes=@Index(columnList="buildingId,sentAt,id"))
public class ChatMessage {
    @Id private UUID id;
    @Column(nullable=false) private UUID buildingId;
    @ManyToOne(fetch=FetchType.LAZY, optional=false) private Account author;
    @Column(nullable=false) private UUID clientRequestId;
    @Column(length=1000) private String body;
    @Column(nullable=false) private Instant sentAt;
    private Instant hiddenAt;
    protected ChatMessage() {}
    public ChatMessage(UUID buildingId, Account author, UUID requestId, String body, Instant now) {
        this.id=UUID.randomUUID(); this.buildingId=buildingId; this.author=author;
        this.clientRequestId=requestId; this.body=body; this.sentAt=now;
    }
    public UUID getId() { return id; }
    public UUID getBuildingId() { return buildingId; }
    public Account getAuthor() { return author; }
    public String getBody() { return hiddenAt==null ? body : null; }
    public Instant getSentAt() { return sentAt; }
    public Instant getHiddenAt() { return hiddenAt; }
    public void hide(Instant now) { body=null; hiddenAt=now; }
}
