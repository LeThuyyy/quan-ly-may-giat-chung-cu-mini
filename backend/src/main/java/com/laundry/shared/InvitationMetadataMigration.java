package com.laundry.shared;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class InvitationMetadataMigration implements ApplicationRunner {
    private final InvitationRepository invitations;
    public InvitationMetadataMigration(InvitationRepository invitations) { this.invitations=invitations; }
    @Override @Transactional
    public void run(ApplicationArguments args) {
        invitations.findByManagementIdIsNullOrCreatedAtIsNull().forEach(Invitation::backfillMetadata);
    }
}
