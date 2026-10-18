package com.smartbill.auth;

import jakarta.validation.constraints.*;

public final class AuthDtos {
    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 8, max = 72, message = "Password must be 8-72 characters") String password,
            @NotBlank @Size(max = 120) String fullName) {}

    public record LoginRequest(@NotBlank String email, @NotBlank String password) {}

    public record UserResponse(Long id, String email, String fullName, String timezone, boolean demo) {
        public static UserResponse from(User u) {
            return new UserResponse(u.id, u.email, u.fullName, u.timezone, u.demo);
        }
    }

    public record ProfileUpdate(@NotBlank @Size(max = 120) String fullName, @NotBlank String timezone) {}

    public record PasswordChange(@NotBlank String currentPassword,
                                 @NotBlank @Size(min = 8, max = 72) String newPassword) {}
}
