package com.laundry.shared;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration(proxyBeanMethods = false)
public class PushSchedulingConfiguration {
    // Defining the push scheduler makes Boot's default scheduler back off. Preserve a named
    // default explicitly so hold expiry and wash deadlines never share the HTTP sender thread.
    @Bean(name = "taskScheduler")
    public ThreadPoolTaskScheduler taskScheduler() {
        return scheduler("laundry-deadlines-");
    }

    @Bean(name = "pushTaskScheduler")
    public ThreadPoolTaskScheduler pushTaskScheduler() {
        return scheduler("laundry-push-");
    }

    private ThreadPoolTaskScheduler scheduler(String prefix) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix(prefix);
        scheduler.setRemoveOnCancelPolicy(true);
        scheduler.setContinueExistingPeriodicTasksAfterShutdownPolicy(false);
        scheduler.setExecuteExistingDelayedTasksAfterShutdownPolicy(false);
        return scheduler;
    }
}
