# ERP parity with Zoho Books

The owner compared the ERP with Zoho Books (India edition) in November 2026 and set a rule: the next production
deployment happens when the ERP covers what Zoho Books does for a business like Caratloop. This file is the
checklist for that rule. It lists every module in Zoho Books' menu, what the ERP has, and what is left.

"Parity" means the same job can be done, not the same screens. Where the jewellery trade does the job differently
(a memo/jangad instead of a delivery challan) the trade's way counts. Modules a jeweller with one GSTIN and rupee
books has no use for are marked not applicable, with the reason.

Status: **Done**, **Partial** (usable, gaps listed), **Missing**, **N/A**.

## Home

| Zoho Books | ERP | Status |
|---|---|---|
| Dashboard: receivables, payables, cash flow, income and expense, top expenses, bank balances | `/dashboard`, `GET /reports/business-overview` | Done (PR 160) |
| Global search | Header search over parties, items, invoices, bills, vouchers | Done (PR 160) |
| Quick create (+) | Header "+" menu | Done (PR 160) |
| Account watchlist, projects widget | none | N/A for now |

## Items

| Zoho Books | ERP | Status |
|---|---|---|
| Items (goods and services, rates, HSN/SAC, tax) | Stock Items with category, HSN, GST rate, service items with an expense ledger | Done |
| Inventory tracking | Stock ledger by weight and purity, gemstone lots, locations and transfers | Done (beyond Zoho Books) |
| Price lists | none | N/A: a jewellery price is weight times the day's rate plus making, not a list price |

## Sales

| Zoho Books | ERP | Status |
|---|---|---|
| Customers | Parties (trade name, GSTIN lookup, KYC, credit limit and days) | Done |
| Quotes | Quotes & Orders: numbered QT/, accept or decline, becomes a sales order or an invoice, print, e-mail | Done (batch 3) |
| Sales orders | Quotes & Orders: numbered SO/, becomes an invoice | Done (batch 3) |
| Delivery challans | Memos (Jangad): goods out on approval, returned or invoiced | Done (trade equivalent) |
| Invoices | Tax invoice, export invoice, bill of supply; e-invoice and e-way bill slots; TCS | Done |
| Payment terms and due date on the invoice | Terms (due on receipt, Net 7 to 60, custom) and stored due date | Done (batch 2) |
| Email the invoice | Envelope on the sales register: the invoice's figures in the mail body, logged | Done (batch 5); no PDF attachment yet |
| Payment reminders | Outstanding: overdue customers listed, reminders sent to those ticked, log of what went | Done (batch 5); sent by a person, not on a timer |
| Recurring invoices | Recurring: a profile raises the invoice from a saved quote or order when due | Done (batch 4); raised by a person because an invoice relieves stock |
| Payments received | Receipt voucher, applied to an invoice or on account | Done |
| Credit notes | Credit note voucher, e-invoice for credit notes | Done |
| Online payment link on the invoice | none (Razorpay is on the storefront only) | N/A for now: needs the payment gateway's KYC |
| Discounts at line or invoice level | Discount per line on the invoice, quote and order | Done (batch 3); no single invoice-level discount |
| Salesperson on the invoice | Field on the invoice, Sales by Salesperson report | Done (batch 6) |

## Purchases

| Zoho Books | ERP | Status |
|---|---|---|
| Vendors | Parties (suppliers, karigars), TDS flags | Done |
| Expenses | `/expenses`: expense ledger, paid through cash or bank, vendor, reference; reversal | Done (batch 2); no GST credit on an expense by design |
| Recurring expenses | Recurring: posts itself on the due date, catches up missed periods | Done (batch 4) |
| Purchase orders | Quotes & Orders: numbered PO/, becomes a purchase bill | Done (batch 3) |
| Bills | Purchase register: weight and purity, RCM on old gold, ITC register, TDS sections, amendment by reverse and repost, bill scan | Done |
| Bills from GSTR-2B | Create a bill from a 2B row, prefilled | Done (beyond Zoho Books) |
| Recurring bills | Recurring: the bill opens as a Repeat when due; "Repeat" on any bill | Done (batch 4) |
| Payments made | Payment voucher, applied to a bill or on account | Done |
| Vendor credits | Debit note voucher | Done |

## Time tracking

| Zoho Books | ERP | Status |
|---|---|---|
| Projects, timesheets | none | N/A: no billable hours in this business. Job work covers karigar labour. |

## Banking

| Zoho Books | ERP | Status |
|---|---|---|
| Bank and cash accounts | Bank and cash ledgers with account details | Done |
| Statement import | CSV/XLS/tab-separated import, duplicate guard | Done |
| Match and reconcile | Manual match, one statement line to several book entries, suggestions by amount, unmatch | Done |
| Categorise a statement line into a transaction | Book a receipt or payment from the line | Done |
| Reconciliation report | Bank reconciliation statement | Done |
| Automatic bank feeds | none | N/A: needs a paid aggregator; statement import covers it |
| Bank rules | Banking: text in a statement line suggests the ledger or party when booking it | Done (batch 6); suggests, does not post |

## Filing and compliance

| Zoho Books | ERP | Status |
|---|---|---|
| GSTR-1, GSTR-3B | Staging, JSON and Excel exports, HSN summary | Done |
| GSTR-2B reconciliation | Import the portal JSON, reconcile, buckets, create bill | Done |
| Direct filing from the app | none | N/A for now: needs a GSP subscription and a monthly OTP |
| e-Invoice, e-Way bill | Provider slot built, disabled until a GSP is chosen | Partial (configuration, not code) |
| TDS and TCS | 194Q automatic, 194I/J/C/H on a bill, 206C(1H) on sales, register | Done |
| GSTR-9 annual summary | Reports: GST Annual Summary by month from the output, ITC and RCM registers | Done (batch 6); working figures, not the return file |

## Accountant

| Zoho Books | ERP | Status |
|---|---|---|
| Manual journals | Journal voucher | Done |
| Chart of accounts | Groups, ledgers, opening balances, rename, move, deactivate | Done |
| Transaction locking | Fiscal year lock, year-end closing, and a lock date for the books | Done (batch 6) |
| Budgets | Budgets: per income and expense ledger for the year, against actuals | Done (batch 6) |
| Bulk update of accounts on transactions | none | N/A: postings are immutable here; a wrong entry is reversed |
| Currency adjustments | none | N/A: rupee books; export invoices carry their own rate |

## Reports

Zoho Books lists about 90. Those that matter here:

| Zoho Books | ERP | Status |
|---|---|---|
| Profit and loss, balance sheet, trial balance | Reports | Done |
| General ledger, account transactions, day book, journal report | Ledger, Day Book, Cash Book, Bank Book | Done |
| AR/AP aging, customer and vendor balances | Outstanding (age-wise, reconciled to the ledger) | Done |
| Sales by customer / item, purchases by vendor / item, expenses by category | Reports (analysis) | Done (PR 160) |
| Tax summary, TDS/TCS summaries | GST tax register, TDS/TCS register | Done |
| Audit trail, activity log | Audit trail (hash-chained) | Done |
| Cash flow statement | Reports: Cash Flow Statement (direct method), reconciles to cash and bank | Done (batch 6) |
| Payments received / made lists, invoice and bill detail lists | Registers and day book | Partial |
| Schedule III formats, business ratios, cash flow forecast | none | Missing (batch 6, low priority) |
| Stock register, production account | Reports | Done (beyond Zoho Books) |

## Documents and settings

| Zoho Books | ERP | Status |
|---|---|---|
| Documents inbox | A scan can be attached to a purchase bill | Partial |
| Users and roles | Seven roles, user management | Done |
| Invoice templates | One GST tax-invoice print layout | Partial |
| Automation (workflow rules, schedules) | Recurring documents; reminders on demand | Partial: no general rule engine |
| Customer portal | none | N/A for now |

## What the ERP has that Zoho Books does not

Karigar job work (issue, receive, wastage), manufacturing orders and the production account, gemstone lots,
memo/jangad, weight and purity on every line, reverse charge on old gold, bills from GSTR-2B rows, the storefront
bridge that records web orders under the shop's invoice number.

## Batches

1. **Done (PR 160):** money-first dashboard, analysis reports, global search, quick create.
2. **Done (PR 161):** Expenses, payment terms and due date on sales invoices.
3. **Done:** quotes, sales orders and purchase orders, each converting to the next document; discount per line.
4. **Done:** recurring expenses, bills and invoices.
5. **Done:** e-mail an invoice, a quote or order, a statement; overdue reminders; mail log.
6. **Done:** cash flow statement, annual GST summary, lock date, budgets, bank rules, salesperson.

The ERP also moved from a dark to a light theme with batch 6.

## Still open

- A PDF attached to the e-mailed invoice (the mail carries the figures in its body).
- Reminders on a timer. Today a person sends them, after reading the list.
- A discount on the whole invoice, as distinct from per line.
- Direct GST filing, e-invoice and live bank feeds: each needs a paid outside provider.
- A payment link on the invoice: needs the gateway's KYC.
- Schedule III formats, business ratios, a customer portal, a general workflow engine.

## How the batches were checked

Unit tests in `projects/erp-backend/tests`, and a scripted run through the API against PostgreSQL 16 with every
migration applied: expenses and their reversal, quotes through to orders, a purchase bill, sales invoices with terms,
recurring rent caught up over four months, e-mails delivered to a local SMTP sink, a lock date refusing a back-dated
entry, budgets, bank rules, and the cash flow statement closing on the same cash figure as the dashboard.
