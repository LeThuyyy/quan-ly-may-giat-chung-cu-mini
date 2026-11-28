package com.laundry.shared;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class PickupReminderJob {
    private final PickupReminderService reminders;
    private final PushTransport transport;
    private final PushSettings settings;
    public PickupReminderJob(PickupReminderService reminders, PushTransport transport, PushSettings settings) {
        this.reminders = reminders; this.transport = transport; this.settings = settings;
    }
    @Scheduled(scheduler = "pushTaskScheduler", fixedDelayString = "${laundry.push.delay-ms:5000}", initialDelayString = "${laundry.push.initial-delay-ms:10000}")
    public void sendDue() {
        if (!settings.enabled()) return;
        for (var candidate : reminders.candidates()) reminders.enqueue(candidate);
        for (var id : reminders.due()) {
            var delivery = reminders.claim(id); // Transaction committed and building lock released before HTTP.
            if (delivery == null) continue;
            int status;
            try { status = transport.send(delivery); }
            catch (InterruptedException ex) { Thread.currentThread().interrupt(); return; }
            catch (Exception ex) { status = 0; }
            reminders.complete(delivery, status);
        }
    }
}
