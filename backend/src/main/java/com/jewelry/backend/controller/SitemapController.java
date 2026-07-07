package com.jewelry.backend.controller;

import com.jewelry.backend.entity.Product;
import com.jewelry.backend.service.ProductService;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Sitemap", description = "Sitemap generator APIs")
public class SitemapController {

    @Autowired
    ProductService productService;

    @GetMapping(value = "/sitemap.xml", produces = MediaType.APPLICATION_XML_VALUE)
    public String getSitemap() {
        StringBuilder xml = new StringBuilder();
        xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        xml.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");

        // Base URL (In production, inject this from properties)
        String baseUrl = "https://www.gemera.com";

        // Static routes
        String[] staticRoutes = {"", "/products", "/about", "/contact", "/login", "/register"};
        for (String route : staticRoutes) {
            xml.append("  <url>\n");
            xml.append("    <loc>").append(baseUrl).append(route).append("</loc>\n");
            xml.append("    <changefreq>daily</changefreq>\n");
            xml.append("    <priority>").append(route.isEmpty() ? "1.0" : "0.8").append("</priority>\n");
            xml.append("  </url>\n");
        }

        // Product pages
        Pageable pageable = PageRequest.of(0, 1000); // Fetch up to 1000 for simplicity
        Page<Product> products = productService.getAllProducts(null, null, null, null, null, null, pageable);
        for (Product product : products.getContent()) {
            xml.append("  <url>\n");
            xml.append("    <loc>").append(baseUrl).append("/products/").append(product.getId()).append("</loc>\n");
            xml.append("    <changefreq>weekly</changefreq>\n");
            xml.append("    <priority>0.9</priority>\n");
            xml.append("  </url>\n");
        }

        xml.append("</urlset>");
        return xml.toString();
    }
}
