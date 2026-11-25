package com.laundry.shared;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.util.UUID;

/** Repository-only authorization; mutations must call after acquiring the building lock. */
@Service
public class BuildingAccessService {
    private final AccountRepository accounts;
    private final MembershipRepository memberships;
    public BuildingAccessService(AccountRepository accounts, MembershipRepository memberships) {
        this.accounts = accounts; this.memberships = memberships;
    }
    public Account account(String username) {
        return accounts.findByUsername(username).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }
    public Account require(String username, UUID buildingId, boolean manager) {
        Account account = account(username);
        requireAccount(account.getId(),buildingId,manager);
        return account;
    }
    public void requireAccount(UUID accountId, UUID buildingId, boolean manager) {
        Membership member = memberships.findByBuilding_IdAndAccount_Id(buildingId, accountId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN));
        if (member.getStatus() != Membership.Status.APPROVED || (manager && member.getRole() != Membership.Role.MANAGER))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }
}
