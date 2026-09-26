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
import calendar
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
import openpyxl

from app.core.database import get_db, set_audit_context
from app.core.money import round_money, to_decimal
from app.core.pagination import Page, paginate
from app.core.periods import assert_period_open
from app.core.roles import CAN_POST, require
from app.core.security import get_current_user

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
    today = date.today()
    y, m = today.year, today.month
    if month and "-" in month:
        parts = month.split("-")
        y, m = int(parts[0]), int(parts[1])
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


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
    target_acc = bank_account_id or account_id
    if not target_acc:
        raise HTTPException(status_code=400, detail="Bank account ID is required")
    company_id = current_user["company_id"]
    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    sheet = wb.active

    # The table is created by migration 0001. Creating it here raced on
    # concurrent imports, was invisible to migration tooling, and declared a
    # different column shape than the migration does.

    batch_id_res = await db.execute(text("SELECT gen_random_uuid()"))
    batch_id = batch_id_res.scalar()

    count = 0
    header_found = False
    col_map = {}

    for row in sheet.iter_rows(values_only=True):
        if not header_found:
            row_strs = [str(c).strip() if c else "" for c in row]
            if any("date" in s.lower() for s in row_strs) or "Txn Date" in row_strs:
                header_found = True
                for i, col_name in enumerate(row_strs):
                    col_map[col_name] = i
            continue

        txn_date_val = row[col_map.get("Txn Date", 0)] if "Txn Date" in col_map else row[0]
        if not txn_date_val:
            continue

        if isinstance(txn_date_val, datetime):
            txn_date = txn_date_val.date()
        elif isinstance(txn_date_val, str):
            try:
                txn_date = date.fromisoformat(txn_date_val[:10])
            except Exception:
                txn_date = date.today()
        else:
            txn_date = date.today()

        desc = str(row[col_map.get("Description", 1)] if "Description" in col_map else row[1] if len(row) > 1 else "")[:500]
        ref_no = str(row[col_map.get("Ref No./Cheque No.", 2)] if "Ref No./Cheque No." in col_map else row[2] if len(row) > 2 else "")[:100]
        debit = to_decimal(row[col_map.get("Debit", 3)] or 0) if len(row) > 3 else Decimal("0")
        credit = to_decimal(row[col_map.get("Credit", 4)] or 0) if len(row) > 4 else Decimal("0")
        bal = to_decimal(row[col_map.get("Balance", 5)] or 0) if len(row) > 5 else Decimal("0")

        await db.execute(
            text("""
                INSERT INTO caratloop.bank_statement_lines
                (company_id, bank_account_id, import_batch_id, txn_date, value_date, description, ref_no, debit, credit, balance)
                VALUES (CAST(:cid AS UUID), CAST(:acc AS UUID), :batch, :td, :vd, :desc, :ref, :dr, :cr, :bal)
            """),
            {"cid": str(company_id), "acc": str(target_acc), "batch": batch_id, "td": txn_date, "vd": txn_date, "desc": desc, "ref": ref_no, "dr": debit, "cr": credit, "bal": bal}
        )
        count += 1

    await db.commit()
    return {"status": "success", "imported_rows": count, "batch_id": str(batch_id)}


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
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Unmatched book lines, unmatched statement lines, and the month's matches."""
    company_id = current_user["company_id"]
    if not account_id:
        account_id = await _first_bank_account(db, company_id)
        if not account_id:
            return {"book_entries": [], "bank_entries": [], "matches": [], "summary": {"unreconciled_count": 0}}

    start_d, end_d = _month_bounds(month)

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

        # Bank line first, and only if it is ours and in the same account:
        # otherwise the book line would be flagged reconciled against a
        # statement line that never changed.
        bank_res = await db.execute(
            text("""
                UPDATE caratloop.bank_statement_lines
                SET is_reconciled = TRUE, reconciled_at = NOW(), reconciled_entry_line_id = :book_id
                WHERE id = CAST(:bank_id AS UUID) AND company_id = CAST(:cid AS UUID)
                  AND bank_account_id = CAST(:acc AS UUID)
                  AND NOT is_reconciled
                RETURNING bank_account_id
            """),
            {"cid": str(company_id), "bank_id": str(payload.bank_entry_id), "book_id": payload.book_entry_id, "acc": str(book["account_id"])}
        )
        bank_acc = bank_res.scalar()
        if bank_acc is None:
            raise HTTPException(status_code=404, detail="Bank statement line not found for this account, or already reconciled")

        await db.execute(
            text("""
                UPDATE caratloop.journal_entry_lines
                SET is_reconciled = TRUE, reconciled_at = NOW(), reconciled_by = CAST(:uid AS UUID)
                WHERE id = :book_id
            """),
            {"book_id": payload.book_entry_id, "uid": str(user_id)}
        )
        m_res = await db.execute(
            text("""
                INSERT INTO caratloop.reconciliation_matches
                    (company_id, book_entry_id, book_entry_line_id, bank_entry_id, bank_account_id, matched_by)
                VALUES (CAST(:cid AS UUID), :entry_uuid, :book_id, CAST(:bank_id AS UUID), CAST(:acc AS UUID), CAST(:uid AS UUID))
                RETURNING id
            """),
            {"cid": str(company_id), "entry_uuid": book["entry_uuid"], "book_id": payload.book_entry_id,
             "bank_id": str(payload.bank_entry_id), "acc": str(bank_acc), "uid": str(user_id)}
        )
        match_id = m_res.scalar()
        await db.commit()
        return {"status": "success", "message": "Entries reconciled successfully", "match_id": str(match_id)}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Reconciliation match failed. Nothing was saved.") from e


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
