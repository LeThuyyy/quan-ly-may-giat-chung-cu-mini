package com.laundry.shared;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.util.UUID;

@Service
@Transactional
public class ChatService {
    private final BuildingRepository buildings;
    private final BuildingAccessService access;
    private final ChatMessageRepository messages;
    private final ChatReportRepository reports;
    private final ActivityService activity;
    private final Clock clock;
    public ChatService(BuildingRepository buildings, BuildingAccessService access, ChatMessageRepository messages,
                       ChatReportRepository reports, ActivityService activity, Clock clock) {
        this.buildings=buildings; this.access=access; this.messages=messages; this.reports=reports;
        this.activity=activity; this.clock=clock;
    }
    private Account lock(String username,UUID buildingId,boolean manager) {
        buildings.findLockedById(buildingId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        return access.require(username,buildingId,manager);
    }
    private Instant cutoff() { return clock.instant().minus(Duration.ofDays(30)); }
    private ChatMessage message(UUID buildingId,UUID id) {
        return messages.findByIdAndBuildingIdAndSentAtGreaterThan(id,buildingId,cutoff())
            .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
    public PageView<MessageView> list(String username,UUID buildingId,int page,int size) {
        lock(username,buildingId,false); PageView.validate(page,size);
        var result=messages.findByBuildingIdAndSentAtGreaterThan(buildingId,cutoff(),
            PageRequest.of(page,size,Sort.by(Sort.Order.desc("sentAt"),Sort.Order.desc("id"))));
        return new PageView<>(result.getContent().stream().map(this::view).toList(),page,size,result.hasNext());
    }
    public MessageView post(String username,UUID buildingId,UUID clientRequestId,String body) {
        var actor=lock(username,buildingId,false);
        if(clientRequestId==null || body==null || body.strip().isEmpty() || body.strip().length()>1000)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Tin nhắn phải có 1–1000 ký tự");
        var existing=messages.findByBuildingIdAndAuthor_IdAndClientRequestId(buildingId,actor.getId(),clientRequestId);
        if(existing.isPresent()) {
            if(!existing.get().getSentAt().isAfter(cutoff())) throw new ResponseStatusException(HttpStatus.CONFLICT);
            return view(existing.get());
        }
        Instant now=clock.instant();
        var last=messages.findFirstByBuildingIdAndAuthor_IdOrderBySentAtDesc(buildingId,actor.getId());
        if(last.isPresent() && now.isBefore(last.get().getSentAt().plusSeconds(5)))
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Chờ 5 giây giữa các tin nhắn");
        var saved=messages.save(new ChatMessage(buildingId,actor,clientRequestId,body.strip(),now));
        activity.record(buildingId,actor.getId(),"CHAT_POST",saved.getId(),null,null,"VISIBLE");
        return view(saved);
    }
    public ReportView report(String username,UUID buildingId,UUID messageId,ChatReport.Reason reason) {
        var actor=lock(username,buildingId,false); var msg=message(buildingId,messageId);
        if(reason==null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        var existing=reports.findByMessageIdAndReporterId(messageId,actor.getId());
        if(existing.isPresent()) return reportView(existing.get());
        var saved=reports.save(new ChatReport(buildingId,msg.getId(),actor.getId(),reason,clock.instant()));
        activity.record(buildingId,actor.getId(),"CHAT_REPORT",msg.getId(),null,null,reason.name());
        return reportView(saved);
    }
    public MessageView hide(String username,UUID buildingId,UUID messageId,ChatReport.Reason reason) {
        var actor=lock(username,buildingId,true); var msg=message(buildingId,messageId);
        if(reason==null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if(msg.getHiddenAt()==null) {
            msg.hide(clock.instant());
            activity.record(buildingId,actor.getId(),"CHAT_HIDE",msg.getId(),null,"VISIBLE","HIDDEN_"+reason.name());
        }
        return view(msg);
    }
    public PageView<ReportView> reports(String username,UUID buildingId,int page,int size) {
        lock(username,buildingId,true); PageView.validate(page,size);
        var result=reports.findByBuildingIdAndReportedAtGreaterThan(buildingId,cutoff(),
            PageRequest.of(page,size,Sort.by(Sort.Order.desc("reportedAt"),Sort.Order.desc("id"))));
        return new PageView<>(result.getContent().stream().map(this::reportView).toList(),page,size,result.hasNext());
    }
    private MessageView view(ChatMessage msg) {
        return new MessageView(msg.getId(),msg.getAuthor().getId(),msg.getAuthor().getDisplayName(),msg.getBody(),msg.getSentAt(),msg.getHiddenAt());
    }
    private ReportView reportView(ChatReport report) {
        // Deliberately no original body, including for manager review.
        return new ReportView(report.getId(),report.getMessageId(),report.getReporterId(),report.getReasonCode(),report.getReportedAt());
    }
    public record MessageView(UUID id,UUID authorId,String displayName,String body,Instant sentAt,Instant hiddenAt) {}
    public record ReportView(UUID id,UUID messageId,UUID reporterId,ChatReport.Reason reasonCode,Instant reportedAt) {}
}
