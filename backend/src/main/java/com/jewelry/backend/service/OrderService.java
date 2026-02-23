package com.jewelry.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jewelry.backend.dto.CreateOrderRequest;
import com.jewelry.backend.dto.OrderTracking;
import com.jewelry.backend.entity.*;
import com.jewelry.backend.repository.CartRepository;
import com.jewelry.backend.repository.OrderItemRepository;
import com.jewelry.backend.repository.OrderRepository;
import com.jewelry.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
public class OrderService {

    @Autowired
    OrderRepository orderRepository;

    @Autowired
    OrderItemRepository orderItemRepository;

    @Autowired
    CartRepository cartRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    CartService cartService;

    @Autowired
    ObjectMapper objectMapper;

    @Transactional
    public Order createOrder(String userEmail, CreateOrderRequest request) {
        User user = userRepository.findByEmail(userEmail).orElseThrow();
        Cart cart = cartService.getCart(userEmail);

        if (cart.getItems().isEmpty()) {
            throw new RuntimeException("Cart is empty");
        }

        Order order = new Order();
        order.setUser(user);
        order.setTotal(cart.getTotal());
        order.setStatus("PENDING_PAYMENT");

        try {
            order.setShippingAddress(objectMapper.writeValueAsString(request.getShippingAddress()));
            order.setBillingAddress(objectMapper.writeValueAsString(request.getBillingAddress()));
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Error serializing address", e);
        }

        order.setPaymentMethod(request.getPaymentMethod());
        order.setShippingMethod(request.getShippingMethod());
        order.setEstimatedDelivery(LocalDate.now().plusDays(7)); // Mock estimated delivery

        if (request.getPaymentDetails() != null) {
            order.setRazorpayOrderId(request.getPaymentDetails().getRazorpay_order_id());
            order.setRazorpayPaymentId(request.getPaymentDetails().getRazorpay_payment_id());
            order.setRazorpaySignature(request.getPaymentDetails().getRazorpay_signature());
            // Assume payment is successful if details are provided (for now)
            order.setStatus("PAID");
        }

        Order savedOrder = orderRepository.save(order);

        for (CartItem cartItem : cart.getItems()) {
            OrderItem orderItem = new OrderItem();
            orderItem.setOrder(savedOrder);
            orderItem.setProduct(cartItem.getProduct());
            orderItem.setQuantity(cartItem.getQuantity());
            orderItem.setPrice(cartItem.getProduct().getPrice());
            orderItem.setOptions(cartItem.getOptions());

            orderItemRepository.save(orderItem);
        }

        // Clear cart
        cart.getItems().clear();
        cart.setSubtotal(java.math.BigDecimal.ZERO);
        cart.setTotal(java.math.BigDecimal.ZERO);
        cart.setDiscount(java.math.BigDecimal.ZERO);
        cart.setTax(java.math.BigDecimal.ZERO);
        cart.setShipping(java.math.BigDecimal.ZERO);
        cart.setAppliedCoupon(null);
        cartRepository.save(cart);

        return savedOrder;
    }

    public Page<Order> getUserOrders(String userEmail, Pageable pageable) {
        User user = userRepository.findByEmail(userEmail).orElseThrow();
        return orderRepository.findByUser(user, pageable);
    }

    public Order getOrder(UUID orderId) {
        return orderRepository.findById(orderId).orElseThrow(() -> new RuntimeException("Order not found"));
    }

    public OrderTracking trackOrder(UUID orderId) {
        Order order = getOrder(orderId);
        OrderTracking tracking = new OrderTracking();
        tracking.setOrderId(order.getId().toString());
        tracking.setStatus(order.getStatus());
        tracking.setEstimatedDelivery(order.getEstimatedDelivery());
        tracking.setTrackingNumber(order.getTrackingNumber());
        tracking.setHistory(List.of("Order Placed", "Payment Confirmed", "Processing")); // Mock history
        return tracking;
    }

    public Order updateStatus(UUID orderId, String status, String trackingNumber) {
        Order order = getOrder(orderId);
        order.setStatus(status);
        if (trackingNumber != null) {
            order.setTrackingNumber(trackingNumber);
        }
        return orderRepository.save(order);
    }
}
