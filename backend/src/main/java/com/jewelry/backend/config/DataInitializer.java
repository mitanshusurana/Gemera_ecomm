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
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

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

    // ------------------------------------------------------------------
    // Category taxonomy (INVENTORY-CONTRACT.md section 2)
    // ------------------------------------------------------------------

    /** One node of the seed tree. itemType is null for nodes that inherit from their parent. */
    private record Node(String name, String itemType, List<Node> children) {
    }

    private static Node node(String name, String itemType, Node... children) {
        return new Node(name, itemType, Arrays.asList(children));
    }

    private static Node branch(String name, Node... children) {
        return node(name, null, children);
    }

    private static Node leaf(String name) {
        return new Node(name, null, List.of());
    }

    private static Node[] leaves(String... names) {
        Node[] result = new Node[names.length];
        for (int i = 0; i < names.length; i++) {
            result[i] = leaf(names[i]);
        }
        return result;
    }

    private static final List<Node> TAXONOMY = List.of(
            node("Gold Jewellery", "JEWELLERY",
                    branch("Plain Gold", leaves("Ring", "Chain", "Bracelet", "Bangle", "Kada", "Earring", "Pendant", "Necklace", "Nosepin", "Mangalsutra")),
                    branch("Studded Gold", leaves("Ring", "Bracelet", "Bangle", "Earring", "Pendant", "Necklace", "Nosepin")),
                    branch("Diamond Jewellery", leaves("Ring", "Bracelet", "Bangle", "Earring", "Pendant", "Necklace", "Nosepin")),
                    branch("Polki & Kundan", leaves("Necklace Set", "Earring", "Ring", "Bangle", "Maang Tikka", "Passa")),
                    branch("Meenakari", leaves("Necklace", "Earring", "Pendant", "Bangle"))),
            node("Silver Jewellery", "JEWELLERY",
                    branch("Plain Silver", leaves("Ring", "Chain", "Bracelet", "Anklet (Payal)", "Earring", "Pendant", "Necklace", "Toe Ring")),
                    branch("Studded Silver", leaves("Ring", "Bracelet", "Earring", "Pendant", "Necklace")),
                    branch("Silver Articles", leaves("Utensils", "Coins", "Frames", "Puja Items"))),
            node("Jewellery Sets", "SET",
                    leaves("Bridal Set", "Necklace Set", "Pendant Set", "Bangle Set")),
            node("Loose Gemstones", "LOOSE_GEMSTONE",
                    branch("Precious", leaves("Emerald (Panna)", "Ruby (Manik)", "Blue Sapphire (Neelam)", "Yellow Sapphire (Pukhraj)", "Diamond", "Natural Pearl (Moti)")),
                    branch("Semi-Precious", leaves("Red Coral (Moonga)", "Hessonite (Gomed)", "Cat's Eye (Lehsunia)", "Opal", "Tanzanite", "Tourmaline", "Aquamarine", "Amethyst",
                            "Citrine", "Garnet", "Peridot", "Topaz", "Moonstone", "Turquoise (Firoza)", "Lapis Lazuli", "Onyx", "Agate", "Jade", "Kunzite",
                            "Spinel", "Zircon", "Iolite", "Labradorite", "Rose Quartz", "Other Semi-Precious")),
                    branch("Navaratna", leaves("Navaratna Set (9 stones)")),
                    branch("Lab Grown", leaves("CVD Diamond", "Lab Emerald", "Lab Sapphire", "Lab Ruby"))),
            node("Gemstone Lots", "GEMSTONE_LOT",
                    leaves("Precious Lots", "Semi-Precious Lots", "Calibrated Lots", "Mixed Lots", "Melee Diamonds")),
            node("Rough & Specimens", "ROUGH",
                    leaves("Rough Parcels", "Single Rough Crystals", "Mineral Specimens", "Preforms")),
            node("Idols & Carvings", "IDOL_CARVING",
                    branch("Idols", leaves("Ganesh", "Krishna", "Shiva", "Lakshmi", "Buddha", "Hanuman", "Durga", "Other Deity")),
                    branch("Carvings", leaves("Cameo", "Intaglio", "Bowl & Box", "Animal Carving", "Floral Carving", "Shivling", "Tortoise", "Pyramid", "Sphere"))),
            node("Strands & Beads", "STRAND_BEADS",
                    leaves("Bead Strands (Maniya)", "Mala (108 beads)", "Pearl Strings", "Tumble Strands", "Faceted Strands", "Rudraksha")),
            node("Components", "COMPONENT",
                    leaves("Findings (Clasps, Hooks)", "Loose Beads", "Silver Wire", "Gold Wire", "Settings & Mountings")),
            node("Custom Made", "JEWELLERY"));

    /**
     * Item types for rows created by the previous seed (matched by system name).
     * Children inherit through Category.getEffectiveItemType(), so only the
     * roots and the old mid-level jewellery branches need a value.
     */
    private static final Map<String, String> LEGACY_ITEM_TYPES = new LinkedHashMap<>();

    static {
        LEGACY_ITEM_TYPES.put(slug("Jewelry"), "JEWELLERY");
        LEGACY_ITEM_TYPES.put(slug("Gold Jewellery"), "JEWELLERY");
        LEGACY_ITEM_TYPES.put(slug("Silver Jewellery"), "JEWELLERY");
        LEGACY_ITEM_TYPES.put(slug("Diamond Jewellery"), "JEWELLERY");
        LEGACY_ITEM_TYPES.put(slug("CVD Jewellery"), "JEWELLERY");
        LEGACY_ITEM_TYPES.put(slug("Gemstones"), "LOOSE_GEMSTONE");
        LEGACY_ITEM_TYPES.put(slug("Spiritual Idols"), "IDOL_CARVING");
        LEGACY_ITEM_TYPES.put(slug("Materials & Roughs"), "ROUGH");
        LEGACY_ITEM_TYPES.put(slug("Components"), "COMPONENT");
        LEGACY_ITEM_TYPES.put(slug("Settings"), "COMPONENT");
        LEGACY_ITEM_TYPES.put(slug("Custom Made"), "JEWELLERY");
    }

    /**
     * Idempotent, create-if-missing seed. Loads every category once, walks the
     * taxonomy creating rows whose system name is absent (existing rows keep
     * their id and parent), sets itemType where the seed declares one and the
     * row has none, then back-fills itemType on legacy rows. Nothing is deleted.
     */
    private void initCategories() {
        Map<String, Category> bySlug = new HashMap<>();
        for (Category category : categoryRepository.findAll()) {
            if (category.getName() != null) {
                bySlug.putIfAbsent(category.getName(), category);
            }
        }

        int[] counters = new int[2]; // [created, updated]
        for (Node root : TAXONOMY) {
            seed(root, null, null, 0, bySlug, counters);
        }

        for (Map.Entry<String, String> entry : LEGACY_ITEM_TYPES.entrySet()) {
            Category legacy = bySlug.get(entry.getKey());
            if (legacy != null && isBlank(legacy.getItemType())) {
                legacy.setItemType(entry.getValue());
                bySlug.put(entry.getKey(), categoryRepository.save(legacy));
                counters[1]++;
            }
        }

        if (counters[0] > 0 || counters[1] > 0) {
            System.out.println("Categories initialized: " + counters[0] + " created, " + counters[1] + " updated.");
        }
    }

    /**
     * Ensures one node exists and recurses into its children.
     *
     * System names: roots and their direct children use the slug of the display
     * name (this is what the previous seed used, so legacy rows are re-used).
     * Deeper nodes are prefixed with their parent's slug ("plain-gold-ring",
     * "studded-gold-ring") because the same leaf name repeats under several
     * branches and the tree would otherwise collapse.
     */
    private void seed(Node node, Category parent, String parentSlug, int depth, Map<String, Category> bySlug, int[] counters) {
        // Depth comes from the seed tree, not from the stored parent chain, so the
        // slug is the same whether a root was created fresh or matched a legacy
        // row that already sits under another parent.
        String slug = depth <= 1 ? slug(node.name()) : parentSlug + "-" + slug(node.name());

        Category category = bySlug.get(slug);
        boolean dirty = false;
        if (category == null) {
            category = new Category();
            category.setName(slug);
            category.setDisplayName(node.name());
            category.setParent(parent);
            category.setItemType(node.itemType());
            category = categoryRepository.save(category);
            bySlug.put(slug, category);
            counters[0]++;
        } else {
            if (parent != null && category.getParent() == null) {
                category.setParent(parent);
                dirty = true;
            }
            if (node.itemType() != null && isBlank(category.getItemType())) {
                category.setItemType(node.itemType());
                dirty = true;
            }
            if (dirty) {
                category = categoryRepository.save(category);
                bySlug.put(slug, category);
                counters[1]++;
            }
        }

        for (Node child : node.children()) {
            seed(child, category, slug, depth + 1, bySlug, counters);
        }
    }

    /** Same slug rule as the previous seed so existing rows are matched. */
    private static String slug(String name) {
        return name.toLowerCase(Locale.ROOT).replace(" ", "-").replace("/", "");
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
