# "Build Your Own Jewelry" (BYOJ) Technical Roadmap

This document outlines the technical requirements and architecture for implementing a multi-step "Build Your Own" workflow for users to pair loose gemstones with compatible jewelry settings.

## 1. Feature Logic & User Flow (Angular UI)

The multi-step process will be managed via a new parent component (`ByojContainerComponent`) housing a stepper and maintaining shared state.

*   **Step A: Select a Loose Gemstone.**
    *   **UI:** User views the `/loose-stones` catalog. Filters for Shapes (Emerald, Oval), Colors, and Carats.
    *   **Action:** Clicks "Select this Stone". The stone `productId` is saved to the local session/state.
*   **Step B: Choose a Setting Style.**
    *   **UI:** System asks if they want a Ring, Pendant, or Earrings. User selects "Ring".
    *   **Action:** Triggers an API call to fetch `Ring Settings` compatible with the selected stone.
*   **Step C: Select a Setting.**
    *   **UI:** User views compatible settings.
    *   **Action:** User clicks "Add to Ring".
*   **Step D: Review & Add to Cart.**
    *   **UI:** User sees the combined price, stone details, and setting details.
    *   **Action:** User clicks "Add to Cart", which bundles both items together.

## 2. Compatibility Engine (Backend Logic)

To prevent a user from setting a 4-carat Emerald Cut stone into a setting designed for a 1-carat Round stone, we need a Compatibility Engine.

### 2.1 Schema Updates for "Settings"
The `Product` entity (for category = 'Ring Setting', 'Pendant Setting') must include:
*   `supportedShapes`: `List<String>` (e.g., `["Round", "Princess", "Oval"]`)
*   `minCaratWeight`: `BigDecimal` (e.g., `0.5`)
*   `maxCaratWeight`: `BigDecimal` (e.g., `2.5`)
*   *(Alternatively, based on physical dimensions: `minCenterStoneLengthMm`, `maxCenterStoneLengthMm`)*

### 2.2 API Endpoint: Find Compatible Settings
```http
GET /api/v1/products/compatible-settings?stoneId={uuid}&jewelryType=Ring
```

**Logic in `ProductService`:**
1. Fetch the stone via `stoneId`. Extract its `shape` and `caratWeight`.
2. Query the `products` table where:
   - `category` = 'Ring Setting'
   - `supportedShapes` contains the stone's shape.
   - `minCaratWeight` <= stone's `caratWeight` <= `maxCaratWeight`.

## 3. Cart Bundling (API & Payload)

When a stone and setting are paired, they should ideally be tracked as a composite item in the cart to avoid them being split or purchased individually.

### 3.1 Composite Cart Payload
Update the `POST /api/v1/cart/items` payload (or create a new `POST /api/v1/cart/bundle` endpoint):

```json
{
  "bundleType": "BUILD_YOUR_OWN_RING",
  "items": [
    {
      "productId": "UUID-OF-STONE",
      "quantity": 1,
      "role": "CENTER_STONE"
    },
    {
      "productId": "UUID-OF-SETTING",
      "quantity": 1,
      "role": "MOUNTING"
    }
  ]
}
```

### 3.2 Backend `CartItem` Entity
The `CartItem` entity may need a `bundleId` or `linkedItemId` to group them together.
*   **Price Calculation:** The total bundle price is simply `Stone.price + Setting.price + (Optional) Setting Fee`.
*   **UI Rendering:** The frontend Cart component will detect items sharing the same `bundleId` and render them as a single row titled "Custom Built Ring" with nested bullet points for the Stone and Setting.