package com.laundry.shared;

import java.time.Clock;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Read-only estimate, never dispatches or expires a hold. */
@Service
public class EtaService {
    private final BuildingRepository buildings;
    private final BuildingAccessService access;
    private final LaundryService laundry;
    private final MachineRepository machines;
    private final MachineHoldRepository holdRows;
    private final WashCycleRepository cycles;
    private final Clock clock;

    public EtaService(BuildingRepository buildings, BuildingAccessService access, LaundryService laundry,
                      MachineRepository machines, MachineHoldRepository holdRows, WashCycleRepository cycles, Clock clock) {
        this.buildings = buildings;
        this.access = access;
        this.laundry = laundry;
        this.machines = machines;
        this.holdRows = holdRows;
        this.cycles = cycles;
        this.clock = clock;
    }

    public record Estimate(String state, Integer rank, Integer readyAhead, Instant rangeStart,
                           Instant rangeEnd, Instant serverNow, List<String> assumptions, String reason) {}

    public record Slot(Instant lower, Instant upper) {}

    private static final List<String> ASSUMPTIONS = List.of(
        "Ước tính, không phải cam kết hạn trên; không xác nhận máy đã dừng hoặc trống đồ.",
        "Mỗi lượt tương lai giả định giặt 45 phút, bàn giao 5–10 phút; lượt giữ có thể thêm tối đa 8 phút.",
        "Chỉ tính người WAITING sẵn sàng theo thứ tự hiện tại; sự cố, thay đổi thời lượng và hàng đợi có thể làm lệch dự báo."
    );

    @Transactional
    public Estimate me(String username, UUID buildingId) {
        buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Account actor = access.require(username, buildingId, false);
        Instant now = clock.instant();
        var waiting = laundry.view(username, buildingId).queue();
        var own = waiting.stream().filter(e -> e.accountId().equals(actor.getId())).findFirst().orElse(null);
        if (own == null) {
            return result("NOT_WAITING", null, null, null, now, "Bạn không đang chờ trong hàng.");
        }
        int rank = waiting.indexOf(own) + 1;
        int ahead = (int) waiting.stream().filter(e -> e.position() < own.position() && e.ready()).count();
        if (!own.ready()) {
            return result("UNREADY", rank, ahead, null, now, "Bật Sẵn sàng để nhận ước tính.");
        }
        var holds = holdRows.findByMachine_Building_IdAndStatus(buildingId, MachineHold.Status.ACTIVE);
        if (holds.stream().anyMatch(h -> !now.isBefore(h.getExpiresAt()))) {
            return result("UNAVAILABLE", rank, ahead, null, now, "Có lượt đã quá hạn chờ máy chủ xử lý; hãy tải lại sau.");
        }
        var open = cycles.findByMachine_Building_IdAndCompletedAtIsNull(buildingId);
        List<Slot> slots = new ArrayList<>();
        for (Machine m : machines.findByBuilding_IdOrderByDisplayOrderAsc(buildingId)) {
            var cycle = open.stream().filter(c -> c.getMachineId().equals(m.getId())).findFirst().orElse(null);
            if (m.getStatus() == Machine.Status.MAINTENANCE
                || m.getStatus() == Machine.Status.NEEDS_CHECK
                || (cycle != null && cycle.getState() == WashCycle.State.NEEDS_MANAGER)) {
                continue;
            }
            if (cycle == null && (m.getStatus() != Machine.Status.AVAILABLE || !m.isVerifiedFree())) {
                continue;
            }
            Instant base = cycle == null ? now : later(now, cycle.inspectionAt());
            var hold = holds.stream().filter(h -> h.getMachineId().equals(m.getId())).findFirst().orElse(null);
            // A provisional inspection hold and its old cycle occupy ONE machine slot.
            if (hold == null) {
                slots.add(new Slot(base, base));
            } else {
                long remaining = Math.max(0, Math.min(480, hold.getExpiresAt().getEpochSecond() - now.getEpochSecond()));
                slots.add(new Slot(base.plusSeconds(50 * 60), base.plusSeconds(55 * 60 + remaining)));
            }
        }
        Slot range = simulate(slots, ahead);
        return result(
            range == null ? "UNAVAILABLE" : "READY",
            rank,
            ahead,
            range,
            now,
            range == null ? "Chưa có máy đủ dữ liệu để ước tính." : "Khoảng dự kiến tới lượt kiểm tra máy; không phải xác nhận máy trống."
        );
    }

    static Slot simulate(List<Slot> slots, int ahead) {
        if (slots.isEmpty()) return null;
        PriorityQueue<Instant> lower = new PriorityQueue<>(), upper = new PriorityQueue<>();
        slots.forEach(s -> {
            lower.add(s.lower());
            upper.add(s.upper());
        });
        for (int i = 0; i < ahead; i++) {
            lower.add(lower.remove().plusSeconds(50 * 60));
            upper.add(upper.remove().plusSeconds(55 * 60));
        }
        return new Slot(lower.element(), upper.element());
    }

    private static Instant later(Instant a, Instant b) {
        return a.isAfter(b) ? a : b;
    }

    private Estimate result(String state, Integer rank, Integer ahead, Slot range, Instant now, String reason) {
        return new Estimate(
            state,
            rank,
            ahead,
            range == null ? null : range.lower(),
            range == null ? null : range.upper(),
            now,
            ASSUMPTIONS,
            reason
        );
    }
}
