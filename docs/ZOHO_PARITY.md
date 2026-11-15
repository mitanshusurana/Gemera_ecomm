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
| Price lists | none | Missing (batch 6) |

## Sales

| Zoho Books | ERP | Status |
|---|---|---|
| Customers | Parties (trade name, GSTIN lookup, KYC, credit limit and days) | Done |
| Quotes | none | Missing (batch 3) |
| Sales orders | none | Missing (batch 3) |
| Delivery challans | Memos (Jangad): goods out on approval, returned or invoiced | Done (trade equivalent) |
| Invoices | Tax invoice, export invoice, bill of supply; e-invoice and e-way bill slots; TCS | Done |
| Payment terms and due date on the invoice | Terms (due on receipt, Net 7 to 60, custom) and stored due date | Done (batch 2) |
| Email the invoice ("Save and Send") | none | Missing (batch 5) |
| Payment reminders | none | Missing (batch 5) |
| Recurring invoices | none | Missing (batch 4) |
| Payments received | Receipt voucher, applied to an invoice or on account | Done |
| Credit notes | Credit note voucher, e-invoice for credit notes | Done |
| Online payment link on the invoice | none (Razorpay is on the storefront only) | Missing (batch 6) |
| Discounts at line or invoice level | Line discount columns exist in the schema; the form does not offer them | Partial (batch 3) |
| Salesperson on the invoice | none | Missing (batch 6) |

## Purchases

| Zoho Books | ERP | Status |
|---|---|---|
| Vendors | Parties (suppliers, karigars), TDS flags | Done |
| Expenses | `/expenses`: expense ledger, paid through cash or bank, vendor, reference; reversal | Done (batch 2); no GST credit on an expense by design |
| Recurring expenses | none | Missing (batch 4) |
| Purchase orders | none | Missing (batch 3) |
| Bills | Purchase register: weight and purity, RCM on old gold, ITC register, TDS sections, amendment by reverse and repost, bill scan | Done |
| Bills from GSTR-2B | Create a bill from a 2B row, prefilled | Done (beyond Zoho Books) |
| Recurring bills | "Repeat" on a bill copies it to a new one | Partial (batch 4 adds schedules) |
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
| Bank rules (auto-categorise) | none | Missing (batch 6) |

## Filing and compliance

| Zoho Books | ERP | Status |
|---|---|---|
| GSTR-1, GSTR-3B | Staging, JSON and Excel exports, HSN summary | Done |
| GSTR-2B reconciliation | Import the portal JSON, reconcile, buckets, create bill | Done |
| Direct filing from the app | none | N/A for now: needs a GSP subscription and a monthly OTP |
| e-Invoice, e-Way bill | Provider slot built, disabled until a GSP is chosen | Partial (configuration, not code) |
| TDS and TCS | 194Q automatic, 194I/J/C/H on a bill, 206C(1H) on sales, register | Done |
| GSTR-9 annual summary | none | Missing (batch 6) |

## Accountant

| Zoho Books | ERP | Status |
|---|---|---|
| Manual journals | Journal voucher | Done |
| Chart of accounts | Groups, ledgers, opening balances, rename, move, deactivate | Done |
| Transaction locking | Fiscal year lock and year-end closing | Partial: no lock up to an arbitrary date (batch 6) |
| Budgets | none | Missing (batch 6) |
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
| Cash flow statement | Dashboard chart only | Partial (batch 6: the statement) |
| Payments received / made lists, invoice and bill detail lists | Registers and day book | Partial |
| Schedule III formats, business ratios, cash flow forecast | none | Missing (batch 6, low priority) |
| Stock register, production account | Reports | Done (beyond Zoho Books) |

## Documents and settings

| Zoho Books | ERP | Status |
|---|---|---|
| Documents inbox | A scan can be attached to a purchase bill | Partial |
| Users and roles | Seven roles, user management | Done |
| Invoice templates | One GST tax-invoice print layout | Partial |
| Automation (workflow rules, schedules) | none | Missing; recurring documents and reminders (batches 4, 5) are the useful part |
| Customer portal | none | N/A for now |

## What the ERP has that Zoho Books does not

Karigar job work (issue, receive, wastage), manufacturing orders and the production account, gemstone lots,
memo/jangad, weight and purity on every line, reverse charge on old gold, bills from GSTR-2B rows, the storefront
bridge that records web orders under the shop's invoice number.

## Batches

1. **Done (PR 160):** money-first dashboard, analysis reports, global search, quick create.
2. **This batch:** Expenses, payment terms and due date on sales invoices.
3. Quotes, sales orders and purchase orders, each converting to the next document; discounts on the invoice form.
4. Recurring invoices, bills and expenses (a profile and a daily job).
5. Email: send the invoice, send a statement, overdue reminders (uses SMTP, as the store API does).
6. The rest: cash flow statement, GSTR-9 summary, lock up to a date, budgets, bank rules, price lists, salesperson,
   payment link on the invoice.

Deployment is held until batches 3 to 5 are merged. Batch 6 is a list of smaller items; the owner decides which of
them gate the deployment.
