package com.laundry.shared;

import java.net.URI;
import java.util.Base64;
import java.util.Locale;
import org.bouncycastle.jce.ECNamedCurveTable;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class PushValidation {
    private PushValidation() {}
    static String endpoint(String value) {
        try {
            if (value == null || value.length() < 20 || value.length() > 2048 || !value.matches("[\\x21-\\x7e]+")) throw new IllegalArgumentException();
            URI uri = URI.create(value);
            String host = uri.getHost();
            if (host == null || !"https".equals(uri.getScheme()) || uri.getPort() != -1
                || uri.getRawUserInfo() != null || uri.getRawFragment() != null || uri.getRawQuery() != null) throw new IllegalArgumentException();
            host = host.toLowerCase(Locale.ROOT);
            String path = uri.getRawPath();
            boolean allowed = (host.equals("fcm.googleapis.com") && path.startsWith("/fcm/send/"))
                || (host.equals("updates.push.services.mozilla.com") && path.startsWith("/wpush/v2/"))
                || (host.matches("[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.push\\.apple\\.com") && path.startsWith("/"));
            // FCM registration tokens contain ':' inside the path; it is not a URL authority separator here.
            if (!allowed || path.length() < 2 || path.endsWith("/") || !path.matches("/[A-Za-z0-9_./~:-]+")
                || path.contains("..") || path.contains("//")) throw new IllegalArgumentException();
            return value;
        } catch (IllegalArgumentException ex) { throw bad(); }
    }
    static byte[] key(String value, int bytes) {
        try {
            if (value == null || value.length() > 100 || !value.matches("[A-Za-z0-9_-]+={0,2}")) throw new IllegalArgumentException();
            byte[] decoded = Base64.getUrlDecoder().decode(value);
            if (decoded.length != bytes) throw new IllegalArgumentException();
            return decoded;
        } catch (IllegalArgumentException ex) { throw bad(); }
    }
    static void keys(String publicKey, String auth) {
        byte[] point = key(publicKey, 65);
        try {
            if (point[0] != 4 || !ECNamedCurveTable.getParameterSpec("secp256r1").getCurve().decodePoint(point).isValid()) throw new IllegalArgumentException();
        } catch (IllegalArgumentException ex) { throw bad(); }
        key(auth, 16);
    }
    static ResponseStatusException bad() { return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Đăng ký thông báo không hợp lệ"); }
}
