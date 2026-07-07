package com.jewelry.backend.mapper;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jewelry.backend.dto.*;
import com.jewelry.backend.entity.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class EntityMapper {

    @Autowired
    private ObjectMapper objectMapper;

    // --- User ---
    public UserDTO toUserDTO(User user) {
        if (user == null) return null;
        UserDTO dto = new UserDTO();
        dto.setId(user.getId());
        dto.setEmail(user.getEmail());
        dto.setFirstName(user.getFirstName());
        dto.setLastName(user.getLastName());
        dto.setPhone(user.getPhone());
        dto.setRole(user.getRole());
        dto.setLoyaltyPoints(user.getLoyaltyPoints());
        if (user.getAddresses() != null) {
            dto.setAddresses(user.getAddresses().stream().map(this::toAddressDTO).collect(Collectors.toList()));
        }
        dto.setTotalSpend(java.math.BigDecimal.ZERO);
        dto.setTier("Gold");
        return dto;
    }

    public Product toProductEntity(ProductDTO dto) {
        if (dto == null) return null;
        Product product = new Product();
        product.setId(dto.getId()); // Usually not set for create, but handled by service if needed
        product.setName(dto.getName());
        product.setDescription(dto.getDescription());
        product.setPrice(dto.getPrice());
        product.setCategory(dto.getCategory());
        product.setSubCategory(dto.getSubCategory());
        product.setSku(dto.getSku());
        product.setIsVerified(dto.getIsVerified());
        product.setStock(dto.getStock());
        product.setVideoUrl(dto.getVideoUrl());

        product.setSeoTitle(dto.getSeoTitle());
        product.setSeoDescription(dto.getSeoDescription());
        product.setOgImage(dto.getOgImage());

        product.setInventoryOwnership(dto.getInventoryOwnership());
        product.setSupplierName(dto.getSupplierName());
        product.setReturnDueDate(dto.getReturnDueDate());
        product.setCommissionPercentage(dto.getCommissionPercentage());
        product.setSeoQualifiers(dto.getSeoQualifiers());
        product.setOccasionKeywords(dto.getOccasionKeywords());

        product.setImages(dto.getImages());
        product.setSpecifications(dto.getSpecifications());
        product.setOccasions(dto.getOccasions());
        product.setStyles(dto.getStyles());

        // 1. Finished Jewelry
        product.setGrossWeight(dto.getGrossWeight());
        product.setTotalCaratWeight(dto.getTotalCaratWeight());
        product.setDimensions(dto.getDimensions());
        product.setCurrentLocation(dto.getCurrentLocation());
        product.setHuid(dto.getHuid());
        product.setBisHallmark(dto.getBisHallmark());
        product.setHallmarkingDate(dto.getHallmarkingDate());
        product.setDesignStyle(dto.getDesignStyle());
        product.setMetalColor(dto.getMetalColor());
        product.setManufacturingTerminology(dto.getManufacturingTerminology());
        product.setStoneDetailIds(dto.getStoneDetailIds());

        if (dto.getMetalDetails() != null) {
            MetalDetail metalDetail = new MetalDetail();
            metalDetail.setId(dto.getMetalDetails().getId());
            metalDetail.setMetalType(dto.getMetalDetails().getMetalType());
            metalDetail.setMetalPurity(dto.getMetalDetails().getMetalPurity());
            metalDetail.setNetWeight(dto.getMetalDetails().getNetWeight());
            product.setMetalDetails(metalDetail);
        }

        if (dto.getStoneDetails() != null) {
            product.setStoneDetails(dto.getStoneDetails().stream().map(stoneDto -> {
                StoneDetail stone = new StoneDetail();
                stone.setId(stoneDto.getId());
                stone.setStoneType(stoneDto.getStoneType());
                stone.setShape(stoneDto.getShape());
                stone.setPieceCount(stoneDto.getPieceCount());
                stone.setTotalCaratWeight(stoneDto.getTotalCaratWeight());
                stone.setSettingType(stoneDto.getSettingType());
                return stone;
            }).collect(Collectors.toList()));
        }

        // 2. Loose Gemstones
        product.setStoneSku(dto.getStoneSku());
        product.setSpecies(dto.getSpecies());
        product.setVariety(dto.getVariety());
        product.setShape(dto.getShape());
        product.setCut(dto.getCut());
        product.setCaratWeight(dto.getCaratWeight());
        product.setColorHue(dto.getColorHue());
        product.setColorTone(dto.getColorTone());
        product.setColorSaturation(dto.getColorSaturation());
        product.setColorTradeTerm(dto.getColorTradeTerm());
        product.setClarity(dto.getClarity());
        product.setMeasurements(dto.getMeasurements());
        product.setTreatmentStatus(dto.getTreatmentStatus());
        product.setLabReportNumber(dto.getLabReportNumber());
        product.setCertificateImage(dto.getCertificateImage());
        product.setPolish(dto.getPolish());
        product.setSymmetry(dto.getSymmetry());
        product.setFluorescence(dto.getFluorescence());
        product.setGirdle(dto.getGirdle());
        product.setCulet(dto.getCulet());
        product.setTablePercentage(dto.getTablePercentage());
        product.setDepthPercentage(dto.getDepthPercentage());
        product.setOriginProvenance(dto.getOriginProvenance());
        product.setStockStatus(dto.getStockStatus());

        // 3. Spiritual Idols
        product.setSubjectDeityName(dto.getSubjectDeityName());
        product.setGemstoneMaterial(dto.getGemstoneMaterial());
        product.setCarvingStyle(dto.getCarvingStyle());
        product.setQualityDescription(dto.getQualityDescription());
        product.setAsana(dto.getAsana());
        product.setMudra(dto.getMudra());
        product.setAyudha(dto.getAyudha());
        product.setVahana(dto.getVahana());
        product.setArtistName(dto.getArtistName());
        product.setHistoricalContext(dto.getHistoricalContext());
        product.setCarvingTechnique(dto.getCarvingTechnique());

        // 4. Materials & Roughs
        product.setLotNumber(dto.getLotNumber());
        product.setMineOrigin(dto.getMineOrigin());
        product.setRoughMaterial(dto.getRoughMaterial());
        product.setRoughWeight(dto.getRoughWeight());
        product.setPurchaseDate(dto.getPurchaseDate());
        product.setSupplierCode(dto.getSupplierCode());
        product.setAcquisitionCost(dto.getAcquisitionCost());
        product.setMatrixParentRock(dto.getMatrixParentRock());
        product.setCrystalMorphology(dto.getCrystalMorphology());
        product.setYieldEstimate(dto.getYieldEstimate());
        product.setWastageLog(dto.getWastageLog());
        product.setManufacturingStage(dto.getManufacturingStage());

        // 5. Components
        product.setComponentType(dto.getComponentType());
        product.setMaterial(dto.getMaterial());
        product.setPurity(dto.getPurity());
        product.setQuantityPcs(dto.getQuantityPcs());
        product.setWeightPerPiece(dto.getWeightPerPiece());
        product.setTotalWeight(dto.getTotalWeight());
        product.setReorderPointAlert(dto.getReorderPointAlert());
        product.setBeadStyle(dto.getBeadStyle());
        product.setLayoutPattern(dto.getLayoutPattern());
        product.setVendorInformation(dto.getVendorInformation());
        product.setMinOrderQuantity(dto.getMinOrderQuantity());

        if (dto.getPriceBreakup() != null) {
            com.jewelry.backend.entity.Product.PriceBreakup pb = new com.jewelry.backend.entity.Product.PriceBreakup();
            pb.setMetal(dto.getPriceBreakup().getMetal());
            pb.setGemstone(dto.getPriceBreakup().getGemstone());
            pb.setMakingCharges(dto.getPriceBreakup().getMakingCharges());
            pb.setTax(dto.getPriceBreakup().getTax());
            pb.setTotal(dto.getPriceBreakup().getTotal());
            pb.setDiscount(dto.getPriceBreakup().getDiscount());
            pb.setGrandTotal(dto.getPriceBreakup().getGrandTotal());
            product.setPriceBreakup(pb);
        }



        if (dto.getCustomizationOptions() != null) {
            product.setCustomizationOptions(dto.getCustomizationOptions().stream().map(optDto -> {
                Product.CustomizationOption opt = new Product.CustomizationOption();
                opt.setType(optDto.getType());
                opt.setName(optDto.getName());
                opt.setPriceModifier(optDto.getPriceModifier());
                return opt;
            }).collect(Collectors.toList()));
        }


        return product;
    }

    public AddressDTO toAddressDTO(Address address) {
        if (address == null) return null;
        AddressDTO dto = new AddressDTO();
        dto.setId(address.getId());
        dto.setFirstName(address.getFirstName());
        dto.setLastName(address.getLastName());
        dto.setStreet(address.getStreet());
        dto.setCity(address.getCity());
        dto.setState(address.getState());
        dto.setZipCode(address.getZipCode());
        dto.setCountry(address.getCountry());
        dto.setPhone(address.getPhone());
        dto.setDefault(address.isDefault());
        return dto;
    }

    public Address toAddressEntity(AddressDTO dto) {
        if (dto == null) return null;
        Address address = new Address();
        address.setFirstName(dto.getFirstName());
        address.setLastName(dto.getLastName());
        address.setStreet(dto.getStreet());
        address.setCity(dto.getCity());
        address.setState(dto.getState());
        address.setZipCode(dto.getZipCode());
        address.setCountry(dto.getCountry());
        address.setPhone(dto.getPhone());
        address.setDefault(dto.isDefault());
        return address;
    }

    // --- Product ---
    public ProductDTO toProductDTO(Product product) {
        if (product == null) return null;
        ProductDTO dto = new ProductDTO();
        dto.setId(product.getId());
        dto.setName(product.getName());
        dto.setDescription(product.getDescription());
        dto.setPrice(product.getPrice());
        dto.setCategory(product.getCategory());
        dto.setSubCategory(product.getSubCategory());
        dto.setSku(product.getSku());
        dto.setIsVerified(product.getIsVerified());
        dto.setStock(product.getStock());
        dto.setVideoUrl(product.getVideoUrl());

        dto.setSeoTitle(product.getSeoTitle());
        dto.setSeoDescription(product.getSeoDescription());
        dto.setOgImage(product.getOgImage());

        dto.setInventoryOwnership(product.getInventoryOwnership());
        dto.setSupplierName(product.getSupplierName());
        dto.setReturnDueDate(product.getReturnDueDate());
        dto.setCommissionPercentage(product.getCommissionPercentage());
        dto.setSeoQualifiers(product.getSeoQualifiers());
        dto.setOccasionKeywords(product.getOccasionKeywords());

        dto.setImages(product.getImages());
        dto.setSpecifications(product.getSpecifications());
        dto.setOccasions(product.getOccasions());
        dto.setStyles(product.getStyles());

        // 1. Finished Jewelry
        dto.setGrossWeight(product.getGrossWeight());
        dto.setTotalCaratWeight(product.getTotalCaratWeight());
        dto.setDimensions(product.getDimensions());
        dto.setCurrentLocation(product.getCurrentLocation());
        dto.setHuid(product.getHuid());
        dto.setBisHallmark(product.getBisHallmark());
        dto.setHallmarkingDate(product.getHallmarkingDate());
        dto.setDesignStyle(product.getDesignStyle());
        dto.setMetalColor(product.getMetalColor());
        dto.setManufacturingTerminology(product.getManufacturingTerminology());
        dto.setStoneDetailIds(product.getStoneDetailIds());

        if (product.getMetalDetails() != null) {
            MetalDetailDTO metalDetailDTO = new MetalDetailDTO();
            metalDetailDTO.setId(product.getMetalDetails().getId());
            metalDetailDTO.setMetalType(product.getMetalDetails().getMetalType());
            metalDetailDTO.setMetalPurity(product.getMetalDetails().getMetalPurity());
            metalDetailDTO.setNetWeight(product.getMetalDetails().getNetWeight());
            dto.setMetalDetails(metalDetailDTO);
        }

        if (product.getStoneDetails() != null) {
            dto.setStoneDetails(product.getStoneDetails().stream().map(stone -> {
                StoneDetailDTO stoneDto = new StoneDetailDTO();
                stoneDto.setId(stone.getId());
                stoneDto.setStoneType(stone.getStoneType());
                stoneDto.setShape(stone.getShape());
                stoneDto.setPieceCount(stone.getPieceCount());
                stoneDto.setTotalCaratWeight(stone.getTotalCaratWeight());
                stoneDto.setSettingType(stone.getSettingType());
                return stoneDto;
            }).collect(Collectors.toList()));
        }

        // 2. Loose Gemstones
        dto.setStoneSku(product.getStoneSku());
        dto.setSpecies(product.getSpecies());
        dto.setVariety(product.getVariety());
        dto.setShape(product.getShape());
        dto.setCut(product.getCut());
        dto.setCaratWeight(product.getCaratWeight());
        dto.setColorHue(product.getColorHue());
        dto.setColorTone(product.getColorTone());
        dto.setColorSaturation(product.getColorSaturation());
        dto.setColorTradeTerm(product.getColorTradeTerm());
        dto.setClarity(product.getClarity());
        dto.setMeasurements(product.getMeasurements());
        dto.setTreatmentStatus(product.getTreatmentStatus());
        dto.setLabReportNumber(product.getLabReportNumber());
        dto.setCertificateImage(product.getCertificateImage());
        dto.setPolish(product.getPolish());
        dto.setSymmetry(product.getSymmetry());
        dto.setFluorescence(product.getFluorescence());
        dto.setGirdle(product.getGirdle());
        dto.setCulet(product.getCulet());
        dto.setTablePercentage(product.getTablePercentage());
        dto.setDepthPercentage(product.getDepthPercentage());
        dto.setOriginProvenance(product.getOriginProvenance());
        dto.setStockStatus(product.getStockStatus());

        // 3. Spiritual Idols
        dto.setSubjectDeityName(product.getSubjectDeityName());
        dto.setGemstoneMaterial(product.getGemstoneMaterial());
        dto.setCarvingStyle(product.getCarvingStyle());
        dto.setQualityDescription(product.getQualityDescription());
        dto.setAsana(product.getAsana());
        dto.setMudra(product.getMudra());
        dto.setAyudha(product.getAyudha());
        dto.setVahana(product.getVahana());
        dto.setArtistName(product.getArtistName());
        dto.setHistoricalContext(product.getHistoricalContext());
        dto.setCarvingTechnique(product.getCarvingTechnique());

        // 4. Materials & Roughs
        dto.setLotNumber(product.getLotNumber());
        dto.setMineOrigin(product.getMineOrigin());
        dto.setRoughMaterial(product.getRoughMaterial());
        dto.setRoughWeight(product.getRoughWeight());
        dto.setPurchaseDate(product.getPurchaseDate());
        dto.setSupplierCode(product.getSupplierCode());
        dto.setAcquisitionCost(product.getAcquisitionCost());
        dto.setMatrixParentRock(product.getMatrixParentRock());
        dto.setCrystalMorphology(product.getCrystalMorphology());
        dto.setYieldEstimate(product.getYieldEstimate());
        dto.setWastageLog(product.getWastageLog());
        dto.setManufacturingStage(product.getManufacturingStage());

        // 5. Components
        dto.setComponentType(product.getComponentType());
        dto.setMaterial(product.getMaterial());
        dto.setPurity(product.getPurity());
        dto.setQuantityPcs(product.getQuantityPcs());
        dto.setWeightPerPiece(product.getWeightPerPiece());
        dto.setTotalWeight(product.getTotalWeight());
        dto.setReorderPointAlert(product.getReorderPointAlert());
        dto.setBeadStyle(product.getBeadStyle());
        dto.setLayoutPattern(product.getLayoutPattern());
        dto.setVendorInformation(product.getVendorInformation());
        dto.setMinOrderQuantity(product.getMinOrderQuantity());

        if (product.getPriceBreakup() != null) {
            com.jewelry.backend.dto.ProductDTO.PriceBreakupDTO pb = new com.jewelry.backend.dto.ProductDTO.PriceBreakupDTO();
            pb.setMetal(product.getPriceBreakup().getMetal());
            pb.setGemstone(product.getPriceBreakup().getGemstone());
            pb.setMakingCharges(product.getPriceBreakup().getMakingCharges());
            pb.setTax(product.getPriceBreakup().getTax());
            pb.setTotal(product.getPriceBreakup().getTotal());
            pb.setDiscount(product.getPriceBreakup().getDiscount());
            pb.setGrandTotal(product.getPriceBreakup().getGrandTotal());
            dto.setPriceBreakup(pb);
        }



        if (product.getCustomizationOptions() != null) {
            dto.setCustomizationOptions(product.getCustomizationOptions().stream().map(opt -> {
                ProductDTO.CustomizationOptionDTO optDto = new ProductDTO.CustomizationOptionDTO();
                optDto.setType(opt.getType());
                optDto.setName(opt.getName());
                optDto.setPriceModifier(opt.getPriceModifier());
                return optDto;
            }).collect(Collectors.toList()));
        }


        return dto;
    }

    // --- Cart ---
    public CartDTO toCartDTO(Cart cart) {
        if (cart == null) return null;
        CartDTO dto = new CartDTO();
        dto.setId(cart.getId());
        dto.setSubtotal(cart.getSubtotal());
        dto.setTax(cart.getTax());
        dto.setShipping(cart.getShipping());
        dto.setTotal(cart.getTotal());
        dto.setDiscount(cart.getDiscount());
        dto.setAppliedCoupon(cart.getAppliedCoupon());
        dto.setGiftWrap(cart.isGiftWrap());

        if (cart.getItems() != null) {
            dto.setItems(cart.getItems().stream().map(this::toCartItemDTO).collect(Collectors.toList()));
        }
        if (cart.getWishlist() != null) {
             dto.setWishlist(cart.getWishlist().stream().map(this::toProductDTO).collect(Collectors.toList()));
        }
        return dto;
    }

    public CartItemDTO toCartItemDTO(CartItem item) {
        if (item == null) return null;
        CartItemDTO dto = new CartItemDTO();
        dto.setId(item.getId());
        dto.setProduct(toProductDTO(item.getProduct()));
        dto.setQuantity(item.getQuantity());
        // Price field in CartItemDTO? CartItem entity doesn't have price field explicitly in snippet I saw?
        // Wait, CartItem snippet didn't show price. But CartItemDTO has it.
        // Assuming price is calculated or product price.
        // CartItem snippet has quantity. It doesn't have price.
        // I will use product price * quantity or just product price.
        // Usually CartItem has unit price at purchase time, but CartItem entity snippet didn't show it.
        // Let's use product price.
        if (item.getProduct() != null) {
            dto.setPrice(item.getProduct().getPrice());
        }

        if (item.getOptions() != null) {
             Map<String, Object> optionsMap = new HashMap<>();
             optionsMap.put("metal", item.getOptions().getMetal());
             optionsMap.put("diamond", item.getOptions().getDiamond());
             optionsMap.put("stoneId", item.getOptions().getStoneId());
             optionsMap.put("stoneName", item.getOptions().getStoneName());
             optionsMap.put("customization", item.getOptions().getCustomization());
             dto.setOptions(optionsMap);
        }
        return dto;
    }

    // --- Order ---
    public OrderDTO toOrderDTO(Order order) {
        if (order == null) return null;
        OrderDTO dto = new OrderDTO();
        dto.setId(order.getId());
        dto.setOrderNumber(order.getOrderNumber());
        dto.setTotal(order.getTotal());
        dto.setStatus(order.getStatus());
        dto.setEstimatedDelivery(order.getEstimatedDelivery());
        dto.setTrackingNumber(order.getTrackingNumber());
        dto.setPaymentMethod(order.getPaymentMethod());
        dto.setShippingMethod(order.getShippingMethod());
        dto.setRazorpayOrderId(order.getRazorpayOrderId());

        if (order.getItems() != null) {
            dto.setItems(order.getItems().stream().map(this::toOrderItemDTO).collect(Collectors.toList()));
        }

        try {
            if (order.getShippingAddress() != null) {
                dto.setShippingAddress(objectMapper.readValue(order.getShippingAddress(), AddressDTO.class));
            }
            if (order.getBillingAddress() != null) {
                dto.setBillingAddress(objectMapper.readValue(order.getBillingAddress(), AddressDTO.class));
            }
        } catch (JsonProcessingException e) {
            e.printStackTrace();
        }

        dto.setSubtotal(order.getSubtotal());
        dto.setTax(order.getTax());
        dto.setShipping(order.getShipping());
        dto.setDiscount(order.getDiscount());
        dto.setAppliedCoupon(order.getAppliedCoupon());
        dto.setInternalNotes(order.getInternalNotes());

        return dto;
    }

    public OrderItemDTO toOrderItemDTO(OrderItem item) {
        if (item == null) return null;
        OrderItemDTO dto = new OrderItemDTO();
        dto.setId(item.getId());
        dto.setProduct(toProductDTO(item.getProduct()));
        dto.setQuantity(item.getQuantity());
        dto.setPrice(item.getPrice());

        // OrderItem also has embedded options.
        // Need to check OrderItem entity again if it has same structure.
        // Assuming it has getOptions() returning CartItem.CartItemOptions (as seen in snippet)
        if (item.getOptions() != null) {
             Map<String, Object> optionsMap = new HashMap<>();
             optionsMap.put("metal", item.getOptions().getMetal());
             optionsMap.put("diamond", item.getOptions().getDiamond());
             optionsMap.put("stoneId", item.getOptions().getStoneId());
             optionsMap.put("stoneName", item.getOptions().getStoneName());
             optionsMap.put("customization", item.getOptions().getCustomization());
             dto.setOptions(optionsMap);
        }
        return dto;
    }

    // --- Store ---
    public StoreDTO toStoreDTO(Store store) {
        if (store == null) return null;
        StoreDTO dto = new StoreDTO();
        dto.setId(store.getId());
        dto.setName(store.getName());
        dto.setAddress(store.getAddress());
        dto.setPhone(store.getPhone());
        dto.setHours(store.getHours());
        dto.setLat(store.getLat());
        dto.setLng(store.getLng());
        return dto;
    }

    // --- RFQ ---
    public RFQRequestDTO toRFQRequestDTO(RFQ rfq) {
        if (rfq == null) return null;
        RFQRequestDTO dto = new RFQRequestDTO();
        dto.setId(rfq.getId());
        dto.setRfqNumber(rfq.getRfqNumber());
        dto.setUserId(rfq.getUserId() != null ? rfq.getUserId().toString() : null);
        dto.setEmail(rfq.getEmail());
        dto.setCompanyName(rfq.getCompanyName());
        dto.setEstimatedBudget(rfq.getEstimatedBudget());
        dto.setDeliveryTimeline(rfq.getDeliveryTimeline());
        dto.setAdditionalNotes(rfq.getAdditionalNotes());
        dto.setStatus(rfq.getStatus());
        dto.setExpiresAt(rfq.getExpiresAt());

        if (rfq.getItems() != null) {
            dto.setItems(rfq.getItems().stream().map(item -> {
                RFQItemDTO itemDto = new RFQItemDTO();
                itemDto.setProductId(item.getProductId());
                itemDto.setQuantity(item.getQuantity());
                itemDto.setTargetPrice(item.getTargetPrice());
                itemDto.setDescription(item.getDescription());
                return itemDto;
            }).collect(Collectors.toList()));
        }

        if (rfq.getQuotes() != null) {
            dto.setQuotes(rfq.getQuotes().stream().map(this::toRFQQuoteDTO).collect(Collectors.toList()));
        }
        return dto;
    }

    public RFQQuoteDTO toRFQQuoteDTO(RFQQuote quote) {
        if (quote == null) return null;
        RFQQuoteDTO dto = new RFQQuoteDTO();
        dto.setPrice(quote.getQuoteAmount());
        dto.setValidUntil(quote.getValidUntil());
        dto.setNotes(quote.getNotes());
        dto.setStatus(quote.isAccepted() ? "ACCEPTED" : "QUOTED");
        return dto;
    }

    public RFQ toRFQEntity(RFQRequestDTO dto) {
        if (dto == null) return null;
        RFQ rfq = new RFQ();
        rfq.setId(dto.getId());
        rfq.setRfqNumber(dto.getRfqNumber());
        // User handled by service
        rfq.setEmail(dto.getEmail());
        rfq.setCompanyName(dto.getCompanyName());
        rfq.setEstimatedBudget(dto.getEstimatedBudget());
        rfq.setDeliveryTimeline(dto.getDeliveryTimeline());
        rfq.setAdditionalNotes(dto.getAdditionalNotes());
        rfq.setStatus(dto.getStatus());
        rfq.setExpiresAt(dto.getExpiresAt());

        if (dto.getItems() != null) {
            rfq.setItems(dto.getItems().stream().map(itemDto -> {
                RFQItem item = new RFQItem();
                item.setProductId(itemDto.getProductId());
                item.setQuantity(itemDto.getQuantity());
                item.setTargetPrice(itemDto.getTargetPrice());
                item.setDescription(itemDto.getDescription());
                item.setRfq(rfq);
                return item;
            }).collect(Collectors.toList()));
        }
        return rfq;
    }

    // --- Treasure ---
    public TreasureChestAccountDTO toTreasureChestAccountDTO(TreasureChestAccount account) {
        if (account == null) return null;
        TreasureChestAccountDTO dto = new TreasureChestAccountDTO();
        dto.setId(account.getId());
        dto.setPlanName(account.getPlanName());
        dto.setInstallmentAmount(account.getInstallmentAmount());
        dto.setInstallmentsPaid(account.getInstallmentsPaid());
        dto.setTotalInstallments(account.getTotalInstallments());
        dto.setBalance(account.getCurrentBalance());
        dto.setStatus(account.getStatus());
        dto.setStartDate(account.getStartDate());
        dto.setNextDueDate(account.getNextDueDate());
        return dto;
    }

    // --- Certificate ---
    public CertificateDetailDTO toCertificateDetailDTO(Certificate cert) {
        if (cert == null) return null;
        CertificateDetailDTO dto = new CertificateDetailDTO();
        dto.setId(cert.getId());
        dto.setReportNumber(cert.getReportNumber());
        dto.setLab(cert.getLab());
        dto.setDateIssued(cert.getDateIssued());
        dto.setProductName(cert.getProductName());
        dto.setCarat(cert.getCarat());
        dto.setColor(cert.getColor());
        dto.setClarity(cert.getClarity());
        dto.setCut(cert.getCut());
        dto.setShape(cert.getShape());
        dto.setImageUrl(cert.getImageUrl());
        return dto;
    }

    // --- Email ---
    public EmailNotificationDTO toEmailNotificationDTO(EmailNotification email) {
        if (email == null) return null;
        EmailNotificationDTO dto = new EmailNotificationDTO();
        dto.setId(email.getId());
        dto.setType(email.getType());
        dto.setEmail(email.getEmail());
        dto.setSubject(email.getSubject());
        dto.setTemplateName(email.getTemplateName());
        dto.setData(email.getData());
        dto.setSentAt(email.getSentAt());
        dto.setStatus(email.getStatus());
        return dto;
    }

    public EmailNotification toEmailNotificationEntity(EmailNotificationDTO dto) {
        if (dto == null) return null;
        EmailNotification entity = new EmailNotification();
        entity.setType(dto.getType());
        entity.setEmail(dto.getEmail());
        entity.setSubject(dto.getSubject());
        entity.setTemplateName(dto.getTemplateName());
        entity.setData(dto.getData());
        return entity;
    }

    public EmailTemplateDTO toEmailTemplateDTO(EmailTemplate template) {
        if (template == null) return null;
        EmailTemplateDTO dto = new EmailTemplateDTO();
        dto.setId(template.getId());
        dto.setName(template.getName());
        dto.setSubject(template.getSubject());
        dto.setHtmlContent(template.getHtmlContent());
        dto.setPlaceholders(template.getPlaceholders());
        return dto;
    }

    // --- Category ---

    public Category toCategoryEntity(CategoryDTO dto) {
        if (dto == null) return null;
        Category category = new Category();
        category.setId(dto.getId());
        category.setName(dto.getName());
        category.setDisplayName(dto.getDisplayName());
        category.setImage(dto.getImage());
        category.setActive(dto.isActive());
        category.setShowJewelryFields(dto.isShowJewelryFields());
        category.setShowGemstoneFields(dto.isShowGemstoneFields());
        category.setShowComponentFields(dto.isShowComponentFields());
        category.setShowIdolFields(dto.isShowIdolFields());
        category.setShowRoughFields(dto.isShowRoughFields());
        return category;
    }

    public CategoryDTO toCategoryDTO(Category category) {
        if (category == null) return null;
        CategoryDTO dto = new CategoryDTO();
        dto.setId(category.getId());
        dto.setName(category.getName());
        dto.setDisplayName(category.getDisplayName());
        dto.setImage(category.getImage());
        dto.setActive(category.isActive());
        dto.setShowJewelryFields(category.isShowJewelryFields());
        dto.setShowGemstoneFields(category.isShowGemstoneFields());
        dto.setShowComponentFields(category.isShowComponentFields());
        dto.setShowIdolFields(category.isShowIdolFields());
        dto.setShowRoughFields(category.isShowRoughFields());
        if (category.getParent() != null) {
            dto.setParentId(category.getParent().getId());
        }
        if (category.getSubcategories() != null) {
            dto.setSubcategories(category.getSubcategories().stream()
                    .map(this::toCategoryDTO)
                    .collect(Collectors.toList()));
        }
        return dto;
    }

    // --- Review ---
    public ReviewDTO toReviewDTO(Review review) {
        if (review == null) return null;
        ReviewDTO dto = new ReviewDTO();
        dto.setId(review.getId());
        dto.setRating(review.getRating());
        dto.setComment(review.getComment());
        if (review.getProduct() != null) {
            dto.setProductId(review.getProduct().getId());
        }
        if (review.getUser() != null) {
            dto.setUserId(review.getUser().getId());
            dto.setUserName(review.getUser().getFirstName() + " " + review.getUser().getLastName());
        }
        dto.setCreatedAt(review.getCreatedAt());
        return dto;
    }
}
