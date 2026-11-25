package com.laundry.shared;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.UUID;

@Service
public class MemberAdministrationService {
    private final BuildingRepository buildings;
    private final BuildingAccessService access;
    private final MembershipRepository memberships;
    private final AccountRepository accounts;
    private final QueueEntryRepository queue;
    private final MachineHoldRepository holds;
    private final WashCycleRepository cycles;
    private final AllocationService allocation;
    private final ActivityService activity;
    private final SwapLifecycle swaps;
    public MemberAdministrationService(BuildingRepository buildings, BuildingAccessService access,
        MembershipRepository memberships,AccountRepository accounts,QueueEntryRepository queue,
        MachineHoldRepository holds,WashCycleRepository cycles,AllocationService allocation,ActivityService activity,SwapLifecycle swaps) {
        this.buildings=buildings;this.access=access;this.memberships=memberships;this.accounts=accounts;
        this.queue=queue;this.holds=holds;this.cycles=cycles;this.allocation=allocation;this.activity=activity;this.swaps=swaps;
    }
    @Transactional
    public void remove(String username,UUID buildingId,UUID accountId) {
        buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Account actor=access.require(username,buildingId,true);
        if(actor.getId().equals(accountId)) throw conflict("Không tự gỡ bản thân");
        Membership member=target(buildingId,accountId);
        if(member.getRole()!=Membership.Role.RESIDENT) throw conflict("Phải hạ quyền quản lý trước khi gỡ");
        if(member.getStatus()==Membership.Status.REMOVED) return;
        if(!cycles.findByQueueEntry_Account_IdAndMachine_Building_IdAndCompletedAtIsNull(accountId,buildingId).isEmpty())
            throw conflict("Còn mẻ giặt chưa hoàn tất/bàn giao; hãy xử lý mẻ trước khi gỡ");
        var entries=queue.findByBuilding_IdAndAccount_IdAndActiveTrue(buildingId,accountId);
        for(var entry:entries) {
            swaps.invalidateEntry(buildingId,entry.getId());
            if(entry.getState()==QueueEntry.State.WAITING) entry.leave();
            else if(entry.getState()==QueueEntry.State.HELD) {
                var linked=holds.findByQueueEntry_IdAndStatus(entry.getId(),MachineHold.Status.ACTIVE);
                if(linked.size()!=1) throw conflict("Lượt giữ chưa nhất quán; chưa thể gỡ");
                linked.getFirst().finish(MachineHold.Status.MEMBER_REMOVED);
                entry.missHold();
            } else throw conflict("Còn yêu cầu giặt chưa hoàn tất");
        }
        String previous=member.getStatus().name();
        member.remove(); memberships.flush(); holds.flush();
        activity.record(buildingId,actor.getId(),"MEMBERSHIP_REMOVED",accountId,null,previous,"REMOVED");
        allocation.dispatchLocked(buildingId);
    }
    @Transactional
    public void restore(String username,UUID buildingId,UUID accountId) {
        buildings.findLockedById(buildingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Account actor=access.require(username,buildingId,true);
        Membership member=target(buildingId,accountId);
        if(member.getStatus()!=Membership.Status.REMOVED) throw conflict("Thành viên chưa bị gỡ");
        member.restore();
        activity.record(buildingId,actor.getId(),"MEMBERSHIP_RESTORED",accountId,null,"REMOVED","PENDING");
    }
    @Transactional(readOnly=true)
    public PageView<InvitationService.BuildingMemberView> removed(String username,UUID buildingId,int page,int size) {
        access.require(username,buildingId,true);PageView.validate(page,size);
        return PageView.from(memberships.findByBuilding_IdAndStatus(buildingId,Membership.Status.REMOVED,
            PageRequest.of(page,size,Sort.by("id"))), m -> {
                Account user=accounts.findById(m.getAccountId()).orElseThrow();
                return new InvitationService.BuildingMemberView(user.getId(),user.getUsername(),user.getDisplayName(),m.getRole(),m.getStatus());
            });
    }
    private Membership target(UUID buildingId,UUID accountId) {
        return memberships.findByBuilding_IdAndAccount_Id(buildingId,accountId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
    private ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT,message); }
}
