"""Bank statements, reconciliation matching and the BRS.

A match used to flag is_reconciled on both sides and store nothing else, so
no one could see which statement line a book entry had been matched to, and
un-matching had nothing to delete. The BRS report returned hardcoded zeros.

A match is now a row in reconciliation_matches (book_entry_line_id and
bank_entry_id, both real foreign keys after migration 0008) plus
bank_statement_lines.reconciled_entry_line_id; unmatch reads the row and
resets both sides. The report is arithmetic over what is actually matched:

    balance as per books (the bank ledger account, to the period end)
  + payments in the books not yet presented at the bank (unmatched credits)
  - deposits in the books not yet cleared by the bank (unmatched debits)
  = balance the statement should show
  - balance the statement does show (last imported line's running balance)
  = difference, reported as it is
"""
import io
import logging
import calendar
from uuid import UUID
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.core.database import get_db, set_audit_context
from app.core.money import round_money, to_decimal
from app.core.pagination import Page, paginate
from app.core.periods import assert_period_open
from app.core.roles import CAN_POST, require
from app.core.security import get_current_user
from app.services.bank_statement_parser import UnsupportedStatement, parse_statement
from app.api.v1.vouchers import get_fy, post_journal, settle_invoice

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Banking & BRS"])

class MatchPayload(BaseModel):
    # journal_entry_lines.id is a BIGINT; the reconciliation screen sends the
    # id it was given by GET /reconciliation, which is that integer.
    book_entry_id: int
    bank_entry_id: UUID
    reason: str = "Bank reconciliation match"

class UnmatchPayload(BaseModel):
    match_id: Optional[UUID] = None
    bank_entry_id: Optional[UUID] = None
    reason: str = "Bank reconciliation unmatch"


def compute_brs(
    book_balance: Any,
    unpresented_payments: Any,
    uncleared_deposits: Any,
    statement_closing: Any | None,
) -> dict:
    """The bank reconciliation statement arithmetic, in Decimal.

    ``statement_closing`` is None when no statement has been imported up to
    the period end; the difference is then None rather than a made-up zero.
    """
    book = round_money(book_balance)
    unpresented = round_money(unpresented_payments)
    uncleared = round_money(uncleared_deposits)
    expected = round_money(book + unpresented - uncleared)
    closing = round_money(statement_closing) if statement_closing is not None else None
    return {
        "balance_as_per_books": book,
        "add_unpresented_payments": unpresented,
        "less_uncleared_deposits": uncleared,
        "expected_balance_as_per_bank": expected,
        "balance_as_per_bank_statement": closing,
        "difference": round_money(closing - expected) if closing is not None else None,
        "reconciled": (closing is not None and abs(closing - expected) < Decimal("0.005")),
    }


def _month_bounds(month: Optional[str]) -> tuple[date, date]:
    """First and last day of ``month`` ("YYYY-MM"), of the whole year for a bare
    "YYYY", or of the current month when unset or malformed."""
    today = date.today()
    y, m = today.year, today.month
    if month:
        parts = month.strip().split("-")
        try:
            if len(parts) == 1 and len(parts[0]) == 4:
                y = int(parts[0])
                return date(y, 1, 1), date(y, 12, 31)
            if len(parts) >= 2:
                y, m = int(parts[0]), int(parts[1])
        except ValueError:
            y, m = today.year, today.month
        if not 1 <= m <= 12:
            y, m = today.year, today.month
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def _period_bounds(month: Optional[str], date_from: Optional[str], date_to: Optional[str]) -> tuple[date, date]:
    """The reconciliation window.

    ``date_from`` / ``date_to`` (YYYY-MM-DD) win and may be given singly: an
    open start reaches back to 2000-01-01, an open end runs to today. Without
    them the legacy ``month`` applies ("YYYY-MM", or "YYYY" for a whole year:
    picking just a year in the UI used to be read as the current month, so
    the other eleven months vanished). A reversed range is swapped, not
    rejected, since the browser's two date boxes are easy to fill in either
    order.
    """
    if date_from or date_to:
        try:
            start_d = date.fromisoformat(date_from) if date_from else date(2000, 1, 1)
            end_d = date.fromisoformat(date_to) if date_to else date.today()
        except ValueError:
            raise HTTPException(status_code=400, detail="date_from and date_to must be YYYY-MM-DD")
        if start_d > end_d:
            start_d, end_d = end_d, start_d
        return start_d, end_d
    return _month_bounds(month)



class BookFromStatementPayload(BaseModel):
    """Post a voucher for an unreconciled statement line and match it.

    Exactly one of ``party_id`` (customer or supplier: a Receipt or Payment on
    the party's ledger, optionally settling one of its invoices) or
    ``contra_account_id`` (any other ledger: bank charges, interest, owner's
    capital, a direct expense) must be given.
    """
    party_id: Optional[UUID] = None
    contra_account_id: Optional[UUID] = None
    invoice_id: Optional[UUID] = None
    reference_no: Optional[str] = None
    narration: Optional[str] = None
    payment_mode: Optional[str] = "NEFT"
    reason: str = "Booked from bank statement"


def _booking_plan(debit, credit) -> tuple[str, str, Decimal]:
    """(entry_type, voucher prefix, amount) for a statement line.

    Money into the bank (statement credit) is a Receipt: Dr bank, Cr contra.
    Money out (statement debit) is a Payment: Dr contra, Cr bank. A line with
    both or neither cannot be booked as one voucher.
    """
    dr = to_decimal(debit or 0)
    cr = to_decimal(credit or 0)
    if cr > 0 and dr == 0:
        return "Receipt", "REC", cr
    if dr > 0 and cr == 0:
        return "Payment", "PAY", dr
    raise HTTPException(status_code=422, detail="The statement line must have either a debit or a credit amount, not both or neither.")


def _pair_suggestions(bank_lines: list[dict], book_lines: list[dict], max_days: int = 5) -> list[dict]:
    """Greedy one-to-one pairing of statement and book lines by equal amount
    and nearest date. A statement credit matches a book debit on the bank
    account (money came in) and vice versa. Pure, for tests."""
    used_book: set = set()
    out = []
    for bl in sorted(bank_lines, key=lambda r: r["txn_date"]):
        cr = to_decimal(bl.get("credit") or 0)
        dr = to_decimal(bl.get("debit") or 0)
        if cr > 0:
            want = ("dr_amount", cr)
        elif dr > 0:
            want = ("cr_amount", dr)
        else:
            continue
        best = None
        for jl in book_lines:
            if jl["id"] in used_book or to_decimal(jl.get(want[0]) or 0) != want[1]:
                continue
            gap = abs((jl["entry_date"] - bl["txn_date"]).days)
            if gap <= max_days and (best is None or gap < best[0]):
                best = (gap, jl)
        if best:
            used_book.add(best[1]["id"])
            out.append({
                "bank_entry_id": str(bl["id"]), "book_entry_id": best[1]["id"],
                "amount": want[1], "days_apart": best[0],
                "bank_date": bl["txn_date"], "book_date": best[1]["entry_date"],
                "description": bl.get("description"), "book_entry_no": best[1].get("entry_no"),
                "book_narration": best[1].get("narration"),
            })
    return out


async def _record_match(db, company_id, user_id, book_line_id, bank_line_id, bank_account_id, entry_uuid) -> str:
    """The three writes that pair a book line with a statement line.

    Used by the manual match and by booking-from-statement so both leave the
    same trail: the statement line points at the book line, the book line is
    flagged, and reconciliation_matches holds the pair.
    """
    bank_res = await db.execute(
        text("""
            UPDATE caratloop.bank_statement_lines
            SET is_reconciled = TRUE, reconciled_at = NOW(), reconciled_entry_line_id = :book_id
            WHERE id = CAST(:bank_id AS UUID) AND company_id = CAST(:cid AS UUID)
              AND bank_account_id = CAST(:acc AS UUID)
              AND NOT is_reconciled
            RETURNING bank_account_id
        """),
        {"cid": str(company_id), "bank_id": str(bank_line_id), "book_id": book_line_id, "acc": str(bank_account_id)}
    )
    if bank_res.scalar() is None:
        raise HTTPException(status_code=404, detail="Bank statement line not found for this account, or already reconciled")
    await db.execute(
        text("""
            UPDATE caratloop.journal_entry_lines
            SET is_reconciled = TRUE, reconciled_at = NOW(), reconciled_by = CAST(:uid AS UUID)
            WHERE id = :book_id
        """),
        {"book_id": book_line_id, "uid": str(user_id)}
    )
    m_res = await db.execute(
        text("""
            INSERT INTO caratloop.reconciliation_matches
                (company_id, book_entry_id, book_entry_line_id, bank_entry_id, bank_account_id, matched_by)
            VALUES (CAST(:cid AS UUID), :entry_uuid, :book_id, CAST(:bank_id AS UUID), CAST(:acc AS UUID), CAST(:uid AS UUID))
            RETURNING id
        """),
        {"cid": str(company_id), "entry_uuid": entry_uuid, "book_id": book_line_id,
         "bank_id": str(bank_line_id), "acc": str(bank_account_id), "uid": str(user_id)}
    )
    return str(m_res.scalar())


@router.get("/accounts")
async def list_bank_accounts(page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    company_id = current_user["company_id"]
    query = """
        SELECT a.id, a.code, a.name, a.account_type, a.currency
        FROM caratloop.accounts a
        JOIN caratloop.account_groups g ON a.group_id = g.id
        WHERE a.company_id = CAST(:cid AS UUID) AND (g.name ILIKE '%Bank Accounts%' OR a.account_type = 'Bank' OR a.name ILIKE '%Bank%')
    """
    # Bounded like the other list endpoints.
    res = await db.execute(text(page.apply(query)),
                           {"cid": str(company_id), **page.params})
    return [dict(r) for r in res.mappings().all()]

@router.post("/statement/import", dependencies=[Depends(require(*CAN_POST))])
async def import_statement(
    bank_account_id: Optional[str] = Form(None),
    account_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Import a bank statement export (SBI/HDFC/ICICI text, CSV or .xlsx).

    Parsing lives in app.services.bank_statement_parser: the first real upload
    was SBI's tab-separated "xls", which openpyxl rejected with a 500. Lines
    already present for the account (same date, amounts, balance and
    description) are skipped, so re-uploading an overlapping statement is safe.
    """
    target_acc = bank_account_id or account_id
    if not target_acc:
        raise HTTPException(status_code=400, detail="Bank account ID is required")
    company_id = current_user["company_id"]
    content = await file.read()
    try:
        parsed = parse_statement(content, file.filename or "")
    except UnsupportedStatement as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not parsed.lines:
        raise HTTPException(
            status_code=400,
            detail="The file has a transaction table but no rows with a date in it; "
                   "check that the statement period contains transactions.",
        )

    # The table is created by migration 0001. Creating it here raced on
    # concurrent imports, was invisible to migration tooling, and declared a
    # different column shape than the migration does.

    batch_id_res = await db.execute(text("SELECT gen_random_uuid()"))
    batch_id = batch_id_res.scalar()

    imported = 0
    duplicates = 0
    for line in parsed.lines:
        params = {
            "cid": str(company_id), "acc": str(target_acc), "batch": batch_id,
            "td": line.txn_date, "vd": line.value_date, "desc": line.description, "ref": line.ref_no,
            "dr": line.debit, "cr": line.credit, "bal": line.balance,
        }
        dup = await db.execute(
            text("""
                SELECT 1 FROM caratloop.bank_statement_lines
                WHERE company_id = CAST(:cid AS UUID) AND bank_account_id = CAST(:acc AS UUID)
                  AND txn_date = :td AND debit = :dr AND credit = :cr AND balance = :bal
                  AND COALESCE(description, '') = :desc
                LIMIT 1
            """),
            params,
        )
        if dup.scalar():
            duplicates += 1
            continue
        await db.execute(
            text("""
                INSERT INTO caratloop.bank_statement_lines
                (company_id, bank_account_id, import_batch_id, txn_date, value_date, description, ref_no, debit, credit, balance)
                VALUES (CAST(:cid AS UUID), CAST(:acc AS UUID), :batch, :td, :vd, :desc, :ref, :dr, :cr, :bal)
            """),
            params,
        )
        imported += 1

    await db.commit()
    return {
        "status": "success",
        "imported_rows": imported,
        "duplicate_rows_skipped": duplicates,
        "non_transaction_rows_skipped": parsed.skipped_rows,
        "format": parsed.format,
        "batch_id": str(batch_id),
    }


async def _first_bank_account(db: AsyncSession, company_id) -> Optional[str]:
    acc_res = await db.execute(
        text("SELECT id FROM caratloop.accounts WHERE company_id = CAST(:cid AS UUID) AND (account_type = 'Bank' OR name ILIKE '%Bank%') ORDER BY code LIMIT 1"),
        {"cid": str(company_id)}
    )
    first = acc_res.scalar()
    return str(first) if first else None


@router.get("/reconciliation")
async def get_reconciliation(
    account_id: Optional[str] = None,
    month: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Unmatched book lines, unmatched statement lines, and the period's matches.

    The period is ``date_from``..``date_to`` when given, else ``month``
    (see _period_bounds).
    """
    company_id = current_user["company_id"]
    start_d, end_d = _period_bounds(month, date_from, date_to)
    if not account_id:
        account_id = await _first_bank_account(db, company_id)
        if not account_id:
            return {"book_entries": [], "bank_entries": [], "matches": [], "summary": {"unreconciled_count": 0},
                    "date_from": start_d.isoformat(), "date_to": end_d.isoformat()}

    book_res = await db.execute(
        text("""
            SELECT jel.id, je.entry_date, je.entry_no, je.entry_type, jel.dr_amount, jel.cr_amount, jel.narration
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_id = CAST(:acc AS UUID) AND je.company_id = CAST(:cid AS UUID)
              AND je.status = 'Posted'
              AND je.entry_date BETWEEN :start_d AND :end_d
              AND NOT COALESCE(jel.is_reconciled, FALSE)
            ORDER BY je.entry_date DESC
        """),
        {"acc": str(account_id), "cid": str(company_id), "start_d": start_d, "end_d": end_d}
    )
    book_entries = [dict(r) for r in book_res.mappings().all()]

    bank_res = await db.execute(
        text("""
            SELECT id, txn_date, description, ref_no, debit, credit, balance
            FROM caratloop.bank_statement_lines
            WHERE bank_account_id = CAST(:acc AS UUID) AND company_id = CAST(:cid AS UUID)
              AND txn_date BETWEEN :start_d AND :end_d
              AND NOT is_reconciled
            ORDER BY txn_date DESC
        """),
        {"acc": str(account_id), "cid": str(company_id), "start_d": start_d, "end_d": end_d}
    )
    bank_entries = [dict(r) for r in bank_res.mappings().all()]

    match_res = await db.execute(
        text("""
            SELECT m.id AS match_id, m.matched_at, u.full_name AS matched_by_name,
                   b.id AS bank_entry_id, b.txn_date, b.description, b.ref_no, b.debit, b.credit,
                   jel.id AS book_entry_id, je.entry_date, je.entry_no, jel.dr_amount, jel.cr_amount, jel.narration
            FROM caratloop.reconciliation_matches m
            JOIN caratloop.bank_statement_lines b ON b.id = m.bank_entry_id
            LEFT JOIN caratloop.journal_entry_lines jel ON jel.id = m.book_entry_line_id
            LEFT JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            LEFT JOIN caratloop.users u ON u.id = m.matched_by
            WHERE m.company_id = CAST(:cid AS UUID) AND b.bank_account_id = CAST(:acc AS UUID)
              AND b.txn_date BETWEEN :start_d AND :end_d
            ORDER BY b.txn_date DESC, m.matched_at DESC
        """),
        {"acc": str(account_id), "cid": str(company_id), "start_d": start_d, "end_d": end_d}
    )
    matches = [dict(r) for r in match_res.mappings().all()]

    return {
        "account_id": str(account_id),
        "month": f"{start_d.year}-{start_d.month:02d}",
        "date_from": start_d.isoformat(),
        "date_to": end_d.isoformat(),
        "book_entries": book_entries,
        "bank_entries": bank_entries,
        "matches": matches,
        "summary": {
            "unreconciled_count": len(book_entries) + len(bank_entries),
            "unreconciled_book": len(book_entries),
            "unreconciled_bank": len(bank_entries),
            "matched": len(matches),
        }
    }

@router.post("/reconciliation/match", dependencies=[Depends(require(*CAN_POST))])
async def match_entries(payload: MatchPayload, request: Request, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    company_id = current_user["company_id"]
    user_id = current_user["id"]
    ip = request.client.host if request.client else "0.0.0.0"
    await set_audit_context(db, str(user_id), current_user.get("session_id", "0"), ip, payload.reason)

    try:
        # The book entry was addressed by id alone, so any caller could mark
        # any company's journal line as reconciled. journal_entry_lines
        # carries no company_id; ownership is on the parent journal entry.
        owner_res = await db.execute(
            text("""
                SELECT jel.id, jel.account_id, jel.is_reconciled, je.entry_date, je.entry_uuid
                FROM caratloop.journal_entry_lines jel
                JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                WHERE jel.id = :book_id AND je.company_id = CAST(:cid AS UUID)
                LIMIT 1
            """),
            {"book_id": payload.book_entry_id, "cid": str(company_id)}
        )
        book = owner_res.mappings().first()
        if book is None:
            raise HTTPException(status_code=404, detail="Book entry not found")
        if book["is_reconciled"]:
            raise HTTPException(status_code=409, detail="That book entry is already reconciled; unmatch it first.")

        # Reconciling changes the audited state of an entry in the period it
        # belongs to, so a locked year refuses it like any other posting.
        await assert_period_open(db, company_id, book["entry_date"], what="The book entry being reconciled")

        match_id = await _record_match(
            db, company_id, user_id, payload.book_entry_id, payload.bank_entry_id, book["account_id"], book["entry_uuid"],
        )
        await db.commit()
        return {"status": "success", "message": "Entries reconciled successfully", "match_id": str(match_id)}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Reconciliation match failed. Nothing was saved.") from e



@router.post("/statement/{line_id}/book", dependencies=[Depends(require(*CAN_POST))])
async def book_from_statement(line_id: UUID, payload: BookFromStatementPayload, request: Request,
                              db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Post a Receipt or Payment voucher for an unreconciled statement line and match the two.

    Reconciling by hand meant leaving this screen, keying the voucher with the
    same date and amount, coming back and pairing it. This does all of it from
    the statement line: direction and amount come from the line, the contra
    ledger from the payload, the voucher is numbered and balanced through the
    same path as the voucher screens, and the pair is recorded.
    """
    company_id = current_user["company_id"]
    user_id = str(current_user["id"])
    ip = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip, payload.reason)
    if bool(payload.party_id) == bool(payload.contra_account_id):
        raise HTTPException(status_code=422, detail="Give either party_id or contra_account_id.")
    try:
        line_res = await db.execute(
            text("""
                SELECT id, bank_account_id, txn_date, debit, credit, description, ref_no, is_reconciled
                FROM caratloop.bank_statement_lines
                WHERE id = CAST(:lid AS UUID) AND company_id = CAST(:cid AS UUID)
                FOR UPDATE
            """),
            {"lid": str(line_id), "cid": str(company_id)},
        )
        line = line_res.mappings().first()
        if line is None:
            raise HTTPException(status_code=404, detail="Statement line not found")
        if line["is_reconciled"]:
            raise HTTPException(status_code=409, detail="That statement line is already reconciled.")

        entry_type, prefix, amount = _booking_plan(line["debit"], line["credit"])
        await assert_period_open(db, company_id, line["txn_date"], what="The statement line being booked")

        if payload.party_id:
            p_res = await db.execute(
                text("SELECT account_id, name FROM caratloop.parties WHERE id = CAST(:pid AS UUID) AND company_id = CAST(:cid AS UUID)"),
                {"pid": str(payload.party_id), "cid": str(company_id)},
            )
            party = p_res.mappings().first()
            if party is None:
                raise HTTPException(status_code=404, detail="Party not found")
            contra_acc = party["account_id"]
            contra_name = party["name"]
        else:
            a_res = await db.execute(
                text("SELECT id, name FROM caratloop.accounts WHERE id = CAST(:aid AS UUID) AND company_id = CAST(:cid AS UUID) AND is_active = TRUE"),
                {"aid": str(payload.contra_account_id), "cid": str(company_id)},
            )
            acc = a_res.mappings().first()
            if acc is None:
                raise HTTPException(status_code=404, detail="Ledger account not found")
            contra_acc = acc["id"]
            contra_name = acc["name"]
        if str(contra_acc) == str(line["bank_account_id"]):
            raise HTTPException(status_code=422, detail="The contra ledger cannot be the bank account itself; use a contra voucher for transfers.")

        fy = await get_fy(db, company_id)
        no_res = await db.execute(
            text("SELECT :prefix || '/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
            {"prefix": prefix, "fy": fy["year_label"]},
        )
        vno = no_res.scalar()

        inv_id = None
        if payload.party_id and (payload.invoice_id or (payload.reference_no or "").strip()):
            inv_id = await settle_invoice(
                db, "sales_invoices" if entry_type == "Receipt" else "purchase_invoices", str(company_id), amount,
                invoice_id=payload.invoice_id, reference_no=payload.reference_no, party_id=payload.party_id,
            )

        narration = (payload.narration or "").strip() or f"{entry_type} per bank statement: {(line['description'] or '')[:160]}".strip()
        if len(full_ref := (payload.reference_no or line["ref_no"] or "").strip()) > 50 and full_ref not in narration:
            narration = f"{narration} [ref {full_ref[:200]}]"
        # journal_entries.reference_no is varchar(50); SBI references such as
        # "TRANSFER FROM 1234567890 / <name>" run past that and the INSERT
        # failed with "value too long". The narration keeps the full text.
        reference_no = full_ref[:50] or None
        bank_acc = str(line["bank_account_id"])
        if entry_type == "Receipt":
            lines = [{"acc": bank_acc, "dr": amount, "cr": Decimal("0"), "narr": narration},
                     {"acc": str(contra_acc), "dr": Decimal("0"), "cr": amount, "narr": narration}]
        else:
            lines = [{"acc": str(contra_acc), "dr": amount, "cr": Decimal("0"), "narr": narration},
                     {"acc": bank_acc, "dr": Decimal("0"), "cr": amount, "narr": narration}]
        je_id = await post_journal(
            db, str(company_id), str(fy["id"]), vno, line["txn_date"], entry_type, narration, reference_no, amount,
            user_id, ip, session_id, lines,
            ref_type=(f"{entry_type}Voucher" if inv_id else "BankStatementLine"),
            ref_id=(inv_id if inv_id else line["id"]),
        )

        jl_res = await db.execute(
            text("""
                SELECT jel.id, je.entry_uuid
                FROM caratloop.journal_entry_lines jel
                JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                WHERE jel.journal_entry_id = :je AND jel.account_id = CAST(:acc AS UUID)
                ORDER BY jel.sequence_no LIMIT 1
            """),
            {"je": je_id, "acc": bank_acc},
        )
        jl = jl_res.mappings().first()
        if jl is None:
            raise HTTPException(status_code=500, detail="The voucher posted but its bank line could not be found; nothing was saved.")
        match_id = await _record_match(db, company_id, user_id, jl["id"], line["id"], bank_acc, jl["entry_uuid"])

        await db.commit()
        return {
            "status": "success", "entry_type": entry_type, "voucher_no": vno, "journal_entry_id": str(je_id),
            "amount": str(amount), "contra": contra_name, "match_id": match_id,
            "settled_invoice_id": str(inv_id) if inv_id else None,
        }
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        # The three 500s on 2026-10-31 left no trace in the log; the cause
        # (a 66-character reference against a varchar(50)) had to be dug out
        # of the Postgres log instead.
        logger.exception("Booking from statement line %s failed", line_id)
        raise HTTPException(status_code=500, detail="Booking from the statement failed. Nothing was saved.") from e


@router.get("/reconciliation/suggestions")
async def reconciliation_suggestions(
    account_id: Optional[str] = None,
    month: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    max_days: int = 5,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Unreconciled statement and book lines that agree on amount within ``max_days``.

    Book lines are drawn from a window ``max_days`` wider than the statement
    window, so a cheque booked on the 30th that cleared on the 2nd is found.
    """
    company_id = current_user["company_id"]
    start_d, end_d = _period_bounds(month, date_from, date_to)
    if not account_id:
        account_id = await _first_bank_account(db, company_id)
        if not account_id:
            return {"suggestions": []}
    pad = timedelta(days=max(0, min(max_days, 31)))
    bank_res = await db.execute(
        text("""
            SELECT id, txn_date, description, ref_no, debit, credit
            FROM caratloop.bank_statement_lines
            WHERE bank_account_id = CAST(:acc AS UUID) AND company_id = CAST(:cid AS UUID)
              AND txn_date BETWEEN :start_d AND :end_d AND NOT is_reconciled
        """),
        {"acc": str(account_id), "cid": str(company_id), "start_d": start_d, "end_d": end_d},
    )
    book_res = await db.execute(
        text("""
            SELECT jel.id, je.entry_date, je.entry_no, jel.dr_amount, jel.cr_amount, jel.narration
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_id = CAST(:acc AS UUID) AND je.company_id = CAST(:cid AS UUID)
              AND je.status = 'Posted' AND NOT COALESCE(jel.is_reconciled, FALSE)
              AND je.entry_date BETWEEN :start_d AND :end_d
        """),
        {"acc": str(account_id), "cid": str(company_id), "start_d": start_d - pad, "end_d": end_d + pad},
    )
    pairs = _pair_suggestions([dict(r) for r in bank_res.mappings().all()], [dict(r) for r in book_res.mappings().all()], pad.days)
    return {"account_id": str(account_id), "date_from": start_d.isoformat(), "date_to": end_d.isoformat(), "suggestions": pairs}


@router.post("/reconciliation/unmatch", dependencies=[Depends(require(*CAN_POST))])
async def unmatch_entries(payload: UnmatchPayload, request: Request, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Undo a match: both sides go back to unreconciled and the pairing row is removed."""
    company_id = current_user["company_id"]
    ip = request.client.host if request.client else "0.0.0.0"
    await set_audit_context(db, str(current_user["id"]), current_user.get("session_id", "0"), ip, payload.reason)
    if not payload.match_id and not payload.bank_entry_id:
        raise HTTPException(status_code=422, detail="match_id or bank_entry_id is required")
    try:
        res = await db.execute(
            text("""
                SELECT m.id, m.bank_entry_id, COALESCE(m.book_entry_line_id, b.reconciled_entry_line_id) AS book_line_id
                FROM caratloop.reconciliation_matches m
                JOIN caratloop.bank_statement_lines b ON b.id = m.bank_entry_id
                WHERE m.company_id = CAST(:cid AS UUID)
                  AND (m.id = CAST(:mid AS UUID) OR m.bank_entry_id = CAST(:bid AS UUID))
                LIMIT 1
            """),
            {"cid": str(company_id), "mid": str(payload.match_id) if payload.match_id else None,
             "bid": str(payload.bank_entry_id) if payload.bank_entry_id else None}
        )
        m = res.mappings().first()
        if m is None:
            # A line reconciled before matches were stored: fall back to the
            # link on the statement line itself.
            if not payload.bank_entry_id:
                raise HTTPException(status_code=404, detail="Match not found")
            res = await db.execute(
                text("SELECT id AS bank_entry_id, reconciled_entry_line_id AS book_line_id, NULL::uuid AS id "
                     "FROM caratloop.bank_statement_lines WHERE id = CAST(:bid AS UUID) AND company_id = CAST(:cid AS UUID) AND is_reconciled"),
                {"bid": str(payload.bank_entry_id), "cid": str(company_id)}
            )
            m = res.mappings().first()
            if m is None:
                raise HTTPException(status_code=404, detail="Match not found")

        await db.execute(
            text("""
                UPDATE caratloop.bank_statement_lines
                SET is_reconciled = FALSE, reconciled_at = NULL, reconciled_entry_line_id = NULL
                WHERE id = CAST(:bid AS UUID) AND company_id = CAST(:cid AS UUID)
            """),
            {"bid": str(m["bank_entry_id"]), "cid": str(company_id)}
        )
        if m["book_line_id"] is not None:
            await db.execute(
                text("""
                    UPDATE caratloop.journal_entry_lines jel
                    SET is_reconciled = FALSE, reconciled_at = NULL, reconciled_by = NULL
                    FROM caratloop.journal_entries je
                    WHERE je.id = jel.journal_entry_id AND jel.id = :book_id AND je.company_id = CAST(:cid AS UUID)
                """),
                {"book_id": int(m["book_line_id"]), "cid": str(company_id)}
            )
        if m["id"] is not None:
            await db.execute(
                text("DELETE FROM caratloop.reconciliation_matches WHERE id = CAST(:mid AS UUID) AND company_id = CAST(:cid AS UUID)"),
                {"mid": str(m["id"]), "cid": str(company_id)}
            )
        await db.commit()
        return {"status": "success", "message": "Match removed"}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Unmatch failed. Nothing was saved.") from e


@router.get("/reconciliation/report")
async def get_brs_report(
    account_id: Optional[str] = None,
    month: Optional[str] = None,
    as_of_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Bank reconciliation statement as at the end of ``month`` (or ``as_of_date``)."""
    company_id = current_user["company_id"]
    if not account_id:
        account_id = await _first_bank_account(db, company_id)
        if not account_id:
            raise HTTPException(status_code=404, detail="No bank account in the chart of accounts")

    if as_of_date:
        end_d = date.fromisoformat(as_of_date)
    else:
        _, end_d = _month_bounds(month)

    # Balance as per books: inception opening balance plus every posting to
    # the date. 'Opening' journals restate balances already posted (see
    # app.core.periods) and are skipped.
    acc_res = await db.execute(
        text("""
            SELECT a.name, a.code, a.normal_balance, a.opening_balance,
                   COALESCE(t.dr, 0) AS dr, COALESCE(t.cr, 0) AS cr
            FROM caratloop.accounts a
            LEFT JOIN (
                SELECT jel.account_id, SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr
                FROM caratloop.journal_entry_lines jel
                JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                WHERE je.company_id = CAST(:cid AS UUID) AND je.status = 'Posted'
                  AND je.entry_date <= :td AND je.entry_type <> 'Opening'
                GROUP BY jel.account_id
            ) t ON t.account_id = a.id
            WHERE a.id = CAST(:acc AS UUID) AND a.company_id = CAST(:cid AS UUID)
        """),
        {"acc": str(account_id), "cid": str(company_id), "td": end_d}
    )
    acc = acc_res.mappings().first()
    if acc is None:
        raise HTTPException(status_code=404, detail="Bank account not found")
    opening = to_decimal(acc["opening_balance"])
    if (acc["normal_balance"] or "D") != "D":
        opening = -opening
    book_bal = opening + to_decimal(acc["dr"]) - to_decimal(acc["cr"])

    # Book lines outstanding at the date: never matched, or matched to a
    # statement line dated after it. Debits are money the books say came in
    # (deposits not yet cleared); credits are payments not yet presented.
    out_res = await db.execute(
        text("""
            SELECT jel.id, je.entry_date, je.entry_no, jel.dr_amount, jel.cr_amount, jel.narration, b.txn_date AS cleared_on
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            LEFT JOIN caratloop.bank_statement_lines b ON b.reconciled_entry_line_id = jel.id
            WHERE jel.account_id = CAST(:acc AS UUID) AND je.company_id = CAST(:cid AS UUID)
              AND je.status = 'Posted' AND je.entry_type <> 'Opening'
              AND je.entry_date <= :td
              AND (NOT COALESCE(jel.is_reconciled, FALSE) OR b.txn_date > :td)
            ORDER BY je.entry_date, jel.id
        """),
        {"acc": str(account_id), "cid": str(company_id), "td": end_d}
    )
    outstanding = [dict(r) for r in out_res.mappings().all()]
    uncleared_deposits = sum((to_decimal(r["dr_amount"]) for r in outstanding), Decimal("0"))
    unpresented_payments = sum((to_decimal(r["cr_amount"]) for r in outstanding), Decimal("0"))

    stmt_res = await db.execute(
        text("""
            SELECT balance, txn_date
            FROM caratloop.bank_statement_lines
            WHERE bank_account_id = CAST(:acc AS UUID) AND company_id = CAST(:cid AS UUID) AND txn_date <= :td
            ORDER BY txn_date DESC, created_at DESC LIMIT 1
        """),
        {"acc": str(account_id), "cid": str(company_id), "td": end_d}
    )
    stmt = stmt_res.mappings().first()

    # Statement lines not matched to any book entry: what the bank has that
    # the books do not (charges, interest, direct credits).
    bank_out_res = await db.execute(
        text("""
            SELECT id, txn_date, description, ref_no, debit, credit
            FROM caratloop.bank_statement_lines
            WHERE bank_account_id = CAST(:acc AS UUID) AND company_id = CAST(:cid AS UUID)
              AND txn_date <= :td AND NOT is_reconciled
            ORDER BY txn_date, created_at
        """),
        {"acc": str(account_id), "cid": str(company_id), "td": end_d}
    )
    bank_outstanding = [dict(r) for r in bank_out_res.mappings().all()]

    brs = compute_brs(
        book_bal, unpresented_payments, uncleared_deposits,
        to_decimal(stmt["balance"]) if stmt else None,
    )
    return {
        "account_id": str(account_id),
        "account_name": acc["name"],
        "account_code": acc["code"],
        "as_of_date": str(end_d),
        "statement_balance_date": str(stmt["txn_date"]) if stmt else None,
        **brs,
        "unpresented_payments": [r for r in outstanding if to_decimal(r["cr_amount"]) > 0],
        "uncleared_deposits": [r for r in outstanding if to_decimal(r["dr_amount"]) > 0],
        "bank_credits_not_in_books": sum((to_decimal(r["credit"]) for r in bank_outstanding), Decimal("0")),
        "bank_debits_not_in_books": sum((to_decimal(r["debit"]) for r in bank_outstanding), Decimal("0")),
        "statement_lines_not_in_books": bank_outstanding,
        "note": (
            "No bank statement imported up to this date; the balance as per bank is unknown."
            if stmt is None else
            "Difference is statement balance less the balance the books predict; "
            "statement lines not in the books usually explain it."
        ),
    }
