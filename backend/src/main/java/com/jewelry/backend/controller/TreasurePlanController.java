package com.jewelry.backend.controller;

import com.jewelry.backend.dto.TreasureChestAccountDTO;
import com.jewelry.backend.dto.TreasureEnrollRequest;
import com.jewelry.backend.dto.TreasurePlanConfigDTO;
import com.jewelry.backend.entity.TreasureChestAccount;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.service.TreasurePlanService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;

@RestController
@RequestMapping("/api/v1/treasure")
@CrossOrigin(origins = "*")
@Tag(name = "Treasure Plan", description = "Treasure Chest Plan APIs")
public class TreasurePlanController {

    @Autowired
    TreasurePlanService treasurePlanService;

    @Autowired
    EntityMapper entityMapper;

    @GetMapping("/config")
    @Operation(summary = "Get plan configuration")
    public ResponseEntity<TreasurePlanConfigDTO> getConfig() {
        return ResponseEntity.ok(treasurePlanService.getConfig());
    }

    @GetMapping("/account")
    @Operation(summary = "Get plan details")
    public ResponseEntity<TreasureChestAccountDTO> getAccount(Principal principal) {
        return ResponseEntity.ok(entityMapper.toTreasureChestAccountDTO(treasurePlanService.getAccount(principal.getName())));
    }

    @PostMapping("/enroll")
    @Operation(summary = "Enroll in new plan")
    public ResponseEntity<TreasureChestAccountDTO> enroll(@RequestBody TreasureEnrollRequest request, Principal principal) {
        return ResponseEntity.ok(entityMapper.toTreasureChestAccountDTO(treasurePlanService.enroll(principal.getName(), request)));
    }

    @GetMapping("/accounts")
    @Operation(summary = "Get all plans (Admin)")
    public ResponseEntity<Iterable<TreasureChestAccountDTO>> getAllAccounts() {
        java.util.List<TreasureChestAccountDTO> dtoList = new java.util.ArrayList<>();
        treasurePlanService.getAllAccounts().forEach(account -> dtoList.add(entityMapper.toTreasureChestAccountDTO(account)));
        return ResponseEntity.ok(dtoList);
    }

    @PostMapping("/accounts/{id}/payment")
    @Operation(summary = "Record Payment (Admin)")
    public ResponseEntity<TreasureChestAccountDTO> recordPayment(@PathVariable java.util.UUID id) {
        return ResponseEntity.ok(entityMapper.toTreasureChestAccountDTO(treasurePlanService.recordPayment(id)));
    }

    @PostMapping("/accounts/{id}/skip")
    @Operation(summary = "Skip Month (Admin)")
    public ResponseEntity<TreasureChestAccountDTO> skipMonth(@PathVariable java.util.UUID id) {
        return ResponseEntity.ok(entityMapper.toTreasureChestAccountDTO(treasurePlanService.skipMonth(id)));
    }

    @PostMapping("/accounts/{id}/close")
    @Operation(summary = "Close Plan (Admin)")
    public ResponseEntity<TreasureChestAccountDTO> closePlan(@PathVariable java.util.UUID id) {
        return ResponseEntity.ok(entityMapper.toTreasureChestAccountDTO(treasurePlanService.closePlan(id)));
    }
}
