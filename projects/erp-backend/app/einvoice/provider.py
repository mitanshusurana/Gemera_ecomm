"""What every e-invoice provider must offer, and what it hands back.

The endpoints in app/api/v1/einvoice.py talk only to this protocol. The NIC
flow and the fake sandbox both implement it, so the endpoint code, the
database writes and the log rows are identical whichever is configured.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional, Protocol


class ProviderError(Exception):
    """The provider answered, and the answer was a refusal or a failure.

    ``details`` carries whatever the provider returned (NIC's ErrorDetails
    list, an HTTP body) so the log row and the API response can show it.
    """

    def __init__(self, message: str, *, code: Optional[str] = None, details: Any = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details


class ProviderDisabled(ProviderError):
    """No provider is configured (EINVOICE_PROVIDER=disabled)."""


@dataclass(frozen=True)
class IrnResult:
    irn: str
    ack_no: str
    ack_date: datetime
    signed_qr: str
    signed_invoice: Optional[str]
    status: str                 # NIC: 'ACT' active, 'CNL' cancelled
    raw: dict = field(default_factory=dict, repr=False)


@dataclass(frozen=True)
class CancelResult:
    irn: str
    cancel_date: datetime
    raw: dict = field(default_factory=dict, repr=False)


@dataclass(frozen=True)
class TransportDetails:
    """What the e-way bill needs beyond the invoice itself (Part A and B)."""

    transporter_id: Optional[str] = None      # TransId: transporter's GSTIN / enrolment id
    transporter_name: Optional[str] = None    # TransName
    transport_mode: Optional[str] = None      # TransMode: 1 road, 2 rail, 3 air, 4 ship
    vehicle_no: Optional[str] = None          # VehNo
    vehicle_type: Optional[str] = None        # VehType: R regular, O over-dimensional
    distance_km: int = 0                      # Distance (0 lets NIC compute from pincodes)
    document_no: Optional[str] = None         # TransDocNo: LR / RR / airway bill number
    document_date: Optional[str] = None       # TransDocDt: DD/MM/YYYY

    def to_nic(self) -> dict:
        body: dict[str, Any] = {"Distance": int(self.distance_km or 0)}
        if self.transporter_id:
            body["TransId"] = self.transporter_id
        if self.transporter_name:
            body["TransName"] = self.transporter_name
        if self.transport_mode:
            body["TransMode"] = str(self.transport_mode)
        if self.vehicle_no:
            body["VehNo"] = self.vehicle_no.replace(" ", "").upper()
        if self.vehicle_type:
            body["VehType"] = self.vehicle_type
        if self.document_no:
            body["TransDocNo"] = self.document_no
        if self.document_date:
            body["TransDocDt"] = self.document_date
        return body


@dataclass(frozen=True)
class EwbResult:
    ewb_no: str
    ewb_date: datetime
    valid_upto: Optional[datetime]
    raw: dict = field(default_factory=dict, repr=False)


@dataclass(frozen=True)
class EwbCancelResult:
    ewb_no: str
    cancel_date: datetime
    raw: dict = field(default_factory=dict, repr=False)


class Provider(Protocol):
    """The four things a GSP does for this ERP, plus authentication."""

    name: str

    async def authenticate(self) -> None: ...

    async def generate_irn(self, payload: dict) -> IrnResult: ...

    async def cancel_irn(self, irn: str, reason_code: str, remarks: str) -> CancelResult: ...

    async def generate_ewaybill_by_irn(self, irn: str, transport: TransportDetails) -> EwbResult: ...

    async def cancel_ewaybill(self, ewb_no: str, reason: str) -> EwbCancelResult: ...


# NIC cancellation reason codes for an IRN (schema 1.1, CnlRsn).
IRN_CANCEL_REASONS = {
    "1": "Duplicate",
    "2": "Data entry mistake",
    "3": "Order cancelled",
    "4": "Others",
}

# The IRP accepts a cancellation only within 24 hours of the acknowledgement.
IRN_CANCEL_WINDOW_HOURS = 24
