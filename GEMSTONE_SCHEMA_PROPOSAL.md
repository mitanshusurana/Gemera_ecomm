# Gemstone Attribute Standardization - Database Architecture Proposal

To move away from unstructured text inputs and ensure a "clean" database for the Loose Gemstones category (referencing rigorous standards from GIA, Gübelin, and GRS), we propose implementing a set of **Lookup Tables** instead of PostgreSQL `ENUM` types. This approach allows administrators to dynamically add new origins, trade color terms, or lab-specific treatments via the Admin App without requiring database migrations or backend deployments.

## 1. Proposed Lookup Tables Schema

Instead of raw string columns on the `products` table, we will introduce dedicated entity tables for critical attributes, explicitly separating Species from Variety and Shape from Cut.

```sql
CREATE TABLE gemstone_species (
    id UUID PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'Beryl', 'Corundum', 'Tourmaline'
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE gemstone_varieties (
    id UUID PRIMARY KEY,
    species_id UUID REFERENCES gemstone_species(id),
    name VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'Emerald', 'Ruby', 'Sapphire'
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE gemstone_shapes (
    id UUID PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'Round', 'Oval', 'Cushion', 'Emerald Shape'
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER
);

CREATE TABLE gemstone_cuts (
    id UUID PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'Brilliant Cut', 'Step Cut', 'Cabochon'
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE gemstone_trade_colors (
    id UUID PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'Pigeon’s Blood', 'Royal Blue', 'Muzo Green'
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE gemstone_clarities (
    id UUID PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'Flawless (FL)', 'VVS1', 'Eye Clean'
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER
);

CREATE TABLE gemstone_origins (
    id UUID PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'Zambia', 'Colombia', 'Afghanistan', 'Tajikistan'
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE gemstone_treatments (
    id UUID PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'F1 (Minor)', 'CE(O)', 'H(a)'
    is_active BOOLEAN DEFAULT TRUE
);
```

## 2. Updated Product Entity Design

The `products` table (or specifically the loose gemstone subset) will drop text fields in favor of foreign keys pointing to these lookup tables.

### Current Spring Boot Model:
```java
private String species;
private String variety;
private String shape;
private String cut;
private String colorTradeTerm;
private String clarity;
private String treatmentStatus;
private String originProvenance;
```

### Proposed Spring Boot Model Updates:
```java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "species_id")
private GemstoneSpecies speciesEntity;

@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "variety_id")
private GemstoneVariety varietyEntity;

@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "shape_id")
private GemstoneShape shapeEntity;

@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "cut_id")
private GemstoneCut cutEntity;

@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "clarity_id")
private GemstoneClarity clarityEntity;

@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "treatment_id")
private GemstoneTreatment treatmentEntity;

@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "origin_id")
private GemstoneOrigin originEntity;

@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "color_trade_term_id")
private GemstoneTradeColor colorTradeTermEntity;
```
*(Note: To maintain backwards compatibility initially, we will start by populating standardized static dropdowns in the Admin App using string values that map to these future entities).*

## 3. Verification Step Logic

To ensure an admin validates technical specs (4Cs, Origin, Treatments) before a high-value stone goes live on the public storefront, we will introduce an `isVerified` boolean flag on the `Product` entity.

*   **Default State:** When a data-entry user creates a gemstone, `isVerified` defaults to `false`.
*   **Visibility:** The frontend API (`GET /api/v1/products`) will filter out any product where `category = 'Loose Gemstones'` AND `isVerified = false`, unless queried by an Admin.
*   **Admin Action:** A user with the `ADMIN` role must review the stone's details in the Admin App, check an "Is Verified & Ready for Publication" box, and save the product. This flips `isVerified` to `true`, making it instantly searchable by customers.
