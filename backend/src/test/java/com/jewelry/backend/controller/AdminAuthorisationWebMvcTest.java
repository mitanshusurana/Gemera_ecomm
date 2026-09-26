package com.jewelry.backend.controller;

import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.security.AccessService;
import com.jewelry.backend.security.JwtAuthenticationFilter;
import com.jewelry.backend.security.JwtUtils;
import com.jewelry.backend.security.RateLimitingFilter;
import com.jewelry.backend.security.SecurityConfig;
import com.jewelry.backend.service.CouponService;
import com.jewelry.backend.service.ErpSyncService;
import com.jewelry.backend.service.InvoiceService;
import com.jewelry.backend.service.OrderService;
import com.jewelry.backend.service.StaffService;
import com.jewelry.backend.service.UserDetailsServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Authorisation through the real {@link SecurityConfig}, JWT filter and
 * {@code @PreAuthorize("@access.has(...)")} checks, with a token minted by the
 * real {@link JwtUtils}. Services are mocked; no database.
 */
@WebMvcTest(controllers = {AdminCouponController.class, AdminStaffController.class, OrderController.class})
@Import({SecurityConfig.class, JwtUtils.class, JwtAuthenticationFilter.class, RateLimitingFilter.class, AccessService.class})
@TestPropertySource(properties = {
        // Base64 of "test-jwt-secret-key-for-gemera-unit-tests-0123456789" (52 bytes >= 32).
        "spring.security.jwt.secret=dGVzdC1qd3Qtc2VjcmV0LWtleS1mb3ItZ2VtZXJhLXVuaXQtdGVzdHMtMDEyMzQ1Njc4OQ==",
        "spring.security.jwt.expiration-ms=60000",
        "app.cors.allowed-origins=http://localhost:4200"
})
class AdminAuthorisationWebMvcTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JwtUtils jwtUtils;

    /** BackendApplication carries @EnableJpaAuditing; the slice has no JPA metamodel, so it is mocked away. */
    @MockBean
    JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @MockBean
    UserDetailsServiceImpl userDetailsService;

    @MockBean
    CouponService couponService;

    @MockBean
    StaffService staffService;

    @MockBean
    OrderService orderService;

    @MockBean
    EntityMapper entityMapper;

    @MockBean
    UserRepository userRepository;

    @MockBean
    InvoiceService invoiceService;

    @MockBean
    ErpSyncService erpSyncService;

    private static final String SALES_EMAIL = "sales@test.local";
    private static final String ADMIN_EMAIL = "owner@test.local";

    @BeforeEach
    void users() {
        when(userDetailsService.loadUserByUsername(SALES_EMAIL)).thenReturn(
                new User(SALES_EMAIL, "n/a", true, true, true, true, List.of(new SimpleGrantedAuthority("ROLE_SALES"))));
        when(userDetailsService.loadUserByUsername(ADMIN_EMAIL)).thenReturn(
                new User(ADMIN_EMAIL, "n/a", true, true, true, true, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
        // Page.empty() is unpaged and cannot be serialised; a real PageImpl can.
        Page<com.jewelry.backend.entity.Order> none = new PageImpl<>(List.of(), PageRequest.of(0, 10), 0);
        when(orderService.getAllOrders(any(), any())).thenReturn(none);
        when(orderService.getUserOrders(anyString(), any(), any())).thenReturn(none);
    }

    private String bearer(String email, String role) {
        return "Bearer " + jwtUtils.generateTokenForUser(email, role);
    }

    @Test
    void salesCannotEditCoupons() throws Exception {
        mockMvc.perform(put("/api/v1/admin/coupons/{id}", UUID.randomUUID())
                        .header("Authorization", bearer(SALES_EMAIL, "SALES"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"TEN\",\"discountType\":\"PERCENTAGE\",\"discountValue\":10}"))
                .andExpect(status().isForbidden());
        verify(couponService, never()).update(any(), any());
    }

    @Test
    void adminCanEditCoupons() throws Exception {
        mockMvc.perform(put("/api/v1/admin/coupons/{id}", UUID.randomUUID())
                        .header("Authorization", bearer(ADMIN_EMAIL, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"TEN\"}"))
                .andExpect(status().isOk());
        verify(couponService).update(any(), any());
    }

    @Test
    void salesCanListOrders() throws Exception {
        mockMvc.perform(get("/api/v1/orders").header("Authorization", bearer(SALES_EMAIL, "SALES")))
                .andExpect(status().isOk());
        // orders.read makes a SALES user see every order, not only their own.
        verify(orderService).getAllOrders(any(), any());
        verify(orderService, never()).getUserOrders(anyString(), any(), any());
    }

    @Test
    void anonymousCannotReachStaffAdministration() throws Exception {
        // SecurityConfig sets an HttpStatusEntryPoint(401), so "not signed in"
        // is distinguishable from "signed in but not allowed" (403).
        mockMvc.perform(get("/api/v1/admin/staff"))
                .andExpect(status().isUnauthorized());
        verify(staffService, never()).list();
    }

    @Test
    void salesIsNotAllowedToManageStaffEvenInsideTheAdminSpace() throws Exception {
        mockMvc.perform(get("/api/v1/admin/staff").header("Authorization", bearer(SALES_EMAIL, "SALES")))
                .andExpect(status().isForbidden());
        verify(staffService, never()).list();
    }

    @Test
    void adminCanListStaff() throws Exception {
        when(staffService.list()).thenReturn(List.of());
        mockMvc.perform(get("/api/v1/admin/staff").header("Authorization", bearer(ADMIN_EMAIL, "ADMIN")))
                .andExpect(status().isOk());
    }

    @Test
    void anonymousCannotListOrders() throws Exception {
        mockMvc.perform(get("/api/v1/orders")).andExpect(status().isUnauthorized());
    }

    @Test
    void garbageTokenIsTreatedAsAnonymous() throws Exception {
        mockMvc.perform(get("/api/v1/admin/staff").header("Authorization", "Bearer not.a.jwt"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void roleComesFromTheAccountNotTheTokenClaim() throws Exception {
        // A token claiming ADMIN for an account whose stored role is SALES is
        // still SALES: the filter loads authorities from UserDetailsService.
        mockMvc.perform(get("/api/v1/admin/staff").header("Authorization", bearer(SALES_EMAIL, "ADMIN")))
                .andExpect(status().isForbidden());
    }
}
