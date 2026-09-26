"""The NIC Invoice Registration Portal flow, as GSPs expose it, over httpx.

What is documented and implemented here
---------------------------------------
The IRP publishes a small set of JSON endpoints (sandbox: einv-apisandbox.nic.in):

    POST {base}/eivital/{version}/auth              authentication
    POST {base}/eicore/{version}/Invoice            generate IRN (schema 1.1 body)
    POST {base}/eicore/{version}/Invoice/Cancel     cancel IRN {Irn, CnlRsn, CnlRem}
    GET  {base}/eicore/{version}/Invoice/irnbydocdetails?doctype=&docnum=&docdate=
                                                    the IRN already issued for a document
    POST {base}/eiewb/{version}/ewaybill            e-way bill by IRN {Irn, Distance, Trans*, Veh*}
    POST {base}/eiewb/{version}/ewayapi/canewb      cancel e-way bill {ewbNo, cancelRsnCode, cancelRmrk}

Every response is an envelope: ``{"Status": 1|0, "Data": ..., "ErrorDetails":
[{"ErrorCode", "ErrorMessage"}], "InfoDtls": ...}``. GSPs that front the IRP
(MasterGST, WhiteBooks, ClearTax, Cygnet, ...) keep those paths and bodies
but differ in two places, and those two places are hooks here rather than
guesses:

1. **Transport of credentials.** NIC's own auth API wants the credentials
   RSA-encrypted with its public key inside ``Data``, and every later call
   wants ``Data`` AES-encrypted with the session key (Sek) it returned. A GSP
   does that encryption for you and takes the credentials as plain headers,
   which is the default here: ``client_id``, ``client_secret``, ``user_name``,
   ``password``, ``gstin`` on the auth call and ``client_id``,
   ``client_secret``, ``gstin``, ``user_name``, ``AuthToken`` on the rest.
   Header names are configurable (``NicConfig.header_names``), and a GSP
   that wants a JSON auth body instead can pass ``auth_body``.

2. **Encoding of the request/response payload.** By default the invoice JSON
   is sent as the request body and ``Data`` is read back as JSON (a dict, or
   a JSON string). If your GSP wants the schema JSON wrapped, base64'd or
   encrypted, pass ``encode_request`` / ``decode_data``; both receive the
   provider so they can reach the session key.

Talking to the IRP directly (no GSP) needs the RSA/AES layer, which is not
implemented: the hooks are where it plugs in, and nothing here pretends to do
it. ``NicConfig.paths`` and ``version`` are configurable because GSPs pin
different API versions (v1.03 / v1.04).

Not implemented: Get IRN details by IRN, Get e-way bill details, IRN
generation with e-way bill in one call. When the IRP answers 2150 (duplicate
IRN) the endpoint fetches the existing IRN with ``get_irn_by_doc`` (document
type, number and date as dd/mm/yyyy) and records it; the refusal itself is
surfaced with the IRP's InfoDtls in the log.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional

import httpx

from app.einvoice.provider import (
    CancelResult,
    EwbCancelResult,
    EwbResult,
    IrnResult,
    ProviderError,
    TransportDetails,
)

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))

DEFAULT_PATHS = {
    "auth": "/eivital/{version}/auth",
    "generate_irn": "/eicore/{version}/Invoice",
    "cancel_irn": "/eicore/{version}/Invoice/Cancel",
    "irn_by_doc": "/eicore/{version}/Invoice/irnbydocdetails",
    "ewb_by_irn": "/eiewb/{version}/ewaybill",
    "cancel_ewb": "/eiewb/{version}/ewayapi/canewb",
}

DEFAULT_HEADER_NAMES = {
    "client_id": "client_id",
    "client_secret": "client_secret",
    "gstin": "gstin",
    "username": "user_name",
    "password": "password",
    "auth_token": "AuthToken",
}


@dataclass
class NicConfig:
    base_url: str
    client_id: str
    client_secret: str
    username: str
    password: str
    gstin: str
    version: str = "v1.03"
    paths: dict = field(default_factory=lambda: dict(DEFAULT_PATHS))
    header_names: dict = field(default_factory=lambda: dict(DEFAULT_HEADER_NAMES))
    # Sent as the JSON body of the auth call. Empty = credentials in headers
    # only, which is what most GSP gateways expect.
    auth_body: Optional[dict] = None
    timeout_seconds: float = 30.0
    # Refresh the token this long before the GSP says it expires.
    token_slack_seconds: int = 120

    def url(self, key: str) -> str:
        base = self.base_url.rstrip("/")
        path = self.paths[key].format(version=self.version)
        return f"{base}{path}"

    def missing(self) -> list[str]:
        out = []
        for name in ("base_url", "client_id", "client_secret", "username", "password", "gstin"):
            if not getattr(self, name):
                out.append(f"EINVOICE_{name.upper()}")
        return out


EncodeHook = Callable[[dict, "NicProvider"], Any]
DecodeHook = Callable[[Any, "NicProvider"], dict]
ClientFactory = Callable[[], httpx.AsyncClient]


class NicProvider:
    name = "nic"

    def __init__(
        self,
        config: NicConfig,
        *,
        encode_request: Optional[EncodeHook] = None,
        decode_data: Optional[DecodeHook] = None,
        client_factory: Optional[ClientFactory] = None,
    ):
        self.config = config
        self._encode = encode_request or (lambda payload, _p: payload)
        self._decode = decode_data or _default_decode
        self._client_factory = client_factory or (
            lambda: httpx.AsyncClient(timeout=config.timeout_seconds)
        )
        self.auth_token: Optional[str] = None
        self.session_key: Optional[str] = None   # Sek, for GSPs that return it
        self.token_expiry: Optional[datetime] = None

    # ─── Authentication ──────────────────────────────────────────────────

    def _credential_headers(self) -> dict:
        h = self.config.header_names
        return {
            h["client_id"]: self.config.client_id,
            h["client_secret"]: self.config.client_secret,
            h["gstin"]: self.config.gstin,
            h["username"]: self.config.username,
        }

    def token_valid(self, now: Optional[datetime] = None) -> bool:
        if not self.auth_token or not self.token_expiry:
            return False
        now = now or datetime.now(IST)
        return now + timedelta(seconds=self.config.token_slack_seconds) < self.token_expiry

    async def authenticate(self) -> None:
        missing = self.config.missing()
        if missing:
            raise ProviderError("e-Invoice provider is not configured: set " + ", ".join(missing))
        headers = self._credential_headers()
        headers[self.config.header_names["password"]] = self.config.password
        headers["Content-Type"] = "application/json"
        body = self.config.auth_body if self.config.auth_body is not None else {}

        async with self._client_factory() as client:
            resp = await client.post(self.config.url("auth"), headers=headers, json=body)
        ok, data, errors = _envelope(_json_or_error(resp))
        if not ok:
            raise ProviderError("e-Invoice authentication failed", code=_first_code(errors), details=errors)
        data = self._decode(data, self)
        token = data.get("AuthToken") or data.get("authToken") or data.get("auth_token")
        if not token:
            raise ProviderError("e-Invoice authentication returned no token", details=data)
        self.auth_token = str(token)
        self.session_key = data.get("Sek") or data.get("sek")
        self.token_expiry = _parse_expiry(data.get("TokenExpiry") or data.get("tokenExpiry") or data.get("expiry"))

    async def _ensure_token(self) -> None:
        if not self.token_valid():
            await self.authenticate()

    def _call_headers(self) -> dict:
        headers = self._credential_headers()
        headers[self.config.header_names["auth_token"]] = self.auth_token or ""
        headers["Content-Type"] = "application/json"
        return headers

    async def _post(self, key: str, payload: dict) -> dict:
        body = self._encode(payload, self)
        return await self._call("POST", key, json=body)

    async def _get(self, key: str, params: dict) -> dict:
        return await self._call("GET", key, params=params)

    async def _call(self, method: str, key: str, **request) -> dict:
        await self._ensure_token()

        async def send() -> httpx.Response:
            async with self._client_factory() as client:
                return await client.request(method, self.config.url(key), headers=self._call_headers(), **request)

        resp = await send()
        raw = _json_or_error(resp)
        ok, data, errors = _envelope(raw)
        if not ok:
            code = _first_code(errors)
            # 1005 / 1006 / 1007: token invalid or expired. Re-authenticate once.
            if code in {"1005", "1006", "1007"} and self.auth_token:
                self.auth_token = None
                await self._ensure_token()
                resp = await send()
                raw = _json_or_error(resp)
                ok, data, errors = _envelope(raw)
            if not ok:
                message = "; ".join(
                    f"{e.get('ErrorCode', '')}: {e.get('ErrorMessage', '')}".strip(": ") for e in errors
                ) or "e-Invoice provider refused the request"
                raise ProviderError(message, code=_first_code(errors), details={"errors": errors, "info": raw.get("InfoDtls")})
        decoded = self._decode(data, self)
        decoded["_raw"] = raw
        return decoded

    # ─── Operations ──────────────────────────────────────────────────────

    async def generate_irn(self, payload: dict) -> IrnResult:
        data = await self._post("generate_irn", payload)
        return IrnResult(
            irn=str(data.get("Irn") or ""),
            ack_no=str(data.get("AckNo") or ""),
            ack_date=_parse_dt(data.get("AckDt")) or datetime.now(IST),
            signed_qr=str(data.get("SignedQRCode") or ""),
            signed_invoice=data.get("SignedInvoice"),
            status=str(data.get("Status") or "ACT"),
            raw=data.get("_raw", {}),
        )

    async def get_irn_by_doc(self, doc_type: str, doc_no: str, doc_date: str) -> IrnResult:
        """GET Invoice/irnbydocdetails: the IRN the IRP holds for a document.

        ``doc_date`` is dd/mm/yyyy, as DocDtls.Dt was sent. The answer has
        the same shape as a generate (Irn, AckNo, AckDt, SignedQRCode,
        SignedInvoice, Status), so it is stored the same way.
        """
        data = await self._get(
            "irn_by_doc",
            {"doctype": str(doc_type).strip().upper(), "docnum": str(doc_no).strip(), "docdate": str(doc_date).strip()},
        )
        return IrnResult(
            irn=str(data.get("Irn") or ""),
            ack_no=str(data.get("AckNo") or ""),
            ack_date=_parse_dt(data.get("AckDt")) or datetime.now(IST),
            signed_qr=str(data.get("SignedQRCode") or ""),
            signed_invoice=data.get("SignedInvoice"),
            status=str(data.get("Status") or "ACT"),
            raw=data.get("_raw", {}),
        )

    async def cancel_irn(self, irn: str, reason_code: str, remarks: str) -> CancelResult:
        data = await self._post("cancel_irn", {"Irn": irn, "CnlRsn": str(reason_code), "CnlRem": remarks[:100]})
        return CancelResult(
            irn=str(data.get("Irn") or irn),
            cancel_date=_parse_dt(data.get("CancelDate")) or datetime.now(IST),
            raw=data.get("_raw", {}),
        )

    async def generate_ewaybill_by_irn(self, irn: str, transport: TransportDetails) -> EwbResult:
        data = await self._post("ewb_by_irn", {"Irn": irn, **transport.to_nic()})
        return EwbResult(
            ewb_no=str(data.get("EwbNo") or data.get("ewayBillNo") or ""),
            ewb_date=_parse_dt(data.get("EwbDt") or data.get("ewayBillDate")) or datetime.now(IST),
            valid_upto=_parse_dt(data.get("EwbValidTill") or data.get("validUpto")),
            raw=data.get("_raw", {}),
        )

    async def cancel_ewaybill(self, ewb_no: str, reason: str) -> EwbCancelResult:
        data = await self._post("cancel_ewb", {"ewbNo": int(ewb_no), "cancelRsnCode": int(reason or 2), "cancelRmrk": "Cancelled from ERP"})
        return EwbCancelResult(
            ewb_no=str(data.get("ewayBillNo") or ewb_no),
            cancel_date=_parse_dt(data.get("cancelDate")) or datetime.now(IST),
            raw=data.get("_raw", {}),
        )


# ─── Envelope helpers ────────────────────────────────────────────────────


def _json_or_error(resp: httpx.Response) -> dict:
    try:
        body = resp.json()
    except ValueError:
        raise ProviderError(
            f"e-Invoice provider answered HTTP {resp.status_code} with a non-JSON body",
            code=str(resp.status_code),
            details=resp.text[:1000],
        )
    if resp.status_code >= 500:
        raise ProviderError(
            f"e-Invoice provider answered HTTP {resp.status_code}",
            code=str(resp.status_code),
            details=body,
        )
    if not isinstance(body, dict):
        raise ProviderError("e-Invoice provider answered with an unexpected body", details=body)
    return body


def _envelope(body: dict) -> tuple[bool, Any, list[dict]]:
    """(ok, data, errors) from either the NIC or the GSP-flavoured envelope."""
    status = body.get("Status", body.get("status_cd", body.get("status")))
    ok = str(status) in {"1", "True", "true", "success", "Success"}
    data = body.get("Data", body.get("data"))
    errors: list[dict] = []
    raw_err = body.get("ErrorDetails") or body.get("error") or body.get("errors")
    if isinstance(raw_err, list):
        errors = [e if isinstance(e, dict) else {"ErrorMessage": str(e)} for e in raw_err]
    elif isinstance(raw_err, dict):
        errors = [raw_err]
    elif isinstance(raw_err, str) and raw_err:
        errors = [{"ErrorMessage": raw_err}]
    if not ok and not errors:
        errors = [{"ErrorMessage": body.get("message") or body.get("error_desc") or "request refused"}]
    return ok, data, errors


def _first_code(errors: list[dict]) -> Optional[str]:
    for e in errors:
        code = e.get("ErrorCode") or e.get("error_cd") or e.get("code")
        if code:
            return str(code)
    return None


def _default_decode(data: Any, _provider: "NicProvider") -> dict:
    """Plain JSON: a dict, or a JSON string. Encrypted Data needs a hook."""
    if data is None:
        return {}
    if isinstance(data, dict):
        return dict(data)
    if isinstance(data, str):
        try:
            parsed = json.loads(data)
        except ValueError:
            raise ProviderError(
                "e-Invoice response Data is not JSON; if your GSP encrypts it, pass a decode_data hook",
                details=data[:200],
            )
        if isinstance(parsed, dict):
            return parsed
    raise ProviderError("e-Invoice response Data has an unexpected shape", details=str(data)[:200])


_DT_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %I:%M:%S %p",
    "%d/%m/%Y",
    "%Y-%m-%d",
)


def _parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=IST)
    text = str(value).strip()
    for fmt in _DT_FORMATS:
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=IST)
        except ValueError:
            continue
    logger.warning("Unrecognised IRP timestamp %r", value)
    return None


def _parse_expiry(value) -> datetime:
    """TokenExpiry as the GSP gives it, or six hours from now (NIC's default)."""
    dt = _parse_dt(value)
    if dt:
        return dt
    if isinstance(value, (int, float)) and value > 0:
        return datetime.now(IST) + timedelta(seconds=int(value))
    return datetime.now(IST) + timedelta(hours=6)
