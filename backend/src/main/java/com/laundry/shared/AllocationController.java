package com.laundry.shared;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/buildings/{buildingId}")
public class AllocationController {
    private final AllocationService allocation;
    private final LaundryService laundry;
    public AllocationController(AllocationService allocation, LaundryService laundry) {
        this.allocation = allocation; this.laundry = laundry;
    }

    @GetMapping("/holds")
    public List<AllocationService.HoldView> holds(Authentication auth, @PathVariable UUID buildingId) {
        return allocation.activeHolds(auth.getName(), buildingId);
    }
    @PostMapping("/holds/{holdId}/yield")
    public void yield(Authentication auth, @PathVariable UUID buildingId, @PathVariable UUID holdId) {
        allocation.yield(auth.getName(), buildingId, holdId);
    }
    @PostMapping("/holds/{holdId}/unusable")
    public void unusable(Authentication auth, @PathVariable UUID buildingId, @PathVariable UUID holdId) {
        allocation.reportUnusable(auth.getName(), buildingId, holdId);
    }
    @PostMapping("/holds/{holdId}/confirm-check")
    public void confirmCheck(Authentication auth, @PathVariable UUID buildingId, @PathVariable UUID holdId) {
        allocation.confirmPhysicalCheck(auth.getName(), buildingId, holdId);
    }
    @PostMapping("/holds/{holdId}/start")
    public void start(Authentication auth, @PathVariable UUID buildingId, @PathVariable UUID holdId) {
        allocation.start(auth.getName(), buildingId, holdId);
    }
    @PostMapping("/machines/{machineId}/confirm-free")
    public void confirmFree(Authentication auth, @PathVariable UUID buildingId, @PathVariable UUID machineId) {
        laundry.confirmMachineFree(auth.getName(), buildingId, machineId);
    }
}
