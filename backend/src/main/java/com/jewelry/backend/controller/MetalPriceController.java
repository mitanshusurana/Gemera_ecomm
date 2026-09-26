package com.jewelry.backend.controller;

import com.jewelry.backend.dto.MetalRateBoardDTO;
import com.jewelry.backend.dto.MetalRateHistoryPointDTO;
import com.jewelry.backend.service.MetalRateBoardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Public metal rates. {@code /today} is the rate board (locked for the day
 * or live); {@code /history} the locked rates over time. The bare path keeps
 * the shape the old storefront ticker reads ({@code 24k/22k/18k}) but the
 * figures are now rupees per gram from the same board.
 */
@RestController
@RequestMapping("/api/v1/metal-prices")
@Tag(name = "Metal rates", description = "Rate of the day and live metal prices in INR per gram")
public class MetalPriceController {

    @Autowired
    MetalRateBoardService boardService;

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "Legacy ticker shape: 24k/22k/18k in INR per gram from today's board")
    public ResponseEntity<Map<String, Object>> getLivePrices() {
        MetalRateBoardDTO board = boardService.today();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("gold_usd", board.getLive() == null ? null : board.getLive().getGoldUsdPerOunce());
        out.put("24k", board.ratePerGram("GOLD", "24K").orElse(null));
        out.put("22k", board.ratePerGram("GOLD", "22K").orElse(null));
        out.put("18k", board.ratePerGram("GOLD", "18K").orElse(null));
        out.put("14k", board.ratePerGram("GOLD", "14K").orElse(null));
        out.put("silver_999", board.ratePerGram("SILVER", "999").orElse(null));
        out.put("silver_925", board.ratePerGram("SILVER", "925").orElse(null));
        out.put("platinum_950", board.ratePerGram("PLATINUM", "950").orElse(null));
        out.put("currency", "INR");
        out.put("unit", "gram");
        out.put("is_mock", board.isIndicative());
        out.put("source", board.getSource());
        out.put("asOf", board.getAsOf());
        return ResponseEntity.ok(out);
    }

    @GetMapping("/today")
    @Transactional(readOnly = true)
    @Operation(summary = "Today's rate board (IST): the locked board when one exists, otherwise the live derivation")
    public ResponseEntity<MetalRateBoardDTO> today() {
        return ResponseEntity.ok(boardService.today());
    }

    @GetMapping("/history")
    @Transactional(readOnly = true)
    @Operation(summary = "Locked rates for one metal and purity over the last N days (default 30, max 366)")
    public ResponseEntity<List<MetalRateHistoryPointDTO>> history(
            @RequestParam(defaultValue = "GOLD") String metal,
            @RequestParam(required = false) String purity,
            @RequestParam(required = false) Integer days) {
        return ResponseEntity.ok(boardService.history(metal, purity, days));
    }
}
