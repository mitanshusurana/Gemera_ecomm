package com.jewelry.backend.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.util.Date;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import jakarta.annotation.PostConstruct;

@Component
public class JwtUtils {

    @Value("${spring.security.jwt.secret}")
    private String jwtSecret;

    @Value("${spring.security.jwt.expiration-ms}")
    private int jwtExpirationMs;

    private static final Logger logger = LoggerFactory.getLogger(JwtUtils.class);

    @PostConstruct
    public void init() {
        byte[] keyBytes = Decoders.BASE64.decode(jwtSecret);
        if (keyBytes.length < 32) {
            logger.warn("JWT Secret is too short! It should be at least 256 bits (32 bytes) for HS256. Current length: {} bytes", keyBytes.length);
        }
    }

    public String generateJwtToken(Authentication authentication) {
        UserDetails userPrincipal = (UserDetails) authentication.getPrincipal();
        String role = userPrincipal.getAuthorities().stream()
                .map(a -> a.getAuthority())
                .filter(a -> a != null && !a.isBlank())
                .findFirst()
                .orElse("USER");
        return generateTokenForUser(userPrincipal.getUsername(), role);
    }

    public String generateTokenFromEmail(String email) {
        return generateTokenForUser(email, "USER");
    }

    /**
     * Subject is the email; the "role" claim lets the admin SPA decide whether to
     * render its shell without a round trip. Authorisation is still enforced
     * server-side on every endpoint.
     */
    public String generateTokenForUser(String email, String role) {
        String normalized = (role == null || role.isBlank()) ? "USER" : role;
        if (normalized.startsWith("ROLE_")) {
            normalized = normalized.substring(5);
        }
        return Jwts.builder()
                .setSubject(email)
                .claim("role", normalized)
                .setIssuedAt(new Date())
                .setExpiration(new Date((new Date()).getTime() + jwtExpirationMs))
                .signWith(key(), SignatureAlgorithm.HS256)
                .compact();
    }

    private Key key() {
        return Keys.hmacShaKeyFor(Decoders.BASE64.decode(jwtSecret));
    }

    public String getUserNameFromJwtToken(String token) {
        return Jwts.parserBuilder().setSigningKey(key()).build()
               .parseClaimsJws(token).getBody().getSubject();
    }

    public boolean validateJwtToken(String authToken) {
        try {
            Jwts.parserBuilder().setSigningKey(key()).build().parse(authToken);
            return true;
        } catch (MalformedJwtException e) {
            logger.error("Invalid JWT token: {}", e.getMessage());
        } catch (ExpiredJwtException e) {
            logger.error("JWT token is expired: {}", e.getMessage());
        } catch (UnsupportedJwtException e) {
            logger.error("JWT token is unsupported: {}", e.getMessage());
        } catch (IllegalArgumentException e) {
            logger.error("JWT claims string is empty: {}", e.getMessage());
        }
        return false;
    }
}
