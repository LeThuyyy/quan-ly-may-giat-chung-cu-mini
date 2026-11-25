package com.laundry.shared;

import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;

@RestController
@RequestMapping("/api/buildings/{id}")
public class BuildingAdministrationController {
    private final MemberAdministrationService members;
    private final InvitationService invitations;
    private final ActivityService activity;
    public BuildingAdministrationController(MemberAdministrationService members, InvitationService invitations, ActivityService activity) {
        this.members=members;this.invitations=invitations;this.activity=activity;
    }
    @DeleteMapping("/members/{accountId}")
    public void remove(Authentication auth,@PathVariable UUID id,@PathVariable UUID accountId) { members.remove(auth.getName(),id,accountId); }
    @PostMapping("/members/{accountId}/restore")
    public void restore(Authentication auth,@PathVariable UUID id,@PathVariable UUID accountId) { members.restore(auth.getName(),id,accountId); }
    @GetMapping("/members/removed")
    public PageView<InvitationService.BuildingMemberView> removed(Authentication auth,@PathVariable UUID id,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,HttpServletResponse response) {
        response.setHeader("Cache-Control","private, no-store");return members.removed(auth.getName(),id,page,size);
    }
    @GetMapping("/invitations")
    public PageView<InvitationService.InvitationView> invitations(Authentication auth,@PathVariable UUID id,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,HttpServletResponse response) {
        response.setHeader("Cache-Control","private, no-store");return invitations.list(auth.getName(),id,page,size);
    }
    @PostMapping("/invitations/{invitationId}/revoke")
    public void revoke(Authentication auth,@PathVariable UUID id,@PathVariable UUID invitationId) { invitations.revoke(auth.getName(),id,invitationId); }
    @GetMapping("/activity")
    public PageView<ActivityService.EventView> history(Authentication auth,@PathVariable UUID id,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,
        @RequestParam(required=false) String type,@RequestParam(required=false) UUID machineId,HttpServletResponse response) {
        response.setHeader("Cache-Control","private, no-store");return activity.list(auth.getName(),id,page,size,type,machineId);
    }
}
