package com.jewelry.backend.controller;

import com.jewelry.backend.dto.LockMetalRatesRequest;
import com.jewelry.backend.dto.MetalRateBoardDTO;
import com.jewelry.backend.dto.RepriceResultDTO;
import com.jewelry.backend.security.AccessService;
import com.jewelry.backend.service.MetalRateBoardService;
import com.jewelry.backend.service.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Rate-of-the-day management ({@code rates.write}): see the live board,
 * lock today's board (with or without typed figures) and reprice every
 * METAL_RATE product from the current board.
 */
@RestController
@RequestMapping("/api/v1/admin/metal-rates")
@PreAuthorize("@access.has('rates.write')")
@Tag(name = "Admin Metal Rates", description = "Live feed, daily rate lock and catalogue repricing")
public class AdminMetalRateController {

    @Autowired
    MetalRateBoardService boardService;

    @Autowired
    ProductService productService;

    @Autowired
    AccessService access;

    @GetMapping("/live")
    @Transactional(readOnly = true)
    @Operation(summary = "Fresh fetch of the feed and FX, derived into a board (ignores any lock)")
    public ResponseEntity<MetalRateBoardDTO> live() {
        return ResponseEntity.ok(boardService.liveBoard(true));
    }

    @GetMapping("/today")
    @Transactional(readOnly = true)
    @Operation(summary = "Today's board as the storefront sees it (locked or live)")
    public ResponseEntity<MetalRateBoardDTO> today() {
        return ResponseEntity.ok(boardService.today());
    }

    @PostMapping("/lock")
    @Transactional
    @Operation(summary = "Lock today's board: body {rates:[{metal,purity,ratePerGram}], note}; missing purities derive from the metal's 24K/999/950 line, missing metals from the live feed. Reprices METAL_RATE products.")
    public ResponseEntity<MetalRateBoardDTO> lock(@RequestBody(required = false) LockMetalRatesRequest request) {
        MetalRateBoardDTO board = boardService.lock(request, access.currentEmail());
        productService.repriceMetalRateProducts(board);
        return ResponseEntity.ok(board);
    }

    @PostMapping("/reprice")
    @Transactional
    @Operation(summary = "Reprice every METAL_RATE product from today's board (locked or live)")
    public ResponseEntity<RepriceResultDTO> reprice() {
        return ResponseEntity.ok(productService.repriceMetalRateProducts(boardService.today()));
    }
}
