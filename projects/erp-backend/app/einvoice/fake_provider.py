"""A provider that never leaves the process.

Used by the tests and by ``EINVOICE_PROVIDER=fake`` (the sandbox): every call
succeeds, and every answer is a deterministic function of its input so a test
can assert on it and a demo shows the same IRN twice for the same invoice.

The IRN is the SHA-256 of the canonical payload, which is 64 hex characters --
the same length and alphabet as a real IRN. Acknowledgement numbers are the
first 15 digits of the same hash, and the "signed" QR is the plain JSON the
IRP would have put inside its JWS, so the printed QR scans to something
readable.

Like the IRP, the fake remembers what it has registered (per process, keyed
on document type, number and date) so ``get_irn_by_doc`` hands back the very
IrnResult a ``generate_irn`` produced earlier. For a document it never saw it
answers with the IRN it would issue for the bare document details, which is
still deterministic, so a sandbox run and a test agree.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

from app.einvoice.provider import (
    CancelResult,
    EwbCancelResult,
    EwbResult,
    IrnResult,
    ProviderError,
    TransportDetails,
)

IST = timezone(timedelta(hours=5, minutes=30))


def canonical(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def deterministic_irn(payload: dict) -> str:
    return hashlib.sha256(canonical(payload).encode("utf-8")).hexdigest()


def doc_key(doc_type: str, doc_no: str, doc_date: str) -> tuple[str, str, str]:
    return (str(doc_type or "").strip().upper(), str(doc_no or "").strip(), str(doc_date or "").strip())


class FakeProvider:
    name = "fake"

    # What this process has registered: the IRP keeps the IRN for a document
    # and so does the fake. Shared across instances because get_provider()
    # builds a fresh one per request.
    _issued: dict[tuple[str, str, str], IrnResult] = {}

    def __init__(self, now=None):
        self._now = now
        self.calls: list[tuple[str, dict]] = []

    @classmethod
    def forget_all(cls) -> None:
        cls._issued.clear()

    def _clock(self) -> datetime:
        return self._now or datetime.now(IST).replace(microsecond=0)

    async def authenticate(self) -> None:
        self.calls.append(("authenticate", {}))

    async def generate_irn(self, payload: dict) -> IrnResult:
        self.calls.append(("generate_irn", payload))
        irn = deterministic_irn(payload)
        ack_no = str(int(irn[:12], 16))[:15].rjust(15, "1")
        ack_date = self._clock()
        doc = payload.get("DocDtls", {})
        qr = {
            "SellerGstin": payload.get("SellerDtls", {}).get("Gstin"),
            "BuyerGstin": payload.get("BuyerDtls", {}).get("Gstin"),
            "DocNo": doc.get("No"),
            "DocTyp": doc.get("Typ"),
            "DocDt": doc.get("Dt"),
            "TotInvVal": payload.get("ValDtls", {}).get("TotInvVal"),
            "ItemCnt": len(payload.get("ItemList", [])),
            "MainHsnCode": (payload.get("ItemList") or [{}])[0].get("HsnCd"),
            "Irn": irn,
            "IrnDt": ack_date.strftime("%Y-%m-%d %H:%M:%S"),
        }
        result = IrnResult(
            irn=irn,
            ack_no=ack_no,
            ack_date=ack_date,
            signed_qr=canonical(qr),
            signed_invoice=canonical({"data": payload, "irn": irn}),
            status="ACT",
            raw={"Status": 1, "Data": {"Irn": irn, "AckNo": ack_no}},
        )
        FakeProvider._issued[doc_key(doc.get("Typ"), doc.get("No"), doc.get("Dt"))] = result
        return result

    async def get_irn_by_doc(self, doc_type: str, doc_no: str, doc_date: str) -> IrnResult:
        """The IRN this fake issued for the document, or the one it would issue
        for the bare document details when it has not seen it."""
        key = doc_key(doc_type, doc_no, doc_date)
        self.calls.append(("get_irn_by_doc", {"doctype": key[0], "docnum": key[1], "docdate": key[2]}))
        known = FakeProvider._issued.get(key)
        if known is not None:
            return known
        payload = {"DocDtls": {"Typ": key[0], "No": key[1], "Dt": key[2]}}
        irn = deterministic_irn(payload)
        ack_no = str(int(irn[:12], 16))[:15].rjust(15, "1")
        ack_date = self._clock()
        qr = {"DocNo": key[1], "DocTyp": key[0], "DocDt": key[2], "Irn": irn,
              "IrnDt": ack_date.strftime("%Y-%m-%d %H:%M:%S")}
        return IrnResult(
            irn=irn, ack_no=ack_no, ack_date=ack_date,
            signed_qr=canonical(qr), signed_invoice=None, status="ACT",
            raw={"Status": 1, "Data": {"Irn": irn, "AckNo": ack_no, "Status": "ACT"}},
        )

    async def cancel_irn(self, irn: str, reason_code: str, remarks: str) -> CancelResult:
        self.calls.append(("cancel_irn", {"Irn": irn, "CnlRsn": reason_code, "CnlRem": remarks}))
        if len(irn) != 64:
            raise ProviderError("Invalid IRN", code="2150", details={"Irn": irn})
        return CancelResult(irn=irn, cancel_date=self._clock(), raw={"Status": 1})

    async def generate_ewaybill_by_irn(self, irn: str, transport: TransportDetails) -> EwbResult:
        body = {"Irn": irn, **transport.to_nic()}
        self.calls.append(("generate_ewaybill_by_irn", body))
        digest = hashlib.sha256(canonical(body).encode("utf-8")).hexdigest()
        ewb_no = str(int(digest[:10], 16))[:12].rjust(12, "3")
        now = self._clock()
        # Rule 138(10): one day per 200 km (or part), minimum one day.
        days = max(1, -(-int(transport.distance_km or 0) // 200))
        return EwbResult(ewb_no=ewb_no, ewb_date=now, valid_upto=now + timedelta(days=days), raw={"Status": 1})

    async def cancel_ewaybill(self, ewb_no: str, reason: str) -> EwbCancelResult:
        self.calls.append(("cancel_ewaybill", {"ewbNo": ewb_no, "cancelRsnCode": reason}))
        return EwbCancelResult(ewb_no=ewb_no, cancel_date=self._clock(), raw={"Status": 1})
