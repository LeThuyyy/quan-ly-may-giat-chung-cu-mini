package com.laundry.shared;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.UUID;

@Service
public class LaundryService {
    private static final int MAX_MACHINES = 30;
    private final AccountRepository accounts;
    private final BuildingRepository buildings;
    private final MembershipRepository memberships;
    private final MachineRepository machines;
    private final QueueEntryRepository queue;

    public LaundryService(AccountRepository accounts, BuildingRepository buildings, MembershipRepository memberships,
                          MachineRepository machines, QueueEntryRepository queue) {
        this.accounts = accounts; this.buildings = buildings; this.memberships = memberships;
        this.machines = machines; this.queue = queue;
    }

    @Transactional
    public Building createBuilding(String username, String name, int machineCount) {
        if (machineCount < 1 || machineCount > MAX_MACHINES) throw bad("Số máy phải từ 1 đến 30");
        if (name == null || name.isBlank() || name.trim().length() > 100) throw bad("Tên tòa không hợp lệ");
        Account manager = account(username);
        Building building = buildings.save(new Building(name.trim(), manager));
        memberships.save(new Membership(building, manager, Membership.Role.MANAGER, Membership.Status.APPROVED));
        for (int number = 1; number <= machineCount; number++) machines.save(new Machine(building, "Máy " + number));
        return building;
    }

    @Transactional
    public Machine addMachine(String username, UUID buildingId, String label) {
        Building building = locked(buildingId);
        requireMember(username, buildingId, true);
        if (machines.countByBuilding_Id(buildingId) >= MAX_MACHINES) throw bad("Tòa đã có tối đa 30 máy");
        if (label == null) throw bad("Tên máy không hợp lệ");
        String cleaned = label.trim();
        if (cleaned.isBlank() || cleaned.length() > 60 || machines.existsByBuilding_IdAndLabel(buildingId, cleaned))
            throw bad("Tên máy không hợp lệ hoặc đã tồn tại");
        return machines.save(new Machine(building, cleaned));
    }

    @Transactional
    public void setMaintenance(String username, UUID buildingId, UUID machineId, boolean maintenance) {
        requireMember(username, buildingId, true);
        Machine machine = machines.findByIdAndBuilding_Id(machineId, buildingId)
            .orElseThrow(() -> missing("Không tìm thấy máy trong tòa"));
        machine.setMaintenance(maintenance);
    }

    @Transactional
    public QueueEntry join(String username, UUID buildingId, boolean ready) {
        Building building = locked(buildingId);
        Account user = requireMember(username, buildingId, false);
        if (queue.existsByBuilding_IdAndAccount_IdAndActiveTrue(buildingId, user.getId())) throw bad("Bạn đã ở trong hàng");
        // Historical rows retain positions. A new visit always joins at the end.
        return queue.save(new QueueEntry(building, user, queue.countByBuilding_Id(buildingId) + 1, ready));
    }

    @Transactional
    public void setReady(String username, UUID buildingId, boolean ready) {
        Account user = requireMember(username, buildingId, false);
        QueueEntry entry = queue.findByBuilding_IdAndAccount_IdAndActiveTrue(buildingId, user.getId())
            .orElseThrow(() -> bad("Bạn chưa ở trong hàng"));
        entry.setReady(ready);
    }

    @Transactional
    public void leave(String username, UUID buildingId) {
        Account user = requireMember(username, buildingId, false);
        QueueEntry entry = queue.findByBuilding_IdAndAccount_IdAndActiveTrue(buildingId, user.getId())
            .orElseThrow(() -> bad("Bạn chưa ở trong hàng"));
        entry.leave();
    }

    @Transactional(readOnly = true)
    public BuildingView view(String username, UUID buildingId) {
        requireMember(username, buildingId, false);
        Building building = buildings.findById(buildingId).orElseThrow(() -> missing("Không tìm thấy tòa"));
        return new BuildingView(building.getId(), building.getName(),
            machines.findByBuilding_IdOrderByLabelAsc(buildingId).stream().map(m -> new MachineView(m.getId(), m.getLabel(), m.getStatus())).toList(),
            queue.findByBuilding_IdAndActiveTrueOrderByPositionAsc(buildingId).stream()
                .map(e -> new QueueView(e.getId(), e.getAccountId(), e.getDisplayName(), e.getPosition(), e.isReady())).toList());
    }

    @Transactional(readOnly = true)
    public List<BuildingSummary> myBuildings(String username) {
        return memberships.findByAccount_Id(account(username).getId()).stream().map(m -> {
            Building b = buildings.findById(m.getBuildingId()).orElseThrow();
            return new BuildingSummary(b.getId(), b.getName(), m.getRole(), m.getStatus());
        }).toList();
    }

    public Account account(String username) {
        return accounts.findByUsername(username).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }
    private Building locked(UUID id) {
        return buildings.findLockedById(id).orElseThrow(() -> missing("Không tìm thấy tòa"));
    }
    private Account requireMember(String username, UUID id, boolean manager) {
        Account account = account(username);
        Membership member = memberships.findByBuilding_IdAndAccount_Id(id, account.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN));
        if (member.getStatus() != Membership.Status.APPROVED || (manager && member.getRole() != Membership.Role.MANAGER))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return account;
    }
    private ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private ResponseStatusException missing(String message) { return new ResponseStatusException(HttpStatus.NOT_FOUND, message); }

    public record MachineView(UUID id, String label, Machine.Status status) {}
    public record QueueView(UUID id, UUID accountId, String displayName, long position, boolean ready) {}
    public record BuildingView(UUID id, String name, List<MachineView> machines, List<QueueView> queue) {}
    public record BuildingSummary(UUID id, String name, Membership.Role role, Membership.Status status) {}
}
