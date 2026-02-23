package com.jewelry.backend.config;

import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
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

    @Bean
    public CommandLineRunner initData() {
        return args -> {
            if (userRepository.findByEmail("admin@gemara.com").isEmpty()) {
                User admin = new User();
                admin.setEmail("admin@gemara.com");
                admin.setPassword(passwordEncoder.encode("admin123"));
                admin.setFirstName("Admin");
                admin.setLastName("User");
                admin.setPhone("0000000000");
                admin.setRole("ADMIN");
                userRepository.save(admin);
                System.out.println("Admin user created: admin@gemara.com / admin123");
            }
        };
    }
}
