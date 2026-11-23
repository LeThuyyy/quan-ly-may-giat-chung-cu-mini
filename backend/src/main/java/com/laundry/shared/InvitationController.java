package com.laundry.shared;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
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
    @GetMapping("/buildings/{id}/members")
    public List<InvitationService.BuildingMemberView> members(Authentication authentication, @PathVariable UUID id) {
        return invitations.members(authentication.getName(), id);
    }
    @PostMapping("/buildings/{id}/members/{accountId}/approve")
    public void approve(Authentication authentication, @PathVariable UUID id, @PathVariable UUID accountId) {
        invitations.approve(authentication.getName(), id, accountId);
    }
    @PatchMapping("/buildings/{id}/members/{accountId}/role")
    public void updateRole(Authentication authentication,
                           @PathVariable UUID id,
                           @PathVariable UUID accountId,
                           @Valid @RequestBody UpdateRoleRequest request) {
        invitations.updateRole(authentication.getName(), id, accountId, request.role());
    }
    public record InviteView(String token) {}
    public record JoinView(UUID buildingId, Membership.Status status) {}
    public record UpdateRoleRequest(@NotNull Membership.Role role) {}
}