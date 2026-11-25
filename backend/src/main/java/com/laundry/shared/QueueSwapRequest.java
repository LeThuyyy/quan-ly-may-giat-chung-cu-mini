package com.laundry.shared;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name="queue_swaps", indexes=@Index(name="idx_swap_building",columnList="buildingId,status"))
public class QueueSwapRequest {
    public enum Status { PENDING, ACCEPTED, REJECTED, CANCELLED, EXPIRED, INVALIDATED }
    @Id private UUID id;
    @Column(nullable=false) private UUID buildingId;
    @Column(nullable=false) private UUID senderId;
    @Column(nullable=false) private UUID recipientId;
    @Column(nullable=false) private UUID senderEntryId;
    @Column(nullable=false) private UUID recipientEntryId;
    @Column(nullable=false) private Instant createdAt;
    @Column(nullable=false) private Instant expiresAt;
    @Enumerated(EnumType.STRING) @Column(nullable=false) private Status status;
    protected QueueSwapRequest(){}
    QueueSwapRequest(UUID buildingId,QueueEntry sender,QueueEntry recipient,Instant now){
        id=UUID.randomUUID();this.buildingId=buildingId;senderId=sender.getAccountId();recipientId=recipient.getAccountId();
        senderEntryId=sender.getId();recipientEntryId=recipient.getId();createdAt=now;expiresAt=now.plusSeconds(600);status=Status.PENDING;
    }
    public UUID getId(){return id;} public UUID getBuildingId(){return buildingId;}
    public UUID getSenderId(){return senderId;} public UUID getRecipientId(){return recipientId;}
    public UUID getSenderEntryId(){return senderEntryId;} public UUID getRecipientEntryId(){return recipientEntryId;}
    public Instant getCreatedAt(){return createdAt;} public Instant getExpiresAt(){return expiresAt;}
    public Status getStatus(){return status;}
    public Status effectiveStatus(Instant now){return status==Status.PENDING && !now.isBefore(expiresAt)?Status.EXPIRED:status;}
    public void finish(Status next){if(status!=Status.PENDING || next==Status.PENDING)throw new IllegalStateException("Lời mời đã kết thúc");status=next;}
}
