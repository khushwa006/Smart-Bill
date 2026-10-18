package com.smartbill.auth;

import com.smartbill.security.AuthCookies;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class AuthController {
    private final AuthService auth;
    private final AuthCookies cookies;

    public AuthController(AuthService auth, AuthCookies cookies) {
        this.auth = auth;
        this.cookies = cookies;
    }

    @PostMapping("/auth/register")
    public ResponseEntity<AuthDtos.UserResponse> register(@Valid @RequestBody AuthDtos.RegisterRequest req) {
        User u = auth.register(req);
        return ResponseEntity.status(HttpStatus.CREATED)
                .header(HttpHeaders.SET_COOKIE, cookies.issue(u.id).toString())
                .body(AuthDtos.UserResponse.from(u));
    }

    @PostMapping("/auth/login")
    public ResponseEntity<AuthDtos.UserResponse> login(@Valid @RequestBody AuthDtos.LoginRequest req) {
        User u = auth.login(req);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookies.issue(u.id).toString())
                .body(AuthDtos.UserResponse.from(u));
    }

    /** Stateless JWT: logout clears the cookie; a copied token stays valid until expiry (documented trade-off). */
    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout() {
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookies.clear().toString()).build();
    }

    @GetMapping("/auth/me")
    public AuthDtos.UserResponse me(@AuthenticationPrincipal Long userId) {
        return AuthDtos.UserResponse.from(auth.get(userId));
    }

    @PutMapping("/profile")
    public AuthDtos.UserResponse update(@AuthenticationPrincipal Long userId,
                                        @Valid @RequestBody AuthDtos.ProfileUpdate req) {
        return AuthDtos.UserResponse.from(auth.updateProfile(userId, req));
    }

    @PostMapping("/profile/password")
    public ResponseEntity<Void> password(@AuthenticationPrincipal Long userId,
                                         @Valid @RequestBody AuthDtos.PasswordChange req) {
        auth.changePassword(userId, req);
        return ResponseEntity.noContent().build();
    }
}
