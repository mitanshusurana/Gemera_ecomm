package com.jewelry.backend;

import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.service.MetalPriceService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Boots the whole application against the in-memory H2 datasource declared in
 * {@code application-test.yml}. The one bean that reaches the network at
 * startup (the gold price feed) is mocked; every other external system is
 * configured with dummy values and never contacted during a context load.
 */
@SpringBootTest
@ActiveProfiles("test")
class BackendApplicationTests {

	/** MetalPriceService.init() calls goldapi.io in @PostConstruct; the mock keeps the test offline. */
	@MockBean
	MetalPriceService metalPriceService;

	@Autowired
	SecurityFilterChain securityFilterChain;

	@Autowired
	UserRepository userRepository;

	@Test
	void contextLoads() {
		assertThat(securityFilterChain).isNotNull();
	}

	@Test
	void dataInitializerSeedsTheAdminAccount() {
		// DataInitializer runs as a CommandLineRunner against H2 and creates
		// the admin from app.admin.email / app.admin.password.
		assertThat(userRepository.findByEmail("admin@test.local"))
				.isPresent()
				.get()
				.satisfies(user -> assertThat(user.getRole()).isEqualTo("ADMIN"));
	}
}
