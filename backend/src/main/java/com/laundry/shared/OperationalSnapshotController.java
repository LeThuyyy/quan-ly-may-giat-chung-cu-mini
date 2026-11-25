package com.laundry.shared;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import org.springframework.http.ResponseEntity;
import java.util.UUID;
@RestController
@RequestMapping("/api/buildings/{id}/snapshot")
public class OperationalSnapshotController {
    private final OperationalSnapshotService snapshots;
    public OperationalSnapshotController(OperationalSnapshotService snapshots){this.snapshots=snapshots;}
    @GetMapping public ResponseEntity<OperationalSnapshotService.Snapshot> get(Authentication auth,@PathVariable UUID id){
        return ResponseEntity.ok().header("Cache-Control","private, no-store").body(snapshots.get(auth.getName(),id));
    }
}
