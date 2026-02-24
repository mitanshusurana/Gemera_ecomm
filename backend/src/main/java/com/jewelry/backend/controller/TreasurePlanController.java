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
}
