package com.laundry.shared;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class LegacyQueueStateMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    public LegacyQueueStateMigration(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override public void run(ApplicationArguments args) {
        // H2 ddl-auto adds the new column to existing demo DBs without assigning values.
        jdbc.update("update queue_entries set state = 'WAITING' where state is null and active = true");
        jdbc.update("update queue_entries set state = 'LEFT' where state is null and active = false");
    }
}
