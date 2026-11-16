package com.laundry.shared;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class InvitationController {
    private final InvitationService invitations;
    public InvitationController(InvitationService invitations) { this.invitations = invitations; }

    @PostMapping("/buildings/{id}/invitations") @ResponseStatus(HttpStatus.CREATED)
    public InviteView create(Authentication authentication, @PathVariable UUID id) {
        return new InviteView(invitations.create(authentication.getName(), id));
    }
    @PostMapping("/invitations/{token}/join") @ResponseStatus(HttpStatus.ACCEPTED)
    public JoinView request(Authentication authentication, @PathVariable String token) {
        InvitationService.JoinResult result = invitations.request(authentication.getName(), token);
        return new JoinView(result.buildingId(), result.status());
    }
    @GetMapping("/buildings/{id}/members/pending")
    public List<InvitationService.MemberView> pending(Authentication authentication, @PathVariable UUID id) {
        return invitations.pending(authentication.getName(), id);
    }
    @PostMapping("/buildings/{id}/members/{accountId}/approve")
    public void approve(Authentication authentication, @PathVariable UUID id, @PathVariable UUID accountId) {
        invitations.approve(authentication.getName(), id, accountId);
    }
    public record InviteView(String token) {}
    public record JoinView(UUID buildingId, Membership.Status status) {}
}
