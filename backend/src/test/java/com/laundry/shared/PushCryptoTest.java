package com.laundry.shared;

import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import nl.martijndwars.webpush.Encoding;
import nl.martijndwars.webpush.Notification;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PushCryptoTest {
    private String encode(byte[] bytes) { return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    private byte[] scalar(java.math.BigInteger n) {
        byte[] value = n.toByteArray(), output = new byte[32];
        int length = Math.min(value.length, 32); System.arraycopy(value, value.length - length, output, 32 - length, length); return output;
    }
    @Test void configuredLibraryProducesAes128gcmAndVapidForAppleWithoutNetwork() throws Exception {
        var generator = KeyPairGenerator.getInstance("EC"); generator.initialize(new ECGenParameterSpec("secp256r1"));
        var pair = generator.generateKeyPair(); var publicKey = (ECPublicKey) pair.getPublic();
        byte[] point = new byte[65]; point[0] = 4;
        System.arraycopy(scalar(publicKey.getW().getAffineX()), 0, point, 1, 32);
        System.arraycopy(scalar(publicKey.getW().getAffineY()), 0, point, 33, 32);
        String publicValue = encode(point), privateValue = encode(scalar(((ECPrivateKey) pair.getPrivate()).getS()));
        var settings = new PushSettings(publicValue, privateValue, "mailto:push@example.invalid");
        assertTrue(settings.enabled()); assertEquals(publicValue, settings.publicKey());
        var notification = new Notification("https://web.push.apple.com/test-token", publicValue, encode(new byte[16]), new byte[]{1,2,3}, 60);
        var request = settings.service().preparePost(notification, Encoding.AES128GCM);
        assertEquals("aes128gcm", request.getFirstHeader("Content-Encoding").getValue());
        assertTrue(request.getFirstHeader("Authorization").getValue().startsWith("vapid "));
        assertEquals("60", request.getFirstHeader("TTL").getValue());
        assertNotNull(request.getEntity());
        for (String subject : java.util.List.of("https://localhost/contact", "https://127.0.0.1/contact", "mailto:invalid", "http://example.invalid"))
            assertThrows(IllegalStateException.class, () -> new PushSettings(publicValue, privateValue, subject));
        assertThrows(IllegalStateException.class, () -> new PushSettings(publicValue, encode(new byte[32]), "mailto:push@example.invalid"));
    }
}
