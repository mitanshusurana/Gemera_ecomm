package com.jewelry.backend.controller;

import com.jewelry.backend.dto.AuthResponse;
import com.jewelry.backend.dto.LoginRequest;
import com.jewelry.backend.dto.RegisterRequest;
import com.jewelry.backend.dto.RefreshTokenRequest;
import com.jewelry.backend.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")

@Tag(name = "Authentication", description = "Auth management APIs")
public class AuthController {

    @Autowired
    AuthService authService;

    @PostMapping("/register")
    @Operation(summary = "Register new user")
    @ApiResponse(responseCode = "201", description = "User registered successfully")
    public ResponseEntity<AuthResponse> register(@RequestBody RegisterRequest request) {
        return ResponseEntity.status(201).body(authService.register(request));
    }

    @PostMapping("/login")
    @Operation(summary = "Authenticate user")
    @ApiResponse(responseCode = "200", description = "Login successful")
    public ResponseEntity<AuthResponse> login(@RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Refresh JWT token")
    public ResponseEntity<AuthResponse> refresh(@RequestBody RefreshTokenRequest request) {
        return ResponseEntity.ok(authService.refreshToken(request.getRefreshToken()));
    }

    @PostMapping("/logout")
    @Operation(summary = "Logout user")
    public ResponseEntity<Map<String, String>> logout() {
        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }

    @PostMapping("/forgot-password")
    @Operation(summary = "Request password reset email")
    public ResponseEntity<Map<String, String>> forgotPassword(@RequestBody Map<String, String> request) {
        authService.forgotPassword(request.get("email"));
        return ResponseEntity.ok(Map.of("message", "If an account exists, a reset email has been sent."));
    }

    @PostMapping("/reset-password")
    @Operation(summary = "Reset password with token")
    public ResponseEntity<Map<String, String>> resetPassword(@RequestBody Map<String, String> request) {
        authService.resetPassword(request.get("token"), request.get("newPassword"));
        return ResponseEntity.ok(Map.of("message", "Password reset successfully."));
    }
}
