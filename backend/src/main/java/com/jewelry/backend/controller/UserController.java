package com.jewelry.backend.controller;

import com.jewelry.backend.dto.AddressDTO;
import com.jewelry.backend.dto.UserDTO;
import com.jewelry.backend.entity.Address;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    @Autowired
    UserRepository userRepository;

    @Autowired
    UserService userService;

    @Autowired
    EntityMapper entityMapper;

    @GetMapping("/me")
    @Operation(summary = "Get current user profile")
    public ResponseEntity<UserDTO> getMe(Principal principal) {
        User user = userRepository.findByEmail(principal.getName()).orElseThrow();
        return ResponseEntity.ok(entityMapper.toUserDTO(user));
    }

    @PutMapping("/profile")
    @Operation(summary = "Update user profile")
    public ResponseEntity<UserDTO> updateProfile(@RequestBody Map<String, Object> updates, Principal principal) {
        User user = userService.updateUserProfile(principal.getName(), updates);
        return ResponseEntity.ok(entityMapper.toUserDTO(user));
    }

    @GetMapping("/loyalty")
    @Operation(summary = "Get loyalty points")
    public ResponseEntity<Map<String, Object>> getLoyalty(Principal principal) {
        return ResponseEntity.ok(userService.getLoyalty(principal.getName()));
    }

    @PostMapping("/addresses")
    @Operation(summary = "Add address")
    public ResponseEntity<UserDTO> addAddress(@RequestBody @jakarta.validation.Valid AddressDTO addressDTO, Principal principal) {
        Address address = entityMapper.toAddressEntity(addressDTO);
        User user = userService.addAddress(principal.getName(), address);
        return ResponseEntity.ok(entityMapper.toUserDTO(user));
    }

    @PutMapping("/addresses/{id}")
    @Operation(summary = "Update address")
    public ResponseEntity<UserDTO> updateAddress(
            @PathVariable UUID id,
            @RequestBody Map<String, Object> updates,
            Principal principal) {
        User user = userService.updateAddress(principal.getName(), id, updates);
        return ResponseEntity.ok(entityMapper.toUserDTO(user));
    }

    @DeleteMapping("/addresses/{id}")
    @Operation(summary = "Delete address")
    public ResponseEntity<UserDTO> deleteAddress(@PathVariable UUID id, Principal principal) {
        User user = userService.deleteAddress(principal.getName(), id);
        return ResponseEntity.ok(entityMapper.toUserDTO(user));
    }
}
