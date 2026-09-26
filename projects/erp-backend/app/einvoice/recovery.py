"""Generate an IRN, and recover the existing one when the IRP says it already has it.

The IRP registers a document once. A retry after a timeout, a second click,
or a re-run after the database write failed all come back as NIC error 2150
("IRN already generated"), which is not a failure of the document: the IRN
exists, this ledger simply never stored it. ``generate_or_recover`` turns
that refusal into a lookup by document details and hands back the IRN as if
the generate had succeeded, together with a record of both calls so the
endpoint can log each one in ``einvoice_log``.

Pure with respect to the database: it needs only a provider and the payload.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.einvoice.provider import IrnResult, ProviderError, is_duplicate_irn_error

ACTION_GENERATE = "Generate_IRN"
ACTION_GET_BY_DOC = "Get_IRN_By_Doc"


@dataclass(frozen=True)
class ProviderCall:
    """One exchange with the provider, in the shape einvoice_log stores."""

    action: str
    request: Any
    response: Any
    status: str                      # 'Success' | 'Failed'
    error: Optional[str] = None


@dataclass
class GenerateOutcome:
    result: IrnResult
    recovered: bool
    calls: list[ProviderCall] = field(default_factory=list)


def doc_details(payload: dict) -> tuple[str, str, str]:
    doc = payload.get("DocDtls") or {}
    return str(doc.get("Typ") or ""), str(doc.get("No") or ""), str(doc.get("Dt") or "")


def result_record(result: IrnResult, *, recovered: bool = False) -> dict:
    """What a success log row carries; ``recovered`` marks an IRN fetched
    rather than issued, which the screens show as "Recovered from IRP"."""
    return {
        "irn": result.irn,
        "ack_no": result.ack_no,
        "ack_date": result.ack_date,
        "status": result.status,
        "recovered": recovered,
        "raw": result.raw,
    }


async def generate_or_recover(provider, payload: dict) -> GenerateOutcome:
    """Register ``payload``; on 2150, fetch the IRN the IRP already holds.

    Raises the original ProviderError when the refusal is anything else, and
    the lookup's ProviderError when the recovery itself fails; in both cases
    ``calls`` on the exception (attribute ``provider_calls``) lists what was
    exchanged so the caller can still log it.
    """
    calls: list[ProviderCall] = []
    try:
        result = await provider.generate_irn(payload)
    except ProviderError as exc:
        calls.append(ProviderCall(ACTION_GENERATE, payload, exc.details, "Failed", exc.message))
        if not is_duplicate_irn_error(exc):
            exc.provider_calls = calls
            raise
        doc_type, doc_no, doc_date = doc_details(payload)
        lookup = {"doctype": doc_type, "docnum": doc_no, "docdate": doc_date}
        try:
            result = await provider.get_irn_by_doc(doc_type, doc_no, doc_date)
        except ProviderError as inner:
            calls.append(ProviderCall(ACTION_GET_BY_DOC, lookup, inner.details, "Failed", inner.message))
            inner.provider_calls = calls
            raise
        if not result.irn:
            failure = ProviderError(
                "The IRP reports an existing IRN for this document but did not return it; "
                "look it up on the provider portal and record it by hand.",
                code=exc.code, details=result.raw,
            )
            calls.append(ProviderCall(ACTION_GET_BY_DOC, lookup, result.raw, "Failed", failure.message))
            failure.provider_calls = calls
            raise failure
        calls.append(ProviderCall(ACTION_GET_BY_DOC, lookup, result_record(result, recovered=True), "Success"))
        return GenerateOutcome(result=result, recovered=True, calls=calls)
    calls.append(ProviderCall(ACTION_GENERATE, payload, result_record(result), "Success"))
    return GenerateOutcome(result=result, recovered=False, calls=calls)
