-- Step 1: Create the metal_details table
CREATE TABLE IF NOT EXISTS metal_details (
    id UUID PRIMARY KEY,
    metal_type VARCHAR(255),
    metal_purity VARCHAR(255),
    net_weight NUMERIC(38,2),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Step 2: Ensure metal_detail_id column exists
-- Note: Assuming products table already had metal_detail_id added by JPA via Hibernate DDL-Auto
-- For databases without DDL-Auto, uncomment the next line:
-- ALTER TABLE products ADD COLUMN IF NOT EXISTS metal_detail_id UUID;

-- Step 3: Assign a unique UUID to each product's metal_detail_id to ensure a strict 1:1 relationship
UPDATE products
SET metal_detail_id = gen_random_uuid()
WHERE metal_type IS NOT NULL OR metal_purity IS NOT NULL OR net_weight IS NOT NULL;

-- Step 4: Migrate data from products to metal_details using the generated ID
INSERT INTO metal_details (id, metal_type, metal_purity, net_weight, created_at, updated_at)
SELECT metal_detail_id, metal_type, metal_purity, net_weight, current_timestamp, current_timestamp
FROM products
WHERE metal_detail_id IS NOT NULL;

-- Step 5: Create the stone_details table
CREATE TABLE IF NOT EXISTS stone_details (
    id UUID PRIMARY KEY,
    stone_type VARCHAR(255),
    shape VARCHAR(255),
    piece_count INTEGER,
    total_carat_weight NUMERIC(38,2),
    setting_type VARCHAR(255),
    product_id UUID,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Step 6: Migrate data from products to stone_details (Main Stone mapped from existing flattened columns)
INSERT INTO stone_details (id, stone_type, shape, piece_count, total_carat_weight, setting_type, product_id, created_at, updated_at)
SELECT gen_random_uuid(), species, shape, 1, carat_weight, NULL, id, current_timestamp, current_timestamp
FROM products
WHERE species IS NOT NULL OR shape IS NOT NULL OR carat_weight IS NOT NULL;

-- Step 6: Drop old columns from products (Optional but recommended for cleanup)
-- Make sure this step is performed after confirming successful migration and testing
-- ALTER TABLE products DROP COLUMN metal_type;
-- ALTER TABLE products DROP COLUMN metal_purity;
-- ALTER TABLE products DROP COLUMN net_weight;
-- ALTER TABLE products DROP COLUMN species;
-- ALTER TABLE products DROP COLUMN shape;
-- ALTER TABLE products DROP COLUMN carat_weight;
