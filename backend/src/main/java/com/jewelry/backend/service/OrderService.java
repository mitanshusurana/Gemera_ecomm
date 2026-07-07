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

    @Autowired
    PaymentService paymentService;

    @Transactional
    public Order createOrder(String userEmail, CreateOrderRequest request) {
        if (request.getPaymentDetails() != null && request.getPaymentDetails().getRazorpay_order_id() != null) {
            java.util.Optional<Order> existingOrder = orderRepository.findByRazorpayOrderId(request.getPaymentDetails().getRazorpay_order_id());
            if (existingOrder.isPresent()) {
                return existingOrder.get(); // Idempotency check: return existing order to avoid duplicates
            }
        }

        User user = userRepository.findByEmail(userEmail).orElseThrow();
        Cart cart = cartService.getCart(userEmail);

        if (cart.getItems().isEmpty()) {
            throw new RuntimeException("Cart is empty");
        }

        Order order = new Order();
        order.setUser(user);
        order.setTotal(cart.getTotal());
        order.setStatus("PENDING_PAYMENT");
        order.setOrderNumber("ORD-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        
        order.setSubtotal(cart.getSubtotal());
        order.setTax(cart.getTax());
        order.setShipping(cart.getShipping());
        order.setDiscount(cart.getDiscount());
        order.setAppliedCoupon(cart.getAppliedCoupon());

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

            // Cryptographically verify the payment signature
            com.jewelry.backend.dto.VerifyPaymentRequest verifyReq = new com.jewelry.backend.dto.VerifyPaymentRequest();
            verifyReq.setOrderId(request.getPaymentDetails().getRazorpay_order_id());
            verifyReq.setPaymentId(request.getPaymentDetails().getRazorpay_payment_id());
            verifyReq.setPaymentToken(request.getPaymentDetails().getRazorpay_signature());
            
            try {
                paymentService.verifyPayment(verifyReq);
                order.setStatus("PAID");
            } catch (Exception e) {
                order.setStatus("PAYMENT_FAILED");
            }
        } else if ("COD".equalsIgnoreCase(request.getPaymentMethod()) || "CASH_ON_DELIVERY".equalsIgnoreCase(request.getPaymentMethod())) {
            // Cash on delivery is considered confirmed but not paid yet
            order.setStatus("CONFIRMED");
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

    public Page<Order> getUserOrders(String userEmail, String status, Pageable pageable) {
        User user = userRepository.findByEmail(userEmail).orElseThrow();
        if (status != null && !status.isEmpty() && !status.equalsIgnoreCase("ALL")) {
            return orderRepository.findByUserAndStatus(user, status, pageable);
        }
        return orderRepository.findByUser(user, pageable);
    }

    public Page<Order> getAllOrders(String status, Pageable pageable) {
        if (status != null && !status.isEmpty() && !status.equalsIgnoreCase("ALL")) {
            return orderRepository.findByStatus(status, pageable);
        }
        return orderRepository.findAll(pageable);
    }

    public Order getOrder(UUID orderId) {
        return orderRepository.findById(orderId).orElseThrow(() -> new RuntimeException("Order not found"));
    }

    public Order getOrderByIdentifier(String identifier) {
        try {
            UUID id = UUID.fromString(identifier);
            return orderRepository.findById(id)
                .orElseGet(() -> orderRepository.findByOrderNumber(identifier)
                    .orElseThrow(() -> new RuntimeException("Order not found")));
        } catch (IllegalArgumentException e) {
            return orderRepository.findByOrderNumber(identifier).orElseThrow(() -> new RuntimeException("Order not found"));
        }
    }

    public OrderTracking trackOrder(String identifier) {
        Order order = getOrderByIdentifier(identifier);
        OrderTracking tracking = new OrderTracking();
        tracking.setOrderId(order.getId().toString());
        tracking.setOrderNumber(order.getOrderNumber());
        tracking.setStatus(order.getStatus());
        tracking.setEstimatedDelivery(order.getEstimatedDelivery());
        tracking.setTrackingNumber(order.getTrackingNumber());
        tracking.setHistory(List.of("Order Placed", "Payment Confirmed", "Processing")); // Mock history
        return tracking;
    }

    public Order updateOrderStatus(UUID orderId, String status) {
        Order order = getOrder(orderId);
        order.setStatus(status);
        return orderRepository.save(order);
    }

    public Order updateOrderTracking(UUID orderId, String trackingNumber) {
        Order order = getOrder(orderId);
        order.setTrackingNumber(trackingNumber);
        return orderRepository.save(order);
    }

    public Order updateOrderNotes(UUID orderId, String notes) {
        Order order = getOrder(orderId);
        order.setInternalNotes(notes);
        return orderRepository.save(order);
    }
}
