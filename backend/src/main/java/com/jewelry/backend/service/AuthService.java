package com.jewelry.backend.service;

import com.jewelry.backend.dto.AuthResponse;
import com.jewelry.backend.dto.LoginRequest;
import com.jewelry.backend.dto.RegisterRequest;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.security.JwtUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    @Autowired
    AuthenticationManager authenticationManager;

    @Autowired
    UserRepository userRepository;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    JwtUtils jwtUtils;

    @Autowired
    EntityMapper entityMapper;

    @Autowired
    RefreshTokenService refreshTokenService;

    @Autowired
    org.springframework.mail.javamail.JavaMailSender mailSender;

    @org.springframework.beans.factory.annotation.Value("${frontend.url:http://localhost:4200}")
    String frontendUrl;

    @org.springframework.transaction.annotation.Transactional
    public AuthResponse register(RegisterRequest registerRequest) {
        if (userRepository.findByEmail(registerRequest.getEmail()).isPresent()) {
            throw new RuntimeException("Error: Email is already in use!");
        }

        User user = new User();
        user.setEmail(registerRequest.getEmail());
        user.setPassword(encoder.encode(registerRequest.getPassword()));
        user.setFirstName(registerRequest.getFirstName());
        user.setLastName(registerRequest.getLastName());
        user.setPhone(registerRequest.getPhone());
        user.setRole("USER");

        User savedUser = userRepository.save(user);

        // Auto login
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(registerRequest.getEmail(), registerRequest.getPassword()));

        String jwt = jwtUtils.generateJwtToken(authentication);
        com.jewelry.backend.entity.RefreshToken refreshToken = refreshTokenService.createRefreshToken(savedUser.getId());
        return new AuthResponse(jwt, refreshToken.getToken(), entityMapper.toUserDTO(savedUser));
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public AuthResponse login(LoginRequest loginRequest) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(loginRequest.getEmail(), loginRequest.getPassword()));

        SecurityContextHolder.getContext().setAuthentication(authentication);
        String jwt = jwtUtils.generateJwtToken(authentication);

        User user = userRepository.findByEmail(loginRequest.getEmail()).orElseThrow();
        com.jewelry.backend.entity.RefreshToken refreshToken = refreshTokenService.createRefreshToken(user.getId());
        return new AuthResponse(jwt, refreshToken.getToken(), entityMapper.toUserDTO(user));
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public AuthResponse refreshToken(String requestRefreshToken) {
        return refreshTokenService.findByToken(requestRefreshToken)
                .map(refreshTokenService::verifyExpiration)
                .map(com.jewelry.backend.entity.RefreshToken::getUser)
                .map(user -> {
                    String token = jwtUtils.generateTokenFromEmail(user.getEmail());
                    return new AuthResponse(token, requestRefreshToken, entityMapper.toUserDTO(user));
                })
                .orElseThrow(() -> new RuntimeException("Refresh token is not in database!"));
    }

    public void forgotPassword(String email) {
        User user = userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
        String token = java.util.UUID.randomUUID().toString();
        user.setResetToken(token);
        user.setResetTokenExpiry(java.time.LocalDateTime.now().plusHours(1));
        userRepository.save(user);

        try {
            org.springframework.mail.SimpleMailMessage message = new org.springframework.mail.SimpleMailMessage();
            message.setTo(user.getEmail());
            message.setSubject("Password Reset Request");
            message.setText("To reset your password, click the link below:\n" + frontendUrl + "/reset-password?token=" + token);
            mailSender.send(message);
        } catch (Exception e) {
            throw new RuntimeException("Failed to send email");
        }
    }

    public void resetPassword(String token, String newPassword) {
        User user = userRepository.findByResetToken(token)
                .orElseThrow(() -> new RuntimeException("Invalid or expired token"));

        if (user.getResetTokenExpiry().isBefore(java.time.LocalDateTime.now())) {
            throw new RuntimeException("Token has expired");
        }

        user.setPassword(encoder.encode(newPassword));
        user.setResetToken(null);
        user.setResetTokenExpiry(null);
        userRepository.save(user);
    }

    public void changePassword(String email, String oldPassword, String newPassword) {
        User user = userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
        if (!encoder.matches(oldPassword, user.getPassword())) {
            throw new RuntimeException("Incorrect old password");
        }
        user.setPassword(encoder.encode(newPassword));
        userRepository.save(user);
    }
}
