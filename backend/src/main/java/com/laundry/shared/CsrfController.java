package com.laundry.shared;

import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CsrfController {
    @GetMapping("/api/csrf")
    public TokenView token(CsrfToken token) {
        return new TokenView(token.getHeaderName(), token.getToken());
    }

    public record TokenView(String headerName, String token) {}
}
