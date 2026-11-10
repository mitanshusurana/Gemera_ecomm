"""Payment terms and the due date they imply.

sales_invoices.due_date existed since the baseline and nothing wrote it, so
"overdue" could only be estimated from the party's credit days. The invoice
now carries its own terms: 'Immediate' (due on the invoice date), 'Net N'
(N days after it), or 'Custom' with an explicit date.
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Optional

PAYMENT_TERMS = ("Immediate", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60", "Custom")

_NET = re.compile(r"^\s*net\s*(\d{1,3})\s*$", re.I)


def net_days(payment_terms: Optional[str]) -> int:
    """Days of credit in 'Net 30'; 0 for 'Immediate', blank or anything else."""
    m = _NET.match(payment_terms or "")
    return int(m.group(1)) if m else 0


def due_date_for(invoice_date: date, payment_terms: Optional[str], explicit: Optional[date] = None) -> date:
    """The date an invoice falls due.

    An explicit date wins (that is what 'Custom' sends) but may not precede
    the invoice; otherwise the terms decide.
    """
    if explicit is not None:
        if explicit < invoice_date:
            raise ValueError("The due date cannot be before the invoice date.")
        return explicit
    return invoice_date + timedelta(days=net_days(payment_terms))
