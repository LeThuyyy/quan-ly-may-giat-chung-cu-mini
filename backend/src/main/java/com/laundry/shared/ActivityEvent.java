package com.laundry.shared;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name="activity_events", indexes=@Index(name="idx_activity_building_time", columnList="buildingId,occurredAt"))
public class ActivityEvent {
    @Id private UUID id;
    @Column(nullable=false) private UUID buildingId;
    private UUID actorId;
    @Column(nullable=false,length=60) private String action;
    private UUID targetId;
    private UUID machineId;
    @Column(length=80) private String beforeState;
    @Column(length=80) private String afterState;
    @Column(nullable=false) private Instant occurredAt;
    protected ActivityEvent() {}
    ActivityEvent(UUID buildingId, UUID actorId, String action, UUID targetId, UUID machineId,
                  String beforeState, String afterState, Instant occurredAt) {
        this.id=UUID.randomUUID(); this.buildingId=buildingId; this.actorId=actorId; this.action=action;
        this.targetId=targetId; this.machineId=machineId; this.beforeState=beforeState;
        this.afterState=afterState; this.occurredAt=occurredAt;
    }
    public UUID getId(){return id;}
    public UUID getActorId(){return actorId;}
    public String getAction(){return action;}
    public UUID getTargetId(){return targetId;}
    public UUID getMachineId(){return machineId;}
    public String getBeforeState(){return beforeState;}
    public String getAfterState(){return afterState;}
    public Instant getOccurredAt(){return occurredAt;}
}
