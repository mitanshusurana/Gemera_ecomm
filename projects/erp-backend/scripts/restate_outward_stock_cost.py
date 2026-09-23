"""Restate outward stock rows from selling price to cost.

Before the costing change, an outward stock_ledger_entry recorded the
tax-inclusive SELLING price in ``amount``. The weighted average is derived from
inward rows only, so those outward rows do not corrupt the average directly --
but they do make the stock ledger's own value column meaningless, and any
report that sums ``amount`` across directions is wrong.

This is deliberately NOT an Alembic migration. It rewrites posted financial
records, so it must be a considered act with a reviewed diff, not something
that happens silently during a deploy. The audit trigger records every UPDATE
it makes, which is the point.

Usage:

    # report only, changes nothing (default)
    python -m scripts.restate_outward_stock_cost

    # restrict to one company
    python -m scripts.restate_outward_stock_cost --company <uuid>

    # actually write, with a reason recorded in the audit trail
    python -m scripts.restate_outward_stock_cost --apply --reason "FY25 restatement"

Rows whose material has no inward history cannot be costed and are reported,
not guessed at.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.core.database import get_sessionmaker, set_audit_context  # noqa: E402
from app.core.money import round_money, to_decimal  # noqa: E402

# Cost per unit, from inward movements only, per material.
AVERAGE_SQL = """
    SELECT material_id,
           SUM(amount)   AS total_amount,
           SUM(quantity) AS total_qty
    FROM caratloop.stock_ledger_entries
    WHERE direction = 'I'
      AND (:cid IS NULL OR company_id = CAST(:cid AS UUID))
    GROUP BY material_id
"""

OUTWARD_SQL = """
    SELECT id, company_id, material_id, quantity, amount, entry_date,
           source_document_no
    FROM caratloop.stock_ledger_entries
    WHERE direction = 'O'
      AND (:cid IS NULL OR company_id = CAST(:cid AS UUID))
    ORDER BY entry_date, id
"""


async def run(company_id: str | None, apply: bool, reason: str) -> int:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as db:
        avg_res = await db.execute(text(AVERAGE_SQL), {"cid": company_id})
        averages: dict[str, Decimal] = {}
        for row in avg_res.mappings().all():
            qty = to_decimal(row["total_qty"])
            if qty > 0:
                averages[str(row["material_id"])] = to_decimal(row["total_amount"]) / qty

        out_res = await db.execute(text(OUTWARD_SQL), {"cid": company_id})
        rows = out_res.mappings().all()

        changes = []
        uncostable = []
        for row in rows:
            mat = str(row["material_id"])
            rate = averages.get(mat)
            if rate is None or rate <= 0:
                uncostable.append(row)
                continue
            new_amount = round_money(to_decimal(row["quantity"]) * rate)
            old_amount = to_decimal(row["amount"])
            if new_amount != old_amount:
                changes.append((row, old_amount, new_amount))

        print(f"outward rows examined : {len(rows)}")
        print(f"rows needing restatement: {len(changes)}")
        print(f"rows with no cost basis : {len(uncostable)}")
        print()

        if changes:
            delta = sum((new - old for _, old, new in changes), Decimal("0"))
            print(f"{'entry':>10}  {'document':<20} {'old':>14} {'new':>14} {'delta':>14}")
            for row, old, new in changes[:25]:
                print(
                    f"{row['id']:>10}  {str(row['source_document_no'] or ''):<20} "
                    f"{old:>14} {new:>14} {new - old:>14}"
                )
            if len(changes) > 25:
                print(f"... and {len(changes) - 25} more")
            print()
            print(f"net change to outward stock value: {delta}")

        if uncostable:
            print()
            print("No inward history, so no cost basis. These are NOT guessed at:")
            for row in uncostable[:15]:
                print(f"  entry {row['id']} material {row['material_id']} "
                      f"doc {row['source_document_no']}")
            if len(uncostable) > 15:
                print(f"  ... and {len(uncostable) - 15} more")

        if not apply:
            print()
            print("DRY RUN. Nothing was written. Re-run with --apply to commit.")
            return 0

        if not changes:
            print("Nothing to write.")
            return 0

        await set_audit_context(db, None, None, None, reason)
        for row, _old, new in changes:
            await db.execute(
                text(
                    "UPDATE caratloop.stock_ledger_entries "
                    "SET amount = :amt WHERE id = :id"
                ),
                {"amt": new, "id": row["id"]},
            )
        await db.commit()
        print()
        print(f"Restated {len(changes)} row(s). Every UPDATE is in the audit log.")
        return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--company", default=None, help="Restrict to one company UUID.")
    ap.add_argument("--apply", action="store_true", help="Write changes (default: dry run).")
    ap.add_argument(
        "--reason",
        default="Restate outward stock value from selling price to weighted average cost",
        help="Recorded in the audit trail.",
    )
    args = ap.parse_args()
    return asyncio.run(run(args.company, args.apply, args.reason))


if __name__ == "__main__":
    raise SystemExit(main())
