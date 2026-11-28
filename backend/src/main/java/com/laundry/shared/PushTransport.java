package com.laundry.shared;

public interface PushTransport {
    int send(PushOutboxService.Delivery delivery) throws Exception;
}
