package com.jewelry.backend.security;

import com.jewelry.backend.service.UserDetailsServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.core.env.Environment;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

  @Autowired
  UserDetailsServiceImpl userDetailsService;

  @Autowired
  private JwtAuthenticationFilter jwtAuthenticationFilter;

  @Autowired
  private Environment env;

  @Bean
  public DaoAuthenticationProvider authenticationProvider() {
    DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider();
    authProvider.setUserDetailsService(userDetailsService);
    authProvider.setPasswordEncoder(passwordEncoder());
    return authProvider;
  }

  @Bean
  public AuthenticationManager authenticationManager(AuthenticationConfiguration authConfig) throws Exception {
    return authConfig.getAuthenticationManager();
  }

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration configuration = new CorsConfiguration();

    // Allowed origins from environment
    String[] allowedOrigins = env.getProperty("app.cors.allowed-origins", "http://localhost:4200").split(",");
    
    // In prod profile, enforce HTTPS
    boolean isProd = Arrays.asList(env.getActiveProfiles()).contains("prod");
    List<String> originsList = Arrays.stream(allowedOrigins)
            .map(String::trim)
            .filter(origin -> !isProd || origin.startsWith("https://") || origin.startsWith("http://localhost"))
            .collect(Collectors.toList());

    configuration.setAllowedOrigins(originsList);

    // Allowed HTTP methods
    configuration.setAllowedMethods(Arrays.asList(
      "GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"
    ));

    // Allowed headers
    configuration.setAllowedHeaders(Arrays.asList(
      "Content-Type",
      "Authorization",
      "Accept",
      "X-Requested-With",
      "X-CSRF-Token"
    ));

    // Exposed headers
    configuration.setExposedHeaders(Arrays.asList(
      "Authorization",
      "Content-Disposition"
    ));

    // Allow credentials (cookies, auth headers)
    configuration.setAllowCredentials(true);

    // Cache preflight requests for 1 hour
    configuration.setMaxAge(3600L);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", configuration);
    source.registerCorsConfiguration("/auth/**", configuration);

    return source;
  }

  @Bean
  public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
      // CORS configuration - MUST be first!
      .cors(cors -> cors.configurationSource(corsConfigurationSource()))

      // CSRF disabled (using JWT instead)
      .csrf(csrf -> csrf.disable())
      // Unauthenticated requests answer 401, not the 403 of the default entry point,
      // so the SPA can tell "sign in" from "not allowed".
      .exceptionHandling(e -> e.authenticationEntryPoint(
          new org.springframework.security.web.authentication.HttpStatusEntryPoint(org.springframework.http.HttpStatus.UNAUTHORIZED)))

      // Session management
      .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

      // Authorization rules
      .authorizeHttpRequests(auth ->
        auth.requestMatchers("/api/v1/auth/**").permitAll()
          // Any back-office role may enter the admin URL space; each endpoint
          // then demands its own permission via @PreAuthorize("@access.has(...)").
          .requestMatchers("/api/v1/admin/**").hasAnyRole(StaffPermissions.STAFF_ROLES.toArray(String[]::new))
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/products/**").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/products").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/settings").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/stores/**").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/metal-prices", "/api/v1/metal-prices/**").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/categories").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/gift-cards/**").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/gift-cards/purchase").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/gift-cards/*/confirm").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/treasure/config").permitAll()
          // Old gold exchange: public quote, guest intake, and tracking by request number + phone.
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/exchange/quote").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/exchange/requests").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/exchange/requests/track/**").permitAll()
          // Razorpay server-to-server webhook: no JWT, authenticated by the
          // X-Razorpay-Signature HMAC that PaymentWebhookService verifies.
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/payments/webhook").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/certificates/**").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/orders/track/**").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/email/subscribe").permitAll()
          // Guests can ask to be told when a sold-out piece is back.
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/notifications/stock").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/appointments").permitAll()
          // Slot grid is public; guests cancel or move their booking with the phone they gave.
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/appointments/slots").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/appointments/*/cancel").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/appointments/*/reschedule").permitAll()
          // Repair jobs: guests may book, upload a photo, track and approve by job number + phone.
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/repairs/requests").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/repairs/photos").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/repairs/track/**").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/repairs/*/approve-estimate").permitAll()
          // Repair payment (Razorpay order + signature check) and the service invoice: same job number + phone gate.
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/repairs/*/payments/**").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/repairs/*/invoice").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/inquiries").permitAll()
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/reviews/**").permitAll()
          .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").hasRole("ADMIN")
          // Liveness probe only. Must precede the /actuator/** rule (first match
          // wins) so container healthchecks work; everything else stays admin-only.
          .requestMatchers(org.springframework.http.HttpMethod.GET, "/actuator/health").permitAll()
          .requestMatchers("/actuator/**").hasRole("ADMIN")
          .anyRequest().authenticated()
      )

      // Authentication provider
      .authenticationProvider(authenticationProvider())

      // JWT filter
      .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

    return http.build();
  }
}
