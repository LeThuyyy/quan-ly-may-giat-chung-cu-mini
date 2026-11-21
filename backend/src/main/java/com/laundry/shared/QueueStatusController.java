package com.laundry.shared;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/buildings/{buildingId}/queue/me")
public class QueueStatusController {
    private final QueueStatusService service;

    public QueueStatusController(QueueStatusService service) {
        this.service = service;
    }

    @GetMapping
    public QueueStatusService.QueueStatusView current(Authentication auth, @PathVariable UUID buildingId,
                                                       HttpServletResponse response) {
        response.setHeader("Cache-Control", "private, no-store");
        return service.current(auth.getName(), buildingId);
    }
}
