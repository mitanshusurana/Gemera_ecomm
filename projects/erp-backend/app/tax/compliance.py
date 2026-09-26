"""Cash and PAN rules on receipts and sales.

Two Income-tax provisions the storefront enforced and the ERP did not:

* s.269ST: no person may receive Rs 2,00,000 or more in cash from one person
  in one day (or for one transaction or event). The limit is on the aggregate
  received in the day, so the check needs what has already been taken from
  the same party today plus the receipt now being recorded. The penalty under
  s.271DA is the whole amount received, so this is a refusal, not a warning.

* Rule 114B (Sl. 18 of the table): a sale of goods or services for Rs 2,00,000
  or more per transaction requires the buyer's PAN on the invoice. A buyer
  who quotes a GSTIN is identified through it (the PAN is embedded in
  characters 3-12 of a GSTIN) so the rule is satisfied. A non-resident buyer
  may furnish Form 60 instead; export invoices are therefore left to the
  caller, which knows the buyer is outside India.

Pure Decimal arithmetic. Callers fetch the day's cash and the party's PAN and
GSTIN from the database; nothing here reads it.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from app.core.money import to_decimal
from app.tax.gstin import is_gstin_shaped
from app.tax.tds_tcs import has_valid_pan

# s.269ST. The limit is "two lakh rupees or more", so exactly Rs 2,00,000 is
# refused.
CASH_RECEIPT_LIMIT_INR = Decimal("200000")

# Rule 114B, Sl. 18: sale or purchase of goods or services exceeding Rs 2 lakh
# per transaction. The department reads "exceeding" and "of Rs 2 lakh or more"
# in the same breath in its FAQs; the safer reading is applied.
PAN_REQUIRED_SALE_INR = Decimal("200000")


def cash_receipt_violation(existing_cash_today, amount) -> Optional[str]:
    """The reason a cash receipt must be refused under s.269ST, or None.

    ``existing_cash_today`` is the cash already received from the same party
    on the same day (net of nothing: the section counts what was received);
    ``amount`` is the receipt being recorded. A non-positive amount is not a
    receipt and is never a violation.
    """
    already = to_decimal(existing_cash_today)
    now = to_decimal(amount)
    if now <= 0:
        return None
    if already < 0:
        already = Decimal("0")
    total = already + now
    if total < CASH_RECEIPT_LIMIT_INR:
        return None
    if already > 0:
        return (
            f"Cash receipt refused under s.269ST: Rs {now:,.2f} now plus Rs {already:,.2f} "
            f"already received in cash from this party today comes to Rs {total:,.2f}, "
            f"which is Rs {CASH_RECEIPT_LIMIT_INR:,.0f} or more. Take the balance by "
            "cheque, draft or bank transfer. No data was saved."
        )
    return (
        f"Cash receipt refused under s.269ST: Rs {now:,.2f} in cash from one party in a "
        f"day is Rs {CASH_RECEIPT_LIMIT_INR:,.0f} or more. Take it by cheque, draft or "
        "bank transfer. No data was saved."
    )


def pan_required_for_sale(grand_total, pan, gstin) -> bool:
    """True when Rule 114B needs a PAN on this invoice and none is on record.

    A well-formed GSTIN satisfies the rule because it carries the PAN; a
    well-formed PAN satisfies it directly. Below the threshold nothing is
    required.
    """
    if to_decimal(grand_total) < PAN_REQUIRED_SALE_INR:
        return False
    if has_valid_pan(pan):
        return False
    if is_gstin_shaped(gstin):
        return False
    return True


def pan_required_message(grand_total) -> str:
    return (
        f"Rule 114B: an invoice of Rs {to_decimal(grand_total):,.2f} is Rs "
        f"{PAN_REQUIRED_SALE_INR:,.0f} or more and the customer has neither a PAN nor a "
        "GSTIN on record. Supply the customer's PAN (it is stored on the party) or "
        "record their GSTIN before raising this invoice. No data was saved."
    )
