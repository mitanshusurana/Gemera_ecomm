package com.jewelry.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

@Service
public class MetalPriceService {

    private static final Logger LOGGER = Logger.getLogger(MetalPriceService.class.getName());

    @Value("${goldapi.key:demo}")
    private String apiKey;

    @Value("${goldapi.base-url:https://www.goldapi.io/api}")
    private String baseUrl;

    @Value("${goldapi.cache-minutes:15}")
    private int cacheMinutes;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_2)
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    private Map<String, Object> cachedPrices = new HashMap<>();
    private LocalDateTime lastFetchTime = null;

    @PostConstruct
    public void init() {
        // Fetch prices on startup if possible
        try {
            fetchPrices();
        } catch (Exception e) {
            LOGGER.warning("Could not fetch metal prices on startup, using fallback values.");
        }
    }

    public Map<String, Object> getLivePrices() {
        if (lastFetchTime == null || Duration.between(lastFetchTime, LocalDateTime.now()).toMinutes() > cacheMinutes) {
            try {
                fetchPrices();
            } catch (Exception e) {
                LOGGER.log(Level.WARNING, "Failed to refresh metal prices", e);
            }
        }
        
        // Return fallback if cache is empty
        if (cachedPrices.isEmpty()) {
            return getFallbackPrices();
        }
        return cachedPrices;
    }

    public Map<String, Object> getMetalPricesWithMeta() {
        return getLivePrices();
    }

    private void fetchPrices() throws Exception {
        if ("demo".equals(apiKey) || apiKey.isEmpty()) {
            LOGGER.info("GoldAPI key is missing or 'demo'. Skipping actual API call and using fallback.");
            cachedPrices = getFallbackPrices();
            lastFetchTime = LocalDateTime.now();
            return;
        }

        HttpRequest request = HttpRequest.newBuilder()
                .GET()
                .uri(URI.create(baseUrl + "/XAU/USD")) // Example: Gold in USD
                .header("x-access-token", apiKey)
                .header("Content-Type", "application/json")
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 200) {
            // For simplicity, we just parse basic string here or use a library like Jackson.
            // Assuming Jackson is available since it's Spring Boot.
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            Map<String, Object> responseMap = mapper.readValue(response.body(), Map.class);
            
            cachedPrices.put("gold_usd", responseMap.get("price"));
            cachedPrices.put("24k", responseMap.get("price_gram_24k"));
            cachedPrices.put("22k", responseMap.get("price_gram_22k"));
            cachedPrices.put("18k", responseMap.get("price_gram_18k"));
            cachedPrices.put("currency", "USD");
            
            lastFetchTime = LocalDateTime.now();
            LOGGER.info("Successfully fetched live metal prices.");
        } else {
            throw new RuntimeException("API returned status " + response.statusCode() + ": " + response.body());
        }
    }

    private Map<String, Object> getFallbackPrices() {
        Map<String, Object> fallback = new HashMap<>();
        fallback.put("gold_usd", 2350.50);
        fallback.put("24k", 75.57);
        fallback.put("22k", 69.27);
        fallback.put("18k", 56.68);
        fallback.put("currency", "USD");
        fallback.put("is_mock", true);
        return fallback;
    }
}
