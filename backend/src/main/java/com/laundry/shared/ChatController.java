package com.laundry.shared;

import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

@RestController
@RequestMapping("/api/buildings/{buildingId}/chat")
public class ChatController {
    private final ChatService chat;
    public ChatController(ChatService chat) { this.chat=chat; }
    private <T> ResponseEntity<T> response(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
    @GetMapping("/messages")
    public ResponseEntity<PageView<ChatService.MessageView>> list(Authentication auth,@PathVariable UUID buildingId,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="30") int size) {
        return response(chat.list(auth.getName(),buildingId,page,size));
    }
    @PostMapping("/messages")
    public ResponseEntity<ChatService.MessageView> post(Authentication auth,@PathVariable UUID buildingId,@Valid @RequestBody Post request) {
        return response(chat.post(auth.getName(),buildingId,request.clientRequestId(),request.body()));
    }
    @PostMapping("/messages/{messageId}/report")
    public ResponseEntity<ChatService.ReportView> report(Authentication auth,@PathVariable UUID buildingId,@PathVariable UUID messageId,@Valid @RequestBody Reason request) {
        return response(chat.report(auth.getName(),buildingId,messageId,request.reasonCode()));
    }
    @PostMapping("/messages/{messageId}/hide")
    public ResponseEntity<ChatService.MessageView> hide(Authentication auth,@PathVariable UUID buildingId,@PathVariable UUID messageId,@Valid @RequestBody Reason request) {
        return response(chat.hide(auth.getName(),buildingId,messageId,request.reasonCode()));
    }
    @GetMapping("/reports")
    public ResponseEntity<PageView<ChatService.ReportView>> reports(Authentication auth,@PathVariable UUID buildingId,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="30") int size) {
        return response(chat.reports(auth.getName(),buildingId,page,size));
    }
    public record Post(@NotNull UUID clientRequestId,@NotNull String body) {}
    public record Reason(@NotNull ChatReport.Reason reasonCode) {}
}
