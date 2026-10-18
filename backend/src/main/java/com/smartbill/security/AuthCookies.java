package com.smartbill.security;

import org.springframework.http.ResponseCookie;

/** The JWT lives in an HttpOnly cookie so page JavaScript (and any XSS) can never read it. */
public class AuthCookies {
    public static final String NAME = "sb_token";
    private final boolean secure;
    private final JwtService jwt;

    public AuthCookies(boolean secure, JwtService jwt) {
        this.secure = secure;
        this.jwt = jwt;
    }

    public ResponseCookie issue(long userId) {
        return base(jwt.issue(userId)).maxAge(jwt.ttl()).build();
    }

    public ResponseCookie clear() {
        return base("").maxAge(0).build();
    }

    // Cross-site (Vercel -> Render) cookies need SameSite=None; Secure. Local http dev uses Lax.
    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(NAME, value).httpOnly(true).secure(secure)
                .sameSite(secure ? "None" : "Lax").path("/");
    }
}
