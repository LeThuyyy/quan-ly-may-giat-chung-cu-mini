package com.laundry.shared;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/buildings/{buildingId}")
public class WashController {
    private final WashService wash;
    public WashController(WashService wash) { this.wash = wash; }

    public record PhysicalRequest(@NotNull Boolean physicallyConfirmed) {}
    public record TransferRequest(@NotNull UUID holdId, @NotNull Boolean physicallyConfirmed) {}
    public record RunningRequest(Integer remainingMinutes) {}
    public record ResolveRequest(@NotBlank String action, Integer remainingMinutes, boolean physicallyConfirmed) {}

    @GetMapping("/wash-cycles/me")
    public List<WashService.CycleView> mine(Authentication auth, @PathVariable UUID buildingId) {
        return wash.mine(auth.getName(), buildingId);
    }
    @GetMapping("/holds/{holdId}/handover")
    public WashService.CycleView handover(Authentication auth, @PathVariable UUID buildingId, @PathVariable UUID holdId) {
        return wash.handover(auth.getName(), buildingId, holdId);
    }
    @GetMapping("/wash-cycles/issues")
    public List<WashService.CycleView> issues(Authentication auth, @PathVariable UUID buildingId) {
        return wash.managerIssues(auth.getName(), buildingId);
    }
    @PostMapping("/wash-cycles/{cycleId}/pickup")
    public WashService.CycleView pickup(Authentication auth, @PathVariable UUID buildingId, @PathVariable UUID cycleId,
                                        @Valid @RequestBody PhysicalRequest body) {
        return wash.pickup(auth.getName(), buildingId, cycleId, body.physicallyConfirmed());
    }
    @PostMapping("/wash-cycles/{cycleId}/transfer")
    public WashService.CycleView transfer(Authentication auth, @PathVariable UUID buildingId, @PathVariable UUID cycleId,
                                          @Valid @RequestBody TransferRequest body) {
        return wash.transfer(auth.getName(), buildingId, cycleId, body.holdId(), body.physicallyConfirmed());
    }
    @PostMapping("/wash-cycles/{cycleId}/remaining")
    public WashService.CycleView ownerRemaining(Authentication auth, @PathVariable UUID buildingId, @PathVariable UUID cycleId,
                                                @RequestBody RunningRequest body) {
        return wash.ownerRemaining(auth.getName(), buildingId, cycleId, body.remainingMinutes());
    }
    @PostMapping("/holds/{holdId}/report-running")
    public WashService.CycleView running(Authentication auth, @PathVariable UUID buildingId, @PathVariable UUID holdId,
                                         @RequestBody RunningRequest body) {
        return wash.reportStillRunning(auth.getName(), buildingId, holdId, body.remainingMinutes());
    }
    @PostMapping("/wash-cycles/{cycleId}/resolve")
    public WashService.CycleView resolve(Authentication auth, @PathVariable UUID buildingId, @PathVariable UUID cycleId,
                                         @Valid @RequestBody ResolveRequest body) {
        return wash.resolve(auth.getName(), buildingId, cycleId, body.action(), body.remainingMinutes(), body.physicallyConfirmed());
    }
}
