package com.jewelry.backend.service;

import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.security.StaffPermissions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;

@Service
public class UserDetailsServiceImpl implements UserDetailsService {

    @Autowired
    UserRepository userRepository;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("User Not Found with email: " + email));

        // Grant ROLE_<role> for whatever the stored role is (USER, ADMIN, SALES, ...);
        // AccessService maps that single authority onto the permission matrix.
        java.util.List<org.springframework.security.core.authority.SimpleGrantedAuthority> authorities = new ArrayList<>();
        String roleName = StaffPermissions.normalizeRole(user.getRole());
        if (roleName == null) {
            roleName = StaffPermissions.ROLE_USER;
        }
        authorities.add(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + roleName));

        // A deactivated staff account fails DaoAuthenticationProvider's
        // pre-checks (DisabledException) and is ignored by the JWT filter.
        boolean enabled = user.isActiveAccount();
        return new org.springframework.security.core.userdetails.User(
                user.getEmail(),
                user.getPassword(),
                enabled, true, true, true,
                authorities);
    }
}
