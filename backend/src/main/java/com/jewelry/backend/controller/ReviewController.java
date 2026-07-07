package com.jewelry.backend.controller;

import com.jewelry.backend.dto.ReviewDTO;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.service.ReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/reviews")
@Tag(name = "Reviews", description = "Product review APIs")
public class ReviewController {

    @Autowired
    private ReviewService reviewService;

    @Autowired
    private EntityMapper entityMapper;

    @PostMapping
    @Operation(summary = "Submit a review")
    public ResponseEntity<ReviewDTO> submitReview(@RequestBody ReviewDTO reviewDTO, Principal principal) {
        return ResponseEntity.ok(entityMapper.toReviewDTO(
                reviewService.createReview(principal.getName(), reviewDTO)
        ));
    }

    @GetMapping("/product/{productId}")
    @Operation(summary = "Get reviews for a product")
    public ResponseEntity<Page<ReviewDTO>> getProductReviews(
            @PathVariable UUID productId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "5") int size) {
        return ResponseEntity.ok(
                reviewService.getReviewsForProduct(productId, PageRequest.of(page, size))
                        .map(entityMapper::toReviewDTO)
        );
    }
}
