package com.laundry.shared;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QueueSwapRepository extends JpaRepository<QueueSwapRequest,UUID>{
    List<QueueSwapRequest> findByBuildingIdAndStatus(UUID buildingId,QueueSwapRequest.Status status);
    Optional<QueueSwapRequest> findByIdAndBuildingId(UUID id,UUID buildingId);
    List<QueueSwapRequest> findByBuildingIdAndSenderIdAndStatusAndExpiresAtGreaterThan(UUID buildingId,UUID senderId,QueueSwapRequest.Status status,Instant now);
    @Query("select s from QueueSwapRequest s where s.buildingId=:buildingId and (s.senderId=:accountId or s.recipientId=:accountId)")
    Page<QueueSwapRequest> related(UUID buildingId,UUID accountId,Pageable page);
    @Query("select s from QueueSwapRequest s where s.buildingId=:buildingId and (s.senderId=:accountId or s.recipientId=:accountId) and s.status=:status and s.expiresAt>:now")
    Page<QueueSwapRequest> pendingRelated(UUID buildingId,UUID accountId,QueueSwapRequest.Status status,Instant now,Pageable page);
    @Query("select s from QueueSwapRequest s where s.buildingId=:buildingId and s.recipientId=:accountId and s.status=:status and s.expiresAt>:now")
    Page<QueueSwapRequest> incoming(UUID buildingId,UUID accountId,QueueSwapRequest.Status status,Instant now,Pageable page);
    Page<QueueSwapRequest> findByBuildingIdAndSenderIdAndStatusIn(UUID buildingId,UUID senderId,List<QueueSwapRequest.Status> statuses,Pageable page);
    @Query("select distinct s.buildingId from QueueSwapRequest s where s.status=:status and s.expiresAt<=:now")
    List<UUID> expiredBuildings(QueueSwapRequest.Status status,Instant now);
}
