package com.laundry.shared;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class PushSenderJob {
    private final PushOutboxService outbox;
    private final PushTransport transport;
    private final PushSettings settings;
    public PushSenderJob(PushOutboxService outbox, PushTransport transport, PushSettings settings) {
        this.outbox = outbox; this.transport = transport; this.settings = settings;
    }
    @Scheduled(scheduler = "pushTaskScheduler", fixedDelayString = "${laundry.push.delay-ms:5000}", initialDelayString = "${laundry.push.initial-delay-ms:10000}")
    public void sendDue() {
        if (!settings.enabled()) return;
        for (var id : outbox.due()) {
            var delivery = outbox.claim(id); // Separate short transaction; committed before HTTP, no building lock.
            if (delivery == null) continue;
            int status;
            try { status = transport.send(delivery); }
            catch (InterruptedException ex) { Thread.currentThread().interrupt(); return; }
            catch (Exception ex) { status = 0; } // Do not log exceptions containing sensitive endpoint URLs.
            outbox.complete(delivery, status);
        }
        outbox.cleanup();
    }
}
