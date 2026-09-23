package com.jewelry.backend.service;

import com.jewelry.backend.dto.CouponDTO;
import com.jewelry.backend.entity.Coupon;
import com.jewelry.backend.repository.CouponRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Admin CRUD for coupons. Codes are stored uppercased so the case-insensitive
 * lookup in CartService and the uniqueness check here agree.
 */
@Service
public class CouponService {

    @Autowired
    CouponRepository couponRepository;

    @Transactional(readOnly = true)
    public List<CouponDTO> list() {
        return couponRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toDTO).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public CouponDTO create(CouponDTO request) {
        String code = normalizeCode(request.getCode());
        if (couponRepository.existsByCodeIgnoreCase(code)) {
            throw new IllegalArgumentException("A coupon with code " + code + " already exists.");
        }
        Coupon coupon = new Coupon();
        coupon.setCode(code);
        coupon.setTimesUsed(0);
        coupon.setActive(request.getActive() == null || request.getActive());
        apply(coupon, request);
        return toDTO(couponRepository.save(coupon));
    }

    @Transactional(rollbackFor = Exception.class)
    public CouponDTO update(UUID id, CouponDTO request) {
        Coupon coupon = couponRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Coupon not found"));
        if (request.getCode() != null && !request.getCode().isBlank()) {
            String code = normalizeCode(request.getCode());
            if (!code.equalsIgnoreCase(coupon.getCode()) && couponRepository.existsByCodeIgnoreCase(code)) {
                throw new IllegalArgumentException("A coupon with code " + code + " already exists.");
            }
            coupon.setCode(code);
        }
        if (request.getActive() != null) {
            coupon.setActive(request.getActive());
        }
        apply(coupon, request);
        return toDTO(couponRepository.save(coupon));
    }

    /** Soft delete: past orders reference the code, so the row stays. */
    @Transactional(rollbackFor = Exception.class)
    public CouponDTO deactivate(UUID id) {
        Coupon coupon = couponRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Coupon not found"));
        coupon.setActive(false);
        return toDTO(couponRepository.save(coupon));
    }

    /** Copies the editable fields, validating type and value. Code and active are handled by the caller. */
    private static void apply(Coupon coupon, CouponDTO request) {
        String type = request.getDiscountType() == null ? coupon.getDiscountType()
                : request.getDiscountType().trim().toUpperCase(Locale.ROOT);
        if (type == null || !(type.equals("PERCENTAGE") || type.equals("FLAT"))) {
            throw new IllegalArgumentException("discountType must be PERCENTAGE or FLAT.");
        }
        BigDecimal value = request.getDiscountValue() != null ? request.getDiscountValue() : coupon.getDiscountValue();
        if (value == null || value.signum() <= 0) {
            throw new IllegalArgumentException("discountValue must be greater than zero.");
        }
        if (type.equals("PERCENTAGE") && value.compareTo(new BigDecimal("100")) > 0) {
            throw new IllegalArgumentException("A percentage discount cannot exceed 100.");
        }
        if (request.getUsageLimit() != null && request.getUsageLimit() < 0) {
            throw new IllegalArgumentException("usageLimit cannot be negative.");
        }
        if (request.getMinOrderValue() != null && request.getMinOrderValue().signum() < 0) {
            throw new IllegalArgumentException("minOrderValue cannot be negative.");
        }

        coupon.setDiscountType(type);
        coupon.setDiscountValue(value.setScale(2, RoundingMode.HALF_UP));
        coupon.setExpiryDate(request.getExpiryDate());
        coupon.setUsageLimit(request.getUsageLimit());
        coupon.setDescription(request.getDescription() == null ? null : request.getDescription().trim());
        coupon.setMinOrderValue(request.getMinOrderValue() == null ? null
                : request.getMinOrderValue().setScale(2, RoundingMode.HALF_UP));
    }

    private static String normalizeCode(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("A coupon code is required.");
        }
        String code = raw.trim().toUpperCase(Locale.ROOT);
        if (code.contains(" ")) {
            throw new IllegalArgumentException("A coupon code cannot contain spaces.");
        }
        return code;
    }

    public CouponDTO toDTO(Coupon coupon) {
        CouponDTO dto = new CouponDTO();
        dto.setId(coupon.getId());
        dto.setCode(coupon.getCode());
        dto.setDescription(coupon.getDescription());
        dto.setDiscountType(coupon.getDiscountType());
        dto.setDiscountValue(coupon.getDiscountValue());
        dto.setExpiryDate(coupon.getExpiryDate());
        dto.setUsageLimit(coupon.getUsageLimit());
        dto.setTimesUsed(coupon.getTimesUsed() == null ? 0 : coupon.getTimesUsed());
        dto.setActive(coupon.getActive() != null && coupon.getActive());
        dto.setMinOrderValue(coupon.getMinOrderValue());
        return dto;
    }
}
