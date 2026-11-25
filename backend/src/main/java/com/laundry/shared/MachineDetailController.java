package com.laundry.shared;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import org.springframework.http.*;
@RestController
public class MachineDetailController {
    private final MachineDetailService service;
    public MachineDetailController(MachineDetailService service) {this.service=service;}
    @GetMapping("/api/buildings/{buildingId}/machines/{machineId}")
    public ResponseEntity<MachineDetailService.Detail> get(Authentication auth,@PathVariable UUID buildingId,@PathVariable UUID machineId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(auth.getName(),buildingId,machineId));
    }
}
