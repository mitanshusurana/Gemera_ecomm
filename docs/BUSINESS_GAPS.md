# Running a gems and jewellery business on this software

What the five deployables (storefront, admin, store API, ERP API, ERP UI) cover today, what a
Jaipur gems and jewellery business still has to do outside them, and the order in which the gaps
are being closed. Written from a code audit of every layer on 2026-09-23; update it when a row changes.

Status legend: **Done** shipped in this repository; **Partial** exists but incomplete (what is missing
is stated); **Gap** nothing exists.

## 1. Selling online (storefront + store API)

| Need | Status | Notes |
|---|---|---|
| Catalogue with jewellery attributes (HUID, purity, weights, stones, lots, item types) | Done | Per-stone grading rows (position, carat, colour, clarity, cut, lab and certificate, rate, origin, treatment) with a stone-weight consistency warning; shown on the product page with certificate links. |
| Cart, checkout, Razorpay, webhook completion, gift cards, wishlist, compare | Done | Webhook completes the order even if the buyer closes the tab. |
| **GST tax invoice per order** (HSN, CGST/SGST or IGST by place of supply, seller GSTIN, number series, PDF) | Done | Series `WEB/{FY}/{n}` from admin settings; PDF from the account page, order confirmation and admin order detail. Issued at payment (prepaid) or dispatch (COD). |
| **PAN for purchases of Rs 2,00,000 or more (Rule 114B); no COD at that value (s.269ST)** | Done | Enforced server-side at order creation and reflected at checkout. |
| **Refunds through the gateway, restock on return, credit note in the books** | Done | REFUNDED calls the Razorpay refund API and queues an ERP credit note; RETURNED restocks once. |
| Coupons managed from the admin | Done | Create, edit, deactivate; minimum order value. |
| **Dynamic pricing from the live metal rate** | Done | Free spot feed (gold-api.com) and free USD/INR (frankfurter, er-api fallback) derive a fine rate with customs duty and a local premium; the admin locks a rate of the day per purity (or it auto-locks at a set hour); products marked "priced from metal rate" are repriced from the locked board with per-gram, percent or fixed making charges, wastage and stone value; a public gold-rate page and a corrected rupee ticker. |
| **Making charge and wastage model** (per gram, percentage, fixed) | Done | Part of the metal-rate pricing; the price breakdown is shown on the product page. |
| **Treasure plan (gold savings) redeemable against a purchase** | Done | Each paid installment books 24K grams at the day's rate (shared `MetalRateService`); a matured plan redeems max(balance incl. bonus, grams x today's rate) at checkout (`POST /cart/apply-treasure`), partial redemption leaves the rest redeemable, cancel/refund restores it. Installments post to the ERP as advances; the sale carries `advance_applied`. |
| **Loyalty points and referrals** | Done | Ledger (`loyalty_transactions`): earn on paid orders, burn at checkout as a pre-tax discount (`POST /cart/apply-points`), nightly expiry, reversal on cancel/refund, admin adjustments with a note, tiers from lifetime points, referral codes with a bonus to both sides on the referee's first paid order. Five `loyalty*` settings on the admin Rewards section. |
| **Repair and service jobs** (resizing, polishing, resetting) with customer tracking | Done | Storefront request and tracking, online payment of the estimate or balance through Razorpay, GST service invoice (SRV series, SAC 998722, tax-inclusive) posted to the ERP as service income, job card with QR, admin workflow. |
| **Appointments with slots, store selection and reminders** | Done | Slot grid per store from five settings (`appointmentSlotMinutes`, `appointmentOpenHour`, `appointmentCloseHour`, `appointmentMaxPerSlot`, `appointmentLeadHours`); storefront `/appointments` page and product-page modal with store and slot pickers; account block with cancel and reschedule (guests by phone); admin day view per store with confirm, complete, no-show, cancel with reason, consultant assignment and reschedule. Booking sends `appointment-received`, confirmation `appointment-confirmed`, cancellation `appointment-cancelled`; the reminder job is unchanged. |
| **Custom design and RFQ converting into an order** | Done | Accepting a quote creates a PENDING_PAYMENT order from the quoted total (spread over the RFQ lines; catalogue products or custom lines with `OrderItem.description`), tax by category and shipping by the cart rules, with a Razorpay order the storefront opens at once ("Accept and pay" on `/rfq`); payment completes through the usual verify / webhook path and the invoice, ERP sale and loyalty follow. Pending orders can also be paid from the account page. |
| **Returns and exchange workflow (RMA, reasons, partial returns)** | Done | `RMA-YYYY-00001` requests on delivered orders within `returnWindowDays` (7) for returnable products (`Product.returnable`), per line and quantity, with reason and resolution. Admin approves (restocking fee), rejects, records receipt and condition per line, then resolves: refund through Razorpay (cumulative `order.refundedAmount`), store credit as a gift card, or a replacement order with the credit applied; received lines only are restocked, the order becomes RETURNED (partial) or REFUNDED (all back), and a credit note per RMA goes to the ERP with `refund_paid` = the gateway refund. Lifetime exchange valuation (buy-back at today's metal rate) is not modelled; that belongs with the metal-rate pass. |
| **WhatsApp and SMS notifications** | Done | One notification service fans out to e-mail, WhatsApp (Meta Cloud API templates) and SMS (MSG91 or a generic HTTP gateway) for orders, repairs, exchange, appointments, Treasure reminders and back-in-stock; per-customer preferences, a delivery log page and a test-send form. Templates must be approved in the WhatsApp Business account. |
| **Staff roles in the admin** (sales, inventory, accounts) | Done | Roles ADMIN, MANAGER, SALES, INVENTORY, ACCOUNTS, SUPPORT with a permission matrix enforced on the API; staff management page; nav filtered by permission. |
| **Analytics** (sales by metal, category, purity, state, margin, dead stock, per store) | Done | Cost price per product (single or CSV import) with unit cost snapshotted on order items; dashboard and analytics pages with period compare, charts, top products, dead and low stock, CSV export. Orders before cost prices were set show as unknown-cost revenue. |
| **Per-store stock, transfers, stock take with the scanner** | Done | Warehouse quantity stays on the product; per-store quantities, numbered transfers (dispatch, receive, cancel), stock takes with wedge-scanner and camera counting, variance report and audited close. |

## 2. Books, tax and operations (ERP)

| Need | Status | Notes |
|---|---|---|
| Parties, GSTIN validation and lookup, ledgers, opening balances | Done | Karigar is not a party type; credit limits are stored but not enforced. |
| Sales invoices with dual-rate GST, HSN enforcement, stock outward, COGS, balanced journal | Done | Making-charge GST rate now comes from the line; invoice types Tax, Export, Bill of Supply. |
| **Storefront orders flowing into the books automatically** | Done | `POST /api/v1/integrations/ecommerce/sales` and `/credit-notes`, shared-key authenticated, idempotent on the shop's invoice number, tax cross-checked before posting; receipt voucher for online settlements, refund payment voucher for refunds. The store API keeps an outbox with retries and an admin "Sync now". Products carry an ERP material code (single or CSV import) so mapped web sales relieve ERP stock and post cost of goods sold. |
| **Purchases with RCM on old gold from unregistered sellers** | Done | RCM register written; amending a bill now reverses and re-posts every ledger, stock and register row under an /A1, /A2 bill number instead of deleting history. |
| **Approval memo / jangad** (goods out on approval, returns, conversion to invoice, ageing) | Done | New module: memo numbering, stock moved to a Goods-on-Approval location, return and convert actions, ageing report, printable memo. |
| **Job work: karigar challans, receipts, ITC-04, return deadlines** | Done | Karigar party type; receipts post the karigar's making-charge bill through the purchase path and value returned pieces at cost plus making; deemed supply on overdue challans; job-work page with challan print, karigar statement and ITC-04. |
| **Production: orders, consumption, output, wastage, monthly account** | Done | BOM master and orders created from a BOM; multi-line consumption, output and wastage entry. |
| Vouchers, day book, cash and bank books, party ledger, outstanding ageing, TB, P&L, balance sheet | Done | P&L and dashboard revenue were zero because of a wrong nature literal; fixed. |
| **Bank reconciliation** | Done | Matches persist on both sides, unmatch works, and the BRS is computed from book balance, unpresented payments and uncleared deposits against the statement closing balance. |
| **GSTR-1 and GSTR-3B exports, GSTR-2B reconciliation, ITC register** | Done | GSTR-3B JSON carries RCM (3.1(d), 4(A)(3)); GSTR-2B portal JSON import, reconciliation into four buckets, matches flagged on the ITC register; portal period format on both returns. |
| **e-invoice (IRN) and e-way bill** | Done | NIC schema payload builder with validation, provider abstraction (disabled, fake, NIC/GSP over httpx), IRN generate and cancel for invoices and credit notes (series shortened to CN/ to fit the 16-character portal limit), duplicate-IRN recovery from the IRP, e-way bill by IRN, every call logged, IRN and QR on the printed invoice. Needs GSP credentials; verify on the sandbox first. |
| **TDS 194Q and TCS 206C(1H)** | Done | Party flags, cumulative FY thresholds, no-PAN rate, lower-deduction certificate, postings to TDS/TCS payable accounts, register report. Payment-status derivation does not yet net TDS off the bill. |
| **Old gold exchange netted against a sale** | Done | Storefront quote and request, admin assay and credit as store credit, RCM purchase posted through the bridge, credit set off against the later web sale on the party ledger. |
| **Loose gemstone lots and parcels** | Done | Lots with carat weight, pieces, sieve, grading and cost per carat; split, merge and re-weigh with loss booking; sales lines draw from a lot; printable lot label. |
| **Multi-location stock and transfers (ERP)** | Done | Locations CRUD, balances per location, numbered transfers at weighted-average cost; stock register and item lists filter by location and are company scoped. |
| **Cash receipt limit (s.269ST) and PAN on sales of Rs 2,00,000 or more (Rule 114B) in the ERP** | Done | Cash receipts that would take a party past Rs 2,00,000 in a day are refused; domestic invoices at or above the threshold need a PAN or GSTIN. |
| **Fiscal-year lock and year-end closing** | Done | Fiscal years page: create, activate, lock, unlock, close with a preview; closing journal to retained earnings and an opening journal into the next year; every posting path refuses a locked period (423). |
| **User and role management UI** | Done | Users page (create, edit, deactivate, reset password), self-service password change, owner/admin rules enforced on the API. |
| **Export invoices (LUT or with IGST), multi-currency** | Done | Export and bill-of-supply invoice types, LUT or IGST treatment, shipping bill and port fields, amounts in the invoice currency converted at a stated rate, GSTR-1 Table 6A export section, printed declarations. |

## 3. Order of work

Closed in the September 2026 passes: everything marked Done in bold above, the ERP defect fixes,
a 370-plus test suite for the store API that the image build runs, 900-plus offline tests for the ERP,
and a scripted end-to-end run of the whole stack in Docker (`scripts/e2e-local.sh`, `docs/E2E_RUN.md`).

Still open:

1. Lifetime exchange valuation at today's metal rate for returns (the RMA values items at the invoice price).
2. A live end-to-end run on the production VMs with a real payment, refund, exchange and repair.
