package com.laundry.shared;

import java.net.URI;
import java.security.Security;
import nl.martijndwars.webpush.PushService;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class PushSettings {
    private final PushService service;
    private final String publicKey;
    public PushSettings(@Value("${WEB_PUSH_PUBLIC_KEY:}") String publicKey,
                        @Value("${WEB_PUSH_PRIVATE_KEY:}") String privateKey,
                        @Value("${WEB_PUSH_SUBJECT:}") String subject) {
        if (publicKey.isBlank() || privateKey.isBlank() || subject.isBlank()) {
            service = null; this.publicKey = null; return;
        }
        try {
            Security.addProvider(new BouncyCastleProvider());
            PushValidation.keys(publicKey, java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]));
            PushValidation.key(privateKey, 32);
            URI contact = URI.create(subject);
            boolean email = "mailto".equals(contact.getScheme()) && contact.getSchemeSpecificPart().matches("[^\\s@?]+@[^\\s@?]+\\.[^\\s@?]+");
            String host = contact.getHost();
            boolean web = "https".equals(contact.getScheme()) && host != null && host.contains(".")
                && !host.equalsIgnoreCase("localhost") && !host.toLowerCase(java.util.Locale.ROOT).endsWith(".localhost")
                && !host.matches("[0-9.]+") && contact.getUserInfo() == null && contact.getFragment() == null;
            if (subject.length() > 512 || subject.chars().anyMatch(Character::isWhitespace) || !(email || web)) throw new IllegalArgumentException();
            service = new PushService(publicKey, privateKey, subject);
            // Detect mismatched key pairs at startup without disclosing either key.
            java.security.Signature signer = java.security.Signature.getInstance("SHA256withECDSA");
            byte[] probe = new byte[]{1, 2, 3};
            signer.initSign(service.getPrivateKey()); signer.update(probe); byte[] signature = signer.sign();
            signer.initVerify(service.getPublicKey()); signer.update(probe);
            if (!signer.verify(signature)) throw new IllegalArgumentException();
            this.publicKey = publicKey;
        } catch (Exception ex) { throw new IllegalStateException("Cấu hình Web Push không hợp lệ"); }
    }
    public boolean enabled() { return service != null; }
    public String publicKey() { return publicKey; }
    PushService service() { return service; }
}
