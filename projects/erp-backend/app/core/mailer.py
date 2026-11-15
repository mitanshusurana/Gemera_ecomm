"""Outgoing e-mail for documents: invoices, quotes, statements and reminders.

SMTP settings come from the environment (SMTP_HOST, SMTP_PORT, SMTP_USER,
SMTP_PASSWORD, SMTP_FROM, SMTP_FROM_NAME). With no host or sender configured
nothing is sent and the endpoints say so, rather than pretending.

The message bodies are built here as plain functions of the document, so
they can be tested without a mail server. Every value that came from a
person (names, notes, descriptions) is HTML-escaped.
"""
from __future__ import annotations

import asyncio
import re
import smtplib
import ssl
from datetime import date
from decimal import Decimal
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from typing import Any, Iterable, Mapping, Optional

from app.core.config import settings
from app.core.money import to_decimal

EMAIL_RE = re.compile(r"^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$")


def is_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_FROM)


def valid_address(addr: Optional[str]) -> bool:
    return bool(addr) and bool(EMAIL_RE.match(addr.strip())) and len(addr) <= 254


def split_addresses(value: Optional[str]) -> list[str]:
    """'a@x.com, b@y.com' -> ['a@x.com', 'b@y.com']; raises ValueError on a bad one."""
    out = []
    for part in re.split(r"[,;\s]+", value or ""):
        if not part:
            continue
        if not valid_address(part):
            raise ValueError(f"'{part}' is not a valid e-mail address.")
        out.append(part.strip())
    return out


def inr(value: Any) -> str:
    """12345678.5 -> 'Rs. 1,23,45,678.50' (Indian digit grouping)."""
    v = to_decimal(value).quantize(Decimal("0.01"))
    sign = "-" if v < 0 else ""
    whole, frac = f"{abs(v):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"{sign}Rs. {whole}.{frac}"


def _d(value: Any) -> str:
    if isinstance(value, date):
        return value.strftime("%d %b %Y")
    return str(value or "")


def _wrap(company: Mapping[str, Any], title: str, inner: str) -> str:
    name = escape(str(company.get("trade_name") or company.get("name") or ""))
    address = ", ".join(escape(str(company.get(k))) for k in ("address_line1", "city", "pincode") if company.get(k))
    gstin = f"GSTIN {escape(str(company['gstin']))}" if company.get("gstin") else ""
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1d1d1f;max-width:640px;margin:0 auto">'
        f'<h2 style="margin:0 0 4px 0">{name}</h2>'
        f'<p style="margin:0;color:#6e6e73;font-size:12px">{address}{" · " if address and gstin else ""}{gstin}</p>'
        f'<h3 style="margin:20px 0 8px 0">{escape(title)}</h3>{inner}'
        f'<p style="margin-top:24px;color:#6e6e73;font-size:12px">Sent from the books of {name}.</p></div>'
    )


def _table(headers: Iterable[str], rows: Iterable[Iterable[str]], right_from: int) -> str:
    th = "".join(
        f'<th style="text-align:{"right" if i >= right_from else "left"};padding:6px 8px;border-bottom:1px solid #d0d0d0;font-size:12px">{escape(h)}</th>'
        for i, h in enumerate(headers))
    body = ""
    for r in rows:
        body += "<tr>" + "".join(
            f'<td style="text-align:{"right" if i >= right_from else "left"};padding:6px 8px;border-bottom:1px solid #eee">{c}</td>'
            for i, c in enumerate(r)) + "</tr>"
    return f'<table style="border-collapse:collapse;width:100%"><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>'


def _bank(company: Mapping[str, Any]) -> str:
    b = company.get("bank")
    if not b:
        return ""
    bits = [b.get("bank_name"), f"A/c {b.get('account_no')}", f"IFSC {b.get('ifsc')}"]
    if b.get("upi_id"):
        bits.append(f"UPI {b['upi_id']}")
    return '<p style="margin-top:14px"><strong>Pay to:</strong> ' + escape(" · ".join(str(x) for x in bits if x)) + "</p>"


def _note(message: Optional[str]) -> str:
    return f'<p style="white-space:pre-line">{escape(message.strip())}</p>' if message and message.strip() else ""


def invoice_email(company: Mapping[str, Any], inv: Mapping[str, Any], lines: list[Mapping[str, Any]], message: Optional[str] = None) -> tuple[str, str, str]:
    """(subject, html, text) for a sales invoice."""
    due = to_decimal(inv["grand_total"]) - to_decimal(inv.get("amount_paid"))
    subject = f"Invoice {inv['invoice_no']} from {company.get('trade_name') or company.get('name')}"
    rows = [(escape(str(l.get("description") or "")), escape(str(l.get("quantity") or "")), inr(l.get("line_total"))) for l in lines]
    inner = (
        f"<p>Dear {escape(str(inv.get('party_name') or 'Customer'))},</p>{_note(message)}"
        f"<p>Invoice <strong>{escape(str(inv['invoice_no']))}</strong> dated {_d(inv['invoice_date'])}"
        + (f", due {_d(inv['due_date'])}" if inv.get("due_date") else "") + ".</p>"
        + _table(("Item", "Qty", "Amount"), rows, 1)
        + f'<p style="text-align:right;margin:10px 8px 0 0">GST included: {inr(inv.get("total_gst"))}<br>'
          f'<strong>Invoice total: {inr(inv["grand_total"])}</strong><br>Balance due: <strong>{inr(due)}</strong></p>'
        + _bank(company)
    )
    text = (f"Invoice {inv['invoice_no']} dated {_d(inv['invoice_date'])}. Total {inr(inv['grand_total'])}, "
            f"balance due {inr(due)}" + (f", due {_d(inv['due_date'])}" if inv.get("due_date") else "") + ".")
    return subject, _wrap(company, "Tax Invoice", inner), text


def order_email(company: Mapping[str, Any], doc: Mapping[str, Any], lines: list[Mapping[str, Any]], message: Optional[str] = None) -> tuple[str, str, str]:
    """(subject, html, text) for a quote, sales order or purchase order."""
    title = {"Quote": "Quotation", "SalesOrder": "Sales Order", "PurchaseOrder": "Purchase Order"}[doc["doc_type"]]
    subject = f"{title} {doc['doc_no']} from {company.get('trade_name') or company.get('name')}"
    rows = [(escape(str(l.get("description") or l.get("material_name") or "")), escape(str(l.get("quantity") or "")),
             inr(l.get("taxable")), inr(l.get("gst_amount")), inr(l.get("line_total"))) for l in lines]
    inner = (
        f"<p>Dear {escape(str(doc.get('party_name') or ''))},</p>{_note(message)}"
        f"<p>{title} <strong>{escape(str(doc['doc_no']))}</strong> dated {_d(doc['doc_date'])}"
        + (f", valid until {_d(doc['valid_until'])}" if doc.get("valid_until") and doc["doc_type"] == "Quote" else "") + ".</p>"
        + _table(("Item", "Qty", "Taxable", "GST", "Total"), rows, 1)
        + f'<p style="text-align:right;margin:10px 8px 0 0"><strong>Total: {inr(doc["grand_total"])}</strong></p>'
        + (f"<p><strong>Terms:</strong> {escape(str(doc['terms']))}</p>" if doc.get("terms") else "")
        + ("<p style=\"color:#6e6e73;font-size:12px\">This is a quotation, not a tax invoice.</p>" if doc["doc_type"] == "Quote" else "")
    )
    return subject, _wrap(company, title, inner), f"{title} {doc['doc_no']} dated {_d(doc['doc_date'])}. Total {inr(doc['grand_total'])}."


def statement_email(company: Mapping[str, Any], party_name: str, invoices: list[Mapping[str, Any]], as_of: date, *, reminder: bool, message: Optional[str] = None) -> tuple[str, str, str]:
    """(subject, html, text) for an account statement, or a reminder listing only overdue invoices."""
    total = sum((to_decimal(i["balance"]) for i in invoices), Decimal("0"))
    who = company.get("trade_name") or company.get("name")
    subject = (f"Payment reminder: {inr(total)} overdue to {who}" if reminder else f"Statement of account from {who} as on {_d(as_of)}")
    rows = [(escape(str(i["invoice_no"])), _d(i["invoice_date"]), _d(i.get("due_date")),
             (f"{int(i['days_overdue'])} days" if int(i.get("days_overdue") or 0) > 0 else "not yet due"), inr(i["balance"])) for i in invoices]
    lead = ("This is a reminder that the invoices below are past their due date." if reminder
            else "Please find below the invoices open on your account.")
    inner = (
        f"<p>Dear {escape(party_name)},</p>{_note(message)}<p>{lead}</p>"
        + _table(("Invoice", "Date", "Due", "Overdue", "Balance"), rows, 4)
        + f'<p style="text-align:right;margin:10px 8px 0 0"><strong>{"Total overdue" if reminder else "Total outstanding"}: {inr(total)}</strong></p>'
        + _bank(company)
        + "<p>If you have already paid, please ignore this message and accept our thanks.</p>"
    )
    return subject, _wrap(company, "Payment Reminder" if reminder else "Statement of Account", inner), f"{lead} Total {inr(total)}."


def _send_sync(to: list[str], cc: list[str], subject: str, html: str, text: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.SMTP_FROM_NAME or "", settings.SMTP_FROM))
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    port = int(settings.SMTP_PORT or 587)
    if port == 465:
        server: smtplib.SMTP = smtplib.SMTP_SSL(settings.SMTP_HOST, port, timeout=30, context=ssl.create_default_context())
    else:
        server = smtplib.SMTP(settings.SMTP_HOST, port, timeout=30)
    with server as s:
        s.ehlo()
        if port != 465 and s.has_extn("starttls"):
            s.starttls(context=ssl.create_default_context())
            s.ehlo()
        if settings.SMTP_USER:
            s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        s.send_message(msg)


async def send_mail(to: list[str], subject: str, html: str, text: str, cc: Optional[list[str]] = None) -> None:
    """Send one message. Raises on failure; the caller records the outcome."""
    if not is_configured():
        raise RuntimeError("E-mail is not configured (SMTP_HOST and SMTP_FROM).")
    await asyncio.to_thread(_send_sync, to, cc or [], subject, html, text)
