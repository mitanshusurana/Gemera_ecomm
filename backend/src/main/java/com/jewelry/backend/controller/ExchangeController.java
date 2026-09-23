package com.jewelry.backend.controller;

import com.jewelry.backend.dto.CreateExchangeRequest;
import com.jewelry.backend.dto.ExchangeQuoteResponse;
import com.jewelry.backend.dto.ExchangeRequestDTO;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.service.ExchangeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.security.Principal;
import java.util.List;
import java.util.UUID;

/**
 * Storefront side of the old gold exchange: public quote, request intake
 * (guest or signed in), the customer's own requests, and a public tracker.
 */
@RestController
@RequestMapping("/api/v1/exchange")
@Tag(name = "Old Gold Exchange", description = "Quote, hand in and track old gold or silver for store credit")
public class ExchangeController {

    @Autowired
    ExchangeService exchangeService;

    @Autowired
    UserRepository userRepository;

    @GetMapping("/quote")
    @Operation(summary = "Live estimate for old gold or silver: rate, purity fraction, deduction and value in INR")
    public ResponseEntity<ExchangeQuoteResponse> quote(
            @RequestParam String metal,
            @RequestParam String purity,
            @RequestParam BigDecimal weight) {
        return ResponseEntity.ok(exchangeService.quote(metal, purity, weight));
    }

    @PostMapping("/requests")
    @Operation(summary = "Place an exchange request (guest with name/phone/email, or signed in)")
    public ResponseEntity<ExchangeRequestDTO> create(@Valid @RequestBody CreateExchangeRequest body, Principal principal) {
        User user = currentUser(principal);
        return ResponseEntity.status(201).body(exchangeService.toDTO(exchangeService.create(body, user), false));
    }

    @GetMapping("/requests/mine")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "The signed-in customer's exchange requests, newest first")
    public ResponseEntity<List<ExchangeRequestDTO>> mine(Principal principal) {
        User user = currentUser(principal);
        if (user == null) {
            return ResponseEntity.status(401).build();
        }
        return ResponseEntity.ok(exchangeService.mine(user).stream().map(r -> exchangeService.toDTO(r, false)).toList());
    }

    @PostMapping("/requests/{id}/cancel")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Cancel one of your own requests while it is still REQUESTED")
    public ResponseEntity<ExchangeRequestDTO> cancel(@PathVariable UUID id, Principal principal) {
        User user = currentUser(principal);
        if (user == null) {
            return ResponseEntity.status(401).build();
        }
        return ResponseEntity.ok(exchangeService.toDTO(exchangeService.cancelByCustomer(id, user), false));
    }

    @GetMapping("/requests/track/{requestNumber}")
    @Operation(summary = "Public lookup by request number and the phone it was placed with")
    public ResponseEntity<ExchangeRequestDTO> track(@PathVariable String requestNumber, @RequestParam String phone) {
        return ResponseEntity.ok(exchangeService.toDTO(exchangeService.track(requestNumber, phone), false));
    }

    private User currentUser(Principal principal) {
        if (principal == null || principal.getName() == null) {
            return null;
        }
        return userRepository.findByEmail(principal.getName()).orElse(null);
    }
}
