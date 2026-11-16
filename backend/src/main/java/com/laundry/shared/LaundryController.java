package com.laundry.shared;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class LaundryController {
    private final LaundryService service;
    private final AccountRepository accounts;
    private final PasswordEncoder passwords;

    public LaundryController(LaundryService service, AccountRepository accounts, PasswordEncoder passwords) {
        this.service = service; this.accounts = accounts; this.passwords = passwords;
    }

    public record RegisterRequest(@NotBlank @Size(max = 80) String username,
                                  @NotBlank @Size(max = 80) String displayName,
                                  @NotBlank @Size(min = 12, max = 128) String password) {}
    public record CreateBuildingRequest(@NotBlank @Size(max = 100) String name,
                                        @Min(1) @Max(30) int machineCount) {}
    public record AddMachineRequest(@NotBlank @Size(max = 60) String label) {}
    public record ReadyRequest(@NotNull Boolean ready) {}
    public record MaintenanceRequest(@NotNull Boolean maintenance) {}
    public record AccountView(UUID id, String username, String displayName) {}

    @PostMapping("/accounts") @ResponseStatus(HttpStatus.CREATED)
    public AccountView register(@Valid @RequestBody RegisterRequest request) {
        String username = request.username().trim().toLowerCase(java.util.Locale.ROOT);
        if (accounts.findByUsername(username).isPresent()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Tên đăng nhập đã tồn tại");
        try {
            Account account = accounts.saveAndFlush(new Account(username, passwords.encode(request.password()), request.displayName().trim()));
            return new AccountView(account.getId(), account.getUsername(), account.getDisplayName());
        } catch (DataIntegrityViolationException conflict) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tên đăng nhập đã tồn tại", conflict);
        }
    }

    @GetMapping("/me")
    public AccountView me(Authentication auth) {
        Account account = service.account(auth.getName());
        return new AccountView(account.getId(), account.getUsername(), account.getDisplayName());
    }
    @GetMapping("/buildings")
    public List<LaundryService.BuildingSummary> myBuildings(Authentication auth) { return service.myBuildings(auth.getName()); }
    @PostMapping("/buildings") @ResponseStatus(HttpStatus.CREATED)
    public LaundryService.BuildingView createBuilding(Authentication auth, @Valid @RequestBody CreateBuildingRequest request) {
        Building building = service.createBuilding(auth.getName(), request.name(), request.machineCount());
        return service.view(auth.getName(), building.getId());
    }
    @GetMapping("/buildings/{id}")
    public LaundryService.BuildingView view(Authentication auth, @PathVariable UUID id) { return service.view(auth.getName(), id); }
    @PostMapping("/buildings/{id}/machines") @ResponseStatus(HttpStatus.CREATED)
    public LaundryService.MachineView addMachine(Authentication auth, @PathVariable UUID id, @Valid @RequestBody AddMachineRequest request) {
        Machine machine = service.addMachine(auth.getName(), id, request.label());
        return new LaundryService.MachineView(machine.getId(), machine.getLabel(), machine.getStatus());
    }
    @PatchMapping("/buildings/{id}/machines/{machineId}")
    public void maintenance(Authentication auth, @PathVariable UUID id, @PathVariable UUID machineId,
                            @Valid @RequestBody MaintenanceRequest request) { service.setMaintenance(auth.getName(), id, machineId, request.maintenance()); }
    @PostMapping("/buildings/{id}/queue") @ResponseStatus(HttpStatus.CREATED)
    public LaundryService.QueueView join(Authentication auth, @PathVariable UUID id, @Valid @RequestBody ReadyRequest request) {
        QueueEntry entry = service.join(auth.getName(), id, request.ready());
        return new LaundryService.QueueView(entry.getId(), entry.getAccountId(), entry.getDisplayName(), entry.getPosition(), entry.isReady());
    }
    @PatchMapping("/buildings/{id}/queue/me")
    public void readiness(Authentication auth, @PathVariable UUID id, @Valid @RequestBody ReadyRequest request) {
        service.setReady(auth.getName(), id, request.ready());
    }
    @DeleteMapping("/buildings/{id}/queue/me")
    public void leave(Authentication auth, @PathVariable UUID id) { service.leave(auth.getName(), id); }
}
