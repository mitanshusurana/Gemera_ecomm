package com.jewelry.backend.service;

import com.jewelry.backend.dto.ReviewDTO;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.Review;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.OrderRepository;
import com.jewelry.backend.repository.ProductRepository;
import com.jewelry.backend.repository.ReviewRepository;
import com.jewelry.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class ReviewService {

    @Autowired
    private ReviewRepository reviewRepository;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private UserRepository userRepository;

    public Review createReview(String email, ReviewDTO reviewDTO) {
        // 1. Verify user exists
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // 2. Verify product exists
        Product product = productRepository.findById(reviewDTO.getProductId())
                .orElseThrow(() -> new RuntimeException("Product not found"));

        // 3. Verify user has a delivered order for this product
        boolean hasPurchased = orderRepository.existsByUserIdAndStatusAndItemsProductId(
                user.getId(), "DELIVERED", product.getId());

        if (!hasPurchased) {
            throw new RuntimeException("Only customers with a delivered order for this product can write a review.");
        }

        // 4. Prevent multiple reviews for the same product by the same user
        if (reviewRepository.existsByUserIdAndProductId(user.getId(), product.getId())) {
            throw new RuntimeException("You have already reviewed this product.");
        }

        Review review = new Review();
        review.setRating(reviewDTO.getRating());
        review.setComment(reviewDTO.getComment());
        review.setUser(user);
        review.setProduct(product);

        return reviewRepository.save(review);
    }

    public Page<Review> getReviewsForProduct(UUID productId, Pageable pageable) {
        return reviewRepository.findByProductId(productId, pageable);
    }
}
