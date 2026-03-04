package com.jewelry.backend.config;

import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class DataInitializer {

    @Autowired
    UserRepository userRepository;

    @Autowired
    PasswordEncoder passwordEncoder;

    @Value("${app.admin.email}")
    private String adminEmail;

    @Value("${app.admin.password}")
    private String adminPassword;

    @Bean
    public CommandLineRunner initData() {
        return args -> {
            if (adminPassword == null || adminPassword.isEmpty()) {
                System.err.println("WARNING: Admin password not provided. Skipping initial admin user creation.");
                return;
            }
            if (userRepository.findByEmail(adminEmail).isEmpty()) {
                User admin = new User();
                admin.setEmail(adminEmail);
                admin.setPassword(passwordEncoder.encode(adminPassword));
                admin.setFirstName("Admin");
                admin.setLastName("User");
                admin.setPhone("0000000000");
                admin.setRole("ADMIN");
                userRepository.save(admin);
                System.out.println("Admin user created: " + adminEmail);
            }
        };
    }
}
