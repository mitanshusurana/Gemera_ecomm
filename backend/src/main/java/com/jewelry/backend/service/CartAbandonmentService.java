package com.jewelry.backend.service;

import com.jewelry.backend.entity.Cart;
import com.jewelry.backend.entity.EmailNotification;
import com.jewelry.backend.repository.CartRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

@Service
@RequiredArgsConstructor
public class CartAbandonmentService {

    private static final Logger LOGGER = Logger.getLogger(CartAbandonmentService.class.getName());

    private final CartRepository cartRepository;
    private final EmailService emailService;

    @Scheduled(fixedRate = 3600000)
    public void processAbandonedCarts() {
        LOGGER.info("Starting scheduled job: CartAbandonmentService");

        LocalDateTime cutoff = LocalDateTime.now().minusHours(24);
        BigDecimal threshold = new BigDecimal("50000");

        List<Cart> abandonedCarts = cartRepository.findByUpdatedAtBeforeAndTotalGreaterThanAndAbandonmentEmailSentFalse(cutoff, threshold);

        for (Cart cart : abandonedCarts) {
            if (cart.getUser() != null) {
                sendAbandonmentEmail(cart);
                cart.setAbandonmentEmailSent(true);
                cartRepository.save(cart);
            }
        }
    }

    private void sendAbandonmentEmail(Cart cart) {
        EmailNotification notification = new EmailNotification();
        notification.setEmail(cart.getUser().getEmail());
        notification.setSubject("Do you need help with your purchase?");
        notification.setType("CART_ABANDONMENT");

        notification.setData(Map.of(
            "name", cart.getUser().getFirstName() != null ? cart.getUser().getFirstName() : "Valued Customer",
            "cartTotal", cart.getTotal().toString()
        ));

        emailService.sendEmail(notification);
        LOGGER.info("Sent cart abandonment email to " + cart.getUser().getEmail());
    }
}
