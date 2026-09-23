# Running a gems and jewellery business on this software

What the five deployables (storefront, admin, store API, ERP API, ERP UI) cover today, what a
Jaipur gems and jewellery business still has to do outside them, and the order in which the gaps
are being closed. Written from a code audit of every layer on 2026-09-23; update it when a row changes.

Status legend: **Done** shipped in this repository; **Partial** exists but incomplete (what is missing
is stated); **Gap** nothing exists.

## 1. Selling online (storefront + store API)

| Need | Status | Notes |
|---|---|---|
| Catalogue with jewellery attributes (HUID, purity, weights, stones, lots, item types) | Partial | Product carries HUID, hallmark, gross/net weight, lot fields and an 8-type taxonomy. Per-stone grading in studded pieces (each stone's carat, clarity, colour, lab) is a single summary row, not per stone. |
| Cart, checkout, Razorpay, webhook completion, gift cards, wishlist, compare | Done | Webhook completes the order even if the buyer closes the tab. |
| **GST tax invoice per order** (HSN, CGST/SGST or IGST by place of supply, seller GSTIN, number series, PDF) | Done | Series `WEB/{FY}/{n}` from admin settings; PDF from the account page, order confirmation and admin order detail. Issued at payment (prepaid) or dispatch (COD). |
| **PAN for purchases of Rs 2,00,000 or more (Rule 114B); no COD at that value (s.269ST)** | Done | Enforced server-side at order creation and reflected at checkout. |
| **Refunds through the gateway, restock on return, credit note in the books** | Done | REFUNDED calls the Razorpay refund API and queues an ERP credit note; RETURNED restocks once. |
| Coupons managed from the admin | Done | Create, edit, deactivate; minimum order value. |
| Dynamic pricing from the live metal rate (rate x weight + making + stones) | Gap | Prices are static. The gold ticker shows a USD per gram figure formatted as rupees; rate-of-the-day lock and history do not exist. Highest-value next item for a gold jeweller. |
| Making charge and wastage model (per gram, percentage) | Gap | A single rupee figure inside the price breakup. |
| Treasure plan (gold savings) redeemable against a purchase | Partial | Money in, maturity and bonus work; the matured balance cannot be spent at checkout, and the plan accrues rupees, not grams. |
| Loyalty points and referrals | Partial | Points are displayed but never awarded, expired or redeemed. |
| Repair and service jobs (resizing, polishing, resetting) with customer tracking | Gap | |
| Appointments with slots, store selection and reminders | Partial | Lead capture only. |
| Custom design and RFQ converting into an order | Partial | Quoting works; acceptance does not create an order. |
| Returns and exchange workflow (RMA, reasons, partial returns, lifetime exchange valuation) | Partial | Status labels and refund only. |
| WhatsApp and SMS notifications | Partial | Click-to-chat links only; email is the only channel. |
| Staff roles in the admin (sales, inventory, accounts) | Gap | Single ADMIN role. |
| Analytics beyond four counters (sales by metal and category, margin, dead stock, per store) | Gap | Also no cost price on saleable stock, so no margin anywhere. |
| Per-store stock, transfers, stock take with the scanner | Gap | Stores are locator records; stock is one integer per product. QR labels and camera scanning exist. |

## 2. Books, tax and operations (ERP)

| Need | Status | Notes |
|---|---|---|
| Parties, GSTIN validation and lookup, ledgers, opening balances | Done | Karigar is not a party type; credit limits are stored but not enforced. |
| Sales invoices with dual-rate GST, HSN enforcement, stock outward, COGS, balanced journal | Done | Making-charge GST rate is a hardcoded 5%. |
| **Storefront orders flowing into the books automatically** | Done | `POST /api/v1/integrations/ecommerce/sales` and `/credit-notes`, shared-key authenticated, idempotent on the shop's invoice number, tax cross-checked before posting; receipt voucher for online settlements, refund payment voucher for refunds. The store API keeps an outbox with retries and an admin "Sync now". Web lines are not mapped to ERP materials yet, so ERP stock does not move for web sales. |
| Purchases with RCM on old gold from unregistered sellers | Done | RCM liability register is now written (was read-only). Amending a purchase still deletes and re-posts ledger rows, which breaks the append-only audit trail; an amendment should reverse and repost. |
| **Approval memo / jangad** (goods out on approval, returns, conversion to invoice, ageing) | Done | New module: memo numbering, stock moved to a Goods-on-Approval location, return and convert actions, ageing report, printable memo. |
| Job work: karigar challans, receipts, ITC-04, return deadlines | Partial | Backend only, no UI; receiving a job does not post the karigar's making-charge bill or any journal. |
| Production: orders, consumption, output, wastage, monthly account | Partial | Completion endpoint fixed (was a NameError). BOM tables exist but are unused; UI enters one line per section. |
| Vouchers, day book, cash and bank books, party ledger, outstanding ageing, TB, P&L, balance sheet | Done | P&L and dashboard revenue were zero because of a wrong nature literal; fixed. |
| Bank reconciliation | Partial | Statement import and matching exist; the BRS report is a stub with hardcoded zeros and matches are not persisted. |
| GSTR-1 JSON and Excel, GSTR-3B summary, HSN summary, ITC register | Done | GSTR-3B JSON omits RCM; GSTR-2B reconciliation, e-invoice IRN and e-way bill do not exist (e-way bill endpoint answers 501). |
| e-invoice (IRN) and e-way bill | Gap | Columns exist. Needs a GSP integration; mandatory above the turnover threshold. |
| TDS 194Q and TCS 206C(1H) on purchases and sales | Gap | |
| Old gold exchange netted against a sale (part payment in kind) | Gap | RCM purchase exists; no exchange flow on the invoice. |
| Loose gemstone lots and parcels (carat lots, splitting, sieve sizes) | Gap | `stock_batches` exists and is never written. |
| Multi-location stock and transfers | Partial | Locations table exists; no CRUD, transfers only via the memo module. |
| Cash receipt limit (s.269ST) and PAN on cash sales (Rule 114B) in the ERP | Gap | Enforced in the storefront only. |
| Fiscal-year lock and year-end closing | Gap | `is_locked` is stored and never read. |
| User and role management UI | Gap | Seven roles exist in the database; users can only be created by SQL. |
| Export invoices (LUT or with IGST), multi-currency | Gap | Columns exist. Jaipur exporters need this. |

## 3. Order of work

Closed in the September 2026 pass: everything marked Done in bold above, plus the ERP defect fixes
(production completion, P&L nature, auth on banking and e-way bill, RCM register, GST export page,
purity default, place-of-supply list).

Next, in this order, because each one either satisfies a legal duty or removes daily manual work:

1. **Live metal-rate pricing** with a daily rate lock, per-gram making charges and wastage, and a
   correct rupee ticker. Without it every gold price on the site is hand-maintained.
2. **Old gold exchange** on the storefront (quote, KYC) and in the ERP (RCM purchase netted against the
   invoice). Common in every Indian jewellery sale.
3. **Repair and service jobs** in the admin with customer-visible tracking and a job card print.
4. **Map web SKUs to ERP materials** so web sales relieve ERP stock and margins appear; then per-store
   stock and a scanner-based stock take.
5. **e-invoice and e-way bill** through a GSP, and TDS/TCS on purchases and sales.
6. **Staff roles** in the admin and a user-management screen in the ERP.
7. Treasure plan redemption at checkout and gram-based accrual; loyalty earning and burning.
8. Karigar making-charge bills and journals from job-work receipts; BOM-driven production.
9. Fiscal-year lock, year-end closing, and reverse-and-repost for purchase amendments.
