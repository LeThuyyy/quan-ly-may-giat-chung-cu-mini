package com.laundry.shared;

import java.util.UUID;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/buildings/{buildingId}/eta")
public class EtaController {
    private final EtaService service;
    public EtaController(EtaService service) {this.service=service;}
    @GetMapping("/me")
    public ResponseEntity<EtaService.Estimate> me(Authentication auth,@PathVariable UUID buildingId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.me(auth.getName(),buildingId));
    }
}
