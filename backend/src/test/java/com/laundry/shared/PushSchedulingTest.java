package com.laundry.shared;

import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import static org.junit.jupiter.api.Assertions.*;

class PushSchedulingTest {
    @Test void blockedPushDoesNotBlockDefaultDeadlineScheduler() throws Exception {
        try (var context = new AnnotationConfigApplicationContext(PushSchedulingConfiguration.class)) {
            var deadlines = context.getBean("taskScheduler", ThreadPoolTaskScheduler.class);
            var push = context.getBean("pushTaskScheduler", ThreadPoolTaskScheduler.class);
            assertNotSame(deadlines, push);
            assertEquals(1, deadlines.getScheduledThreadPoolExecutor().getCorePoolSize());
            assertEquals(1, push.getScheduledThreadPoolExecutor().getCorePoolSize());
            assertEquals("pushTaskScheduler", PushSenderJob.class.getMethod("sendDue").getAnnotation(Scheduled.class).scheduler());
            CountDownLatch started = new CountDownLatch(1), release = new CountDownLatch(1), deadlineRan = new CountDownLatch(1);
            var blocked = push.schedule(() -> {
                started.countDown();
                try { release.await(5, TimeUnit.SECONDS); }
                catch (InterruptedException ex) { Thread.currentThread().interrupt(); }
            }, Instant.now());
            try {
                assertTrue(started.await(2, TimeUnit.SECONDS));
                deadlines.schedule(deadlineRan::countDown, Instant.now());
                assertTrue(deadlineRan.await(2, TimeUnit.SECONDS), "Deadline scheduler must remain independent from push HTTP");
            } finally { release.countDown(); if (blocked != null) blocked.cancel(true); }
        }
    }
}
