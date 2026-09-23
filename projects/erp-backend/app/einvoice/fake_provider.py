"""A provider that never leaves the process.

Used by the tests and by ``EINVOICE_PROVIDER=fake`` (the sandbox): every call
succeeds, and every answer is a deterministic function of its input so a test
can assert on it and a demo shows the same IRN twice for the same invoice.

The IRN is the SHA-256 of the canonical payload, which is 64 hex characters --
the same length and alphabet as a real IRN. Acknowledgement numbers are the
first 15 digits of the same hash, and the "signed" QR is the plain JSON the
IRP would have put inside its JWS, so the printed QR scans to something
readable.
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


class FakeProvider:
    name = "fake"

    def __init__(self, now=None):
        self._now = now
        self.calls: list[tuple[str, dict]] = []

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
        return IrnResult(
            irn=irn,
            ack_no=ack_no,
            ack_date=ack_date,
            signed_qr=canonical(qr),
            signed_invoice=canonical({"data": payload, "irn": irn}),
            status="ACT",
            raw={"Status": 1, "Data": {"Irn": irn, "AckNo": ack_no}},
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
