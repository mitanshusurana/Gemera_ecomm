# Aurelius Admin - Stitch Instructions

This document outlines the blueprint for implementing the remaining luxury admin UI screens from the design phase into the Angular `projects/admin` codebase.

## Implemented Pages (Static/Mocked Content)
The following screens have been stitched into the Angular routing structure. They currently contain static or mocked data based on the provided HTML templates.

1. **Dashboard (Screen 11)** - Route: `/dashboard`
2. **Customer CRM (Screen 6)** - Route: `/customers`
3. **RFQ Negotiation Detail (Screen 9)** - Route: `/rfqs/:id`
4. **Treasure Plan Management (Screens 3 & 16)** - Route: `/treasure`
5. **Global Settings & Profile (Screens 12 & 13)** - Route: `/settings`
6. **Audit Log (Screen 14)** - Route: `/logs`
7. **System Maintenance** - Route: `/system-maintenance`

---

## Next Steps for Full Backend Integration

To make these new stitched pages fully functional, the following backend API integrations must be developed and wired up in the Angular services:

### 1. Dashboard (`DashboardComponent`)
*   **Requirement:** Live Metal Prices.
*   **Action:** Create a `MetalPriceService` to poll an external API or a new backend endpoint (e.g., `/api/v1/market/prices`) for real-time gold/silver rates.
*   **Requirement:** KPI Stats.
*   **Action:** Create an endpoint (e.g., `/api/v1/analytics/kpis`) to return total sales, active RFQs, and new customer counts.

### 2. Customer CRM (`CustomerListComponent`)
*   **Requirement:** Fetch real customer data.
*   **Action:** Create a `CustomerService` interacting with the existing `/api/v1/users` endpoint. Extend the backend `User` DTO to return 'total spend' and 'tier' status if not already present.

### 3. RFQ Negotiation Detail (`RfqDetailComponent`)
*   **Requirement:** Real-time or polled chat interface.
*   **Action:** Create an `RfqService` interacting with the existing `/api/v1/rfq/requests/:id` and related endpoints. Implement the "Push Formal Quote" action triggering the `/api/v1/rfq/requests/:id/quote` endpoint.

### 4. Treasure Plan Management (`TreasurePlanListComponent`)
*   **Requirement:** Fetch active plans and manage installments.
*   **Action:** Enhance the `TreasureService` on the admin side to interact with the backend `/api/v1/treasure/*` endpoints. Wire the modal action buttons ("Record Payment", "Skip Month", "Close Plan") to corresponding PUT/POST requests.

### 5. Global Settings & Profile (`SettingsComponent`)
*   **Requirement:** Save/Load configuration state.
*   **Action:** Create a `SettingsService` and corresponding backend endpoints (e.g., `/api/v1/admin/settings`) to persist API keys (Razorpay, WhatsApp), tax rules, and notification preferences securely in the database.

### 6. Audit Log (`AuditLogComponent`)
*   **Requirement:** Fetch system events.
*   **Action:** Create a new backend endpoint (e.g., `/api/v1/admin/logs`) to return paginated system events (logins, price updates, backups) and wire it via an `AuditLogService`.

### 7. System Maintenance (`SystemMaintenanceComponent`)
*   **Requirement:** Monitor system health and manage backups.
*   **Action:** Create an endpoint for retrieving system health (CPU, RAM). Integrate logic to trigger and download manual database backups via an `AdminMaintenanceService`.