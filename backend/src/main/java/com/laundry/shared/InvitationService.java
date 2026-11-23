package com.laundry.shared;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
public class InvitationService {
    private final LaundryService laundry;
    private final BuildingRepository buildings;
    private final AccountRepository accounts;
    private final MembershipRepository memberships;
    private final InvitationRepository invitations;
    private final SecureRandom random = new SecureRandom();

    public InvitationService(LaundryService laundry, BuildingRepository buildings, AccountRepository accounts,
                             MembershipRepository memberships, InvitationRepository invitations) {
        this.laundry = laundry; this.buildings = buildings; this.accounts = accounts;
        this.memberships = memberships; this.invitations = invitations;
    }
    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    @Transactional
    public String create(String username, UUID buildingId) {
        Building building = buildings.findById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requireManager(username, buildingId);
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = HexFormat.of().formatHex(bytes);
        invitations.save(new Invitation(hash(token), building, Instant.now().plus(7, ChronoUnit.DAYS)));
        return token;
    }
    @Transactional
    public JoinResult request(String username, String token) {
        if (token == null || !token.matches("[0-9a-f]{64}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Link không hợp lệ");
        Invitation invitation = invitations.findById(hash(token)).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!invitation.validAt(Instant.now())) throw new ResponseStatusException(HttpStatus.GONE, "Link đã hết hạn");
        Account account = laundry.account(username);
        UUID buildingId = invitation.getBuildingId();
        // Serialize duplicate invitation submissions for this building.
        Building building = buildings.findLockedById(buildingId).orElseThrow();
        Membership member = memberships.findByBuilding_IdAndAccount_Id(buildingId, account.getId()).orElse(null);
        if (member == null) {
            member = memberships.save(new Membership(building, account, Membership.Role.RESIDENT, Membership.Status.PENDING));
        }
        return new JoinResult(buildingId, member.getStatus());
    }
    @Transactional(readOnly = true)
    public List<MemberView> pending(String username, UUID buildingId) {
        requireManager(username, buildingId);
        return memberships.findByBuilding_IdAndStatus(buildingId, Membership.Status.PENDING).stream()
            .map(m -> accounts.findById(m.getAccountId()).orElseThrow())
            .map(a -> new MemberView(a.getId(), a.getDisplayName())).toList();
    }
    @Transactional(readOnly = true)
    public List<BuildingMemberView> members(String username, UUID buildingId) {
        requireManager(username, buildingId);
        return memberships.findByBuilding_IdAndStatus(buildingId, Membership.Status.APPROVED).stream()
            .map(m -> {
                Account acc = accounts.findById(m.getAccountId()).orElseThrow();
                return new BuildingMemberView(acc.getId(), acc.getUsername(), acc.getDisplayName(), m.getRole(), m.getStatus());
            })
            .sorted(Comparator
                .comparing((BuildingMemberView v) -> v.role() != Membership.Role.MANAGER)
                .thenComparing(BuildingMemberView::displayName, String.CASE_INSENSITIVE_ORDER))
            .toList();
    }
    @Transactional
    public void approve(String username, UUID buildingId, UUID accountId) {
        buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requireManager(username, buildingId);
        Membership membership = memberships.findByBuilding_IdAndAccount_Id(buildingId, accountId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (membership.getRole() != Membership.Role.RESIDENT || membership.getStatus() != Membership.Status.PENDING)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không có yêu cầu chờ duyệt");
        membership.approve();
    }
    @Transactional
    public void updateRole(String username, UUID buildingId, UUID targetAccountId, Membership.Role newRole) {
        if (newRole == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Vai trò không hợp lệ");
        }
        buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requireManager(username, buildingId);

        Membership target = memberships.findByBuilding_IdAndAccount_Id(buildingId, targetAccountId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy thành viên trong tòa"));

        if (target.getStatus() != Membership.Status.APPROVED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chỉ có thể phân quyền cho thành viên đã được duyệt");
        }

        if (target.getRole() == newRole) {
            return;
        }

        if (target.getRole() == Membership.Role.MANAGER && newRole == Membership.Role.RESIDENT) {
            long managerCount = memberships.countByBuilding_IdAndRoleAndStatus(
                buildingId, Membership.Role.MANAGER, Membership.Status.APPROVED);
            if (managerCount <= 1) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không thể hạ quyền quản lý cuối cùng của tòa");
            }
        }

        target.setRole(newRole);
    }
    private void requireManager(String username, UUID buildingId) {
        Account user = laundry.account(username);
        Membership member = memberships.findByBuilding_IdAndAccount_Id(buildingId, user.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN));
        if (member.getRole() != Membership.Role.MANAGER || member.getStatus() != Membership.Status.APPROVED)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }
    public record JoinResult(UUID buildingId, Membership.Status status) {}
    public record MemberView(UUID id, String displayName) {}
    public record BuildingMemberView(UUID id, String username, String displayName, Membership.Role role, Membership.Status status) {}
}