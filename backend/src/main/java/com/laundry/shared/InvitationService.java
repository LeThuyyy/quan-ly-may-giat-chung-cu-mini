package com.laundry.shared;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.Clock;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import jakarta.persistence.EntityManager;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
public class InvitationService {
    private final BuildingAccessService access;
    private final ActivityService activity;
    private final Clock clock;
    private final EntityManager entityManager;
    private final BuildingRepository buildings;
    private final AccountRepository accounts;
    private final MembershipRepository memberships;
    private final InvitationRepository invitations;
    private final SecureRandom random = new SecureRandom();

    public InvitationService(BuildingAccessService access, BuildingRepository buildings, AccountRepository accounts,
                             MembershipRepository memberships, InvitationRepository invitations,
                             ActivityService activity, Clock clock, EntityManager entityManager) {
        this.access = access; this.buildings = buildings; this.accounts = accounts;
        this.memberships = memberships; this.invitations = invitations;
        this.activity=activity; this.clock=clock; this.entityManager=entityManager;
    }
    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    @Transactional
    public String create(String username, UUID buildingId) {
        Building building = buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requireManager(username, buildingId);
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = HexFormat.of().formatHex(bytes);
        Invitation invitation=invitations.save(new Invitation(hash(token), building, clock.instant().plus(7, ChronoUnit.DAYS)));
        activity.record(buildingId,access.account(username).getId(),"INVITATION_CREATED",invitation.getManagementId(),null,null,"ACTIVE");
        return token;
    }
    @Transactional
    public JoinResult request(String username, String token) {
        if (token == null || !token.matches("[0-9a-f]{64}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Link không hợp lệ");
        Invitation invitation = invitations.findWithBuildingByTokenHash(hash(token)).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Account account = access.account(username);
        UUID buildingId = invitation.getBuildingId();
        Building building = buildings.findLockedById(buildingId).orElseThrow();
        // First-level cache may contain the pre-lock row: explicitly refresh under the lock.
        entityManager.refresh(invitation);
        if (!invitation.validAt(clock.instant())) throw new ResponseStatusException(HttpStatus.GONE, "Link đã hết hạn hoặc bị thu hồi");
        Membership member = memberships.findByBuilding_IdAndAccount_Id(buildingId, account.getId()).orElse(null);
        if (member!=null && member.getStatus()==Membership.Status.REMOVED)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Tư cách thành viên đã bị gỡ; liên hệ quản lý để khôi phục");
        if (member == null) {
            member = memberships.save(new Membership(building, account, Membership.Role.RESIDENT, Membership.Status.PENDING));
            activity.record(buildingId,account.getId(),"MEMBERSHIP_REQUESTED",account.getId(),null,null,"PENDING");
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
        activity.record(buildingId,access.account(username).getId(),"MEMBERSHIP_APPROVED",accountId,null,"PENDING","APPROVED");
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

        String previous=target.getRole().name();
        target.setRole(newRole);
        memberships.saveAndFlush(target);
        activity.record(buildingId,access.account(username).getId(),"MEMBERSHIP_ROLE_CHANGED",targetAccountId,null,previous,newRole.name());
    }
    @Transactional(readOnly=true)
    public PageView<InvitationView> list(String username, UUID buildingId, int page, int size) {
        requireManager(username,buildingId); PageView.validate(page,size);
        return PageView.from(invitations.findByBuilding_Id(buildingId,PageRequest.of(page,size,
            Sort.by(Sort.Order.desc("createdAt"),Sort.Order.asc("managementId")))), i ->
            new InvitationView(i.getManagementId(),i.getCreatedAt(),i.getExpiresAt(),i.getRevokedAt(),
                i.getRevokedAt()!=null ? "REVOKED" : i.validAt(clock.instant()) ? "ACTIVE" : "EXPIRED"));
    }
    @Transactional
    public void revoke(String username, UUID buildingId, UUID invitationId) {
        buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Account actor=access.require(username,buildingId,true);
        Invitation invitation=invitations.findByManagementIdAndBuilding_Id(invitationId,buildingId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (invitation.revoke(clock.instant()))
            activity.record(buildingId,actor.getId(),"INVITATION_REVOKED",invitationId,null,"ACTIVE","REVOKED");
    }
    private void requireManager(String username, UUID buildingId) {
        access.require(username,buildingId,true);
    }
    public record InvitationView(UUID id, Instant createdAt, Instant expiresAt, Instant revokedAt, String status) {}
    public record JoinResult(UUID buildingId, Membership.Status status) {}
    public record MemberView(UUID id, String displayName) {}
    public record BuildingMemberView(UUID id, String username, String displayName, Membership.Role role, Membership.Status status) {}
}