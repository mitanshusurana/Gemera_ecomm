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
| **Repair and service jobs** (resizing, polishing, resetting) with customer tracking | Done | Storefront catalogue and request form (`/repairs`), public tracking by job number + phone with online estimate approval, admin workflow with enforced status machine, A5 job card PDF with tear-off stub, four e-mails. Payment is recorded, not collected online; no GST invoice for the service yet. |
| Appointments with slots, store selection and reminders | Partial | Lead capture only. |
| Custom design and RFQ converting into an order | Partial | Quoting works; acceptance does not create an order. |
| Returns and exchange workflow (RMA, reasons, partial returns, lifetime exchange valuation) | Partial | Status labels and refund only. |
| WhatsApp and SMS notifications | Partial | Click-to-chat links only; email is the only channel. |
| **Staff roles in the admin** (sales, inventory, accounts) | Done | Roles ADMIN, MANAGER, SALES, INVENTORY, ACCOUNTS, SUPPORT with a permission matrix enforced on the API; staff management page; nav filtered by permission. |
| Analytics beyond four counters (sales by metal and category, margin, dead stock, per store) | Gap | Also no cost price on saleable stock, so no margin anywhere. |
| **Per-store stock, transfers, stock take with the scanner** | Done | Warehouse quantity stays on the product; per-store quantities, numbered transfers (dispatch, receive, cancel), stock takes with wedge-scanner and camera counting, variance report and audited close. |

## 2. Books, tax and operations (ERP)

| Need | Status | Notes |
|---|---|---|
| Parties, GSTIN validation and lookup, ledgers, opening balances | Done | Karigar is not a party type; credit limits are stored but not enforced. |
| Sales invoices with dual-rate GST, HSN enforcement, stock outward, COGS, balanced journal | Done | Making-charge GST rate is a hardcoded 5%. |
| **Storefront orders flowing into the books automatically** | Done | `POST /api/v1/integrations/ecommerce/sales` and `/credit-notes`, shared-key authenticated, idempotent on the shop's invoice number, tax cross-checked before posting; receipt voucher for online settlements, refund payment voucher for refunds. The store API keeps an outbox with retries and an admin "Sync now". Products carry an ERP material code (single or CSV import) so mapped web sales relieve ERP stock and post cost of goods sold. |
| Purchases with RCM on old gold from unregistered sellers | Done | RCM liability register is now written (was read-only). Amending a purchase still deletes and re-posts ledger rows, which breaks the append-only audit trail; an amendment should reverse and repost. |
| **Approval memo / jangad** (goods out on approval, returns, conversion to invoice, ageing) | Done | New module: memo numbering, stock moved to a Goods-on-Approval location, return and convert actions, ageing report, printable memo. |
| Job work: karigar challans, receipts, ITC-04, return deadlines | Partial | Backend only, no UI; receiving a job does not post the karigar's making-charge bill or any journal. |
| Production: orders, consumption, output, wastage, monthly account | Partial | Completion endpoint fixed (was a NameError). BOM tables exist but are unused; UI enters one line per section. |
| Vouchers, day book, cash and bank books, party ledger, outstanding ageing, TB, P&L, balance sheet | Done | P&L and dashboard revenue were zero because of a wrong nature literal; fixed. |
| Bank reconciliation | Partial | Statement import and matching exist; the BRS report is a stub with hardcoded zeros and matches are not persisted. |
| GSTR-1 JSON and Excel, GSTR-3B summary, HSN summary, ITC register | Done | GSTR-3B JSON omits RCM; GSTR-2B reconciliation, e-invoice IRN and e-way bill do not exist (e-way bill endpoint answers 501). |
| **e-invoice (IRN) and e-way bill** | Done | NIC schema 1.1 payload builder with validation, provider abstraction (disabled, fake, NIC/GSP over httpx), generate and cancel IRN, e-way bill by IRN, every call logged, IRN and QR on the printed invoice. Needs GSP credentials and, for direct IRP use, the encryption hooks; verify on the sandbox first. |
| **TDS 194Q and TCS 206C(1H)** | Done | Party flags, cumulative FY thresholds, no-PAN rate, lower-deduction certificate, postings to TDS/TCS payable accounts, register report. Payment-status derivation does not yet net TDS off the bill. |
| **Old gold exchange netted against a sale** | Done | Storefront quote and request, admin assay and credit as store credit, RCM purchase posted through the bridge, credit set off against the later web sale on the party ledger. |
| Loose gemstone lots and parcels (carat lots, splitting, sieve sizes) | Gap | `stock_batches` exists and is never written. |
| Multi-location stock and transfers (ERP) | Partial | Locations table exists; no CRUD, transfers only via the memo module. Per-store stock for the shop lives in the store API. |
| Cash receipt limit (s.269ST) and PAN on cash sales (Rule 114B) in the ERP | Gap | Enforced in the storefront only. |
| Fiscal-year lock and year-end closing | Gap | `is_locked` is stored and never read. |
| **User and role management UI** | Done | Users page (create, edit, deactivate, reset password), self-service password change, owner/admin rules enforced on the API. |
| Export invoices (LUT or with IGST), multi-currency | Gap | Columns exist. Jaipur exporters need this. |

## 3. Order of work

Closed in the September 2026 passes: everything marked Done in bold above, plus the ERP defect fixes
(production completion, P&L nature, auth on banking and e-way bill, RCM register, GST export page,
purity default, place-of-supply list).

Next, in this order:

1. **Live metal-rate pricing** with a daily rate lock, per-gram making charges and wastage, and a
   correct rupee ticker. Without it every gold price on the site is hand-maintained.
2. Treasure plan redemption at checkout and gram-based accrual; loyalty earning and burning.
3. Karigar making-charge bills and journals from job-work receipts; a job-work UI; BOM-driven production.
4. GST invoice for repair services; online payment of repair estimates.
5. Fiscal-year lock, year-end closing, and reverse-and-repost for purchase amendments.
6. GSTR-2B reconciliation; RCM in the GSTR-3B JSON; bank reconciliation persistence.
7. Export invoices (LUT or IGST) and multi-currency for Jaipur exporters.
