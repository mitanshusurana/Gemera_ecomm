package com.jewelry.backend.config;

import com.jewelry.backend.entity.User;
import com.jewelry.backend.entity.Category;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.repository.CategoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Arrays;

@Configuration
public class DataInitializer {

    @Autowired
    UserRepository userRepository;

    @Autowired
    CategoryRepository categoryRepository;

    @Autowired
    PasswordEncoder passwordEncoder;

    @Value("${app.admin.email}")
    private String adminEmail;

    @Value("${app.admin.password}")
    private String adminPassword;

    @Bean
    public CommandLineRunner initData() {
        return args -> {
            initAdmin();
            initCategories();
        };
    }

    private void initAdmin() {
        if (adminPassword == null || adminPassword.isEmpty()) {
            System.err.println("WARNING: Admin password not provided. Skipping initial admin user creation.");
            return;
        }
        if (userRepository.findByEmail(adminEmail).isEmpty()) {
            User admin = new User();
            admin.setEmail(adminEmail);
            admin.setPassword(passwordEncoder.encode(adminPassword));
            admin.setFirstName("Admin");
            admin.setLastName("User");
            admin.setPhone("0000000000");
            admin.setRole("ADMIN");
            userRepository.save(admin);
            System.out.println("Admin user created: " + adminEmail);
        }
    }

    private void initCategories() {
        if (categoryRepository.count() > 0) {
            return; // Already initialized
        }

        System.out.println("Initializing categories...");

        // Root 1: Finished Jewelry
        Category jewelryRoot = createCategory("Jewelry", null);

        Category ourCollection = createCategory("Our Collection", jewelryRoot);
        createCategory("Mens Collection", ourCollection);
        createCategory("Womens Collection", ourCollection);
        createCategory("Kids Collection", ourCollection);

        Category allJewellery = createCategory("All Jewellery", jewelryRoot);
        Category ring = createCategory("Ring", allJewellery);
        Arrays.asList("Six Stone", "9 Stone/ Navaratna", "3 Stone", "Other", "Fancy", "Cocktail", "Bridal", "Heart", "Band", "Couple", "Engagement", "7 Stone", "Solitare", "Floral", "Medium", "4 Stone", "Close Setting Ring", "Eternity Ring", "1 Stone").forEach(c -> createCategory(c, ring));

        Category bracelet = createCategory("Bracelet", allJewellery);
        Arrays.asList("Kada", "Fancy", "Chain").forEach(c -> createCategory(c, bracelet));

        Category bangle = createCategory("Bangle", allJewellery);
        Arrays.asList("Big", "Small", "Fancy", "Floral", "One Line", "Close Setting Bangle").forEach(c -> createCategory(c, bangle));

        Category nosepin = createCategory("Nosepin", allJewellery);
        Arrays.asList("Nosepin", "Nath").forEach(c -> createCategory(c, nosepin));

        Category pendant = createCategory("Pendant", allJewellery);
        Arrays.asList("Floral", "Other", "Fancy", "Fashion", "Religious (God)", "Heart", "Medium", "Small", "Single Hook", "Tanmaniya (Mangalsutra)", "close setting pendent").forEach(c -> createCategory(c, pendant));

        Category earring = createCategory("Earring", allJewellery);
        Arrays.asList("Studs", "Casual", "Hanging", "Floral", "Medium", "Small", "Big", "Bali", "Tops", "Close Setting Earring").forEach(c -> createCategory(c, earring));

        Category necklace = createCategory("Necklace", allJewellery);
        Arrays.asList("Fancy", "Other", "Medium", "Chain", "Floral", "Necklace With Colorstone", "Bridal").forEach(c -> createCategory(c, necklace));

        Category goldJewellery = createCategory("Gold Jewellery", jewelryRoot);
        Arrays.asList("Ring", "Bracelet", "Bangle", "Nosepin", "Pendant", "Earring", "Necklace").forEach(c -> createCategory(c, goldJewellery));

        Category silverJewellery = createCategory("Silver Jewellery", jewelryRoot);
        Arrays.asList("Pendant", "Necklace").forEach(c -> createCategory(c, silverJewellery));

        Category diamondJewellery = createCategory("Diamond Jewellery", jewelryRoot);
        Arrays.asList("Ring", "Bracelet", "Bangle", "Nosepin", "Pendant", "Earring", "Necklace").forEach(c -> createCategory(c, diamondJewellery));

        Category cvdJewellery = createCategory("CVD Jewellery", jewelryRoot);
        Arrays.asList("Ring", "Bracelet", "Earring").forEach(c -> createCategory(c, cvdJewellery));


        // Root 2: Loose Gemstones
        Category gemstonesRoot = createCategory("Gemstones", null);
        Arrays.asList("Diamonds", "Emeralds", "Rubies", "Blue Sapphire", "Yellow Sapphire", "Pearl", "Coral", "Cat's Eye", "Gomedak", "Other Colored Gemstones").forEach(c -> createCategory(c, gemstonesRoot));

        Category exclusive = createCategory("Exclusive Gemstones", gemstonesRoot);
        Arrays.asList("Emerald").forEach(c -> createCategory(c, exclusive));

        Category special = createCategory("Special Collections", gemstonesRoot);
        Arrays.asList("Blue Sapphire", "Moon Stone", "Sapphire").forEach(c -> createCategory(c, special));

        createCategory("Loose Diamonds", gemstonesRoot);
        createCategory("Lab Grown", gemstonesRoot);

        // Root 3: Spiritual Idols
        Category idolsRoot = createCategory("Spiritual Idols", null);
        Arrays.asList("Ganesh", "Krishna", "Shiva", "Lakshmi").forEach(c -> createCategory(c, idolsRoot));

        // Root 4: Materials & Roughs
        Category roughsRoot = createCategory("Materials & Roughs", null);
        Arrays.asList("Rough Parcels", "Single Rough Crystals").forEach(c -> createCategory(c, roughsRoot));

        // Root 5: Components
        Category componentsRoot = createCategory("Components", null);
        Arrays.asList("Findings (Clasps, Hooks)", "Beads", "Silver Wire").forEach(c -> createCategory(c, componentsRoot));

        // Root 6: Custom Made
        createCategory("Custom Made", null);

        // Root 7: Settings
        createCategory("Settings", null);

        System.out.println("Categories initialized.");
    }

    private Category createCategory(String name, Category parent) {
        Category category = new Category();
        category.setName(name.toLowerCase().replace(" ", "-").replace("/", ""));
        category.setDisplayName(name);
        category.setParent(parent);
        return categoryRepository.save(category);
    }
}
