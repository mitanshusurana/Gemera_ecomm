package com.jewelry.backend.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Distinct, non-blank, sorted filter values across the whole catalogue.
 * Lists are always present (empty when the catalogue has none); the price
 * bounds are null when there are no priced products.
 */
@Data
public class ProductFacetsDTO {
    private List<String> categories = new ArrayList<>();
    private List<String> subCategories = new ArrayList<>();
    private List<String> metals = new ArrayList<>();
    private List<String> stones = new ArrayList<>();
    private List<String> designStyles = new ArrayList<>();
    private List<String> occasions = new ArrayList<>();
    private List<String> styles = new ArrayList<>();
    private List<String> gemGrades = new ArrayList<>();
    private List<String> crafts = new ArrayList<>();
    private List<String> saleModes = new ArrayList<>();
    private BigDecimal priceMin;
    private BigDecimal priceMax;
}
