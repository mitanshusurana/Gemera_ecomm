"""e-Invoice (IRN) and e-Way Bill through a GSP.

Layout:

* ``schema``        builds and validates the NIC e-invoice JSON (schema 1.1)
                    from the invoice rows this ERP already stores. Pure.
* ``provider``      the ``Provider`` protocol and the result/error types.
* ``nic_provider``  the NIC IRP / GSP REST flow over httpx, with hooks for the
                    parts each GSP does differently.
* ``fake_provider`` deterministic IRNs for tests and the sandbox.

``get_provider()`` picks one from ``settings.EINVOICE_PROVIDER``.
"""

from __future__ import annotations

from app.core.config import settings
from app.einvoice.provider import Provider, ProviderDisabled

PROVIDER_DISABLED = "disabled"
PROVIDER_FAKE = "fake"
PROVIDER_NIC = "nic"


def get_provider() -> Provider:
    """The configured provider, or raise ProviderDisabled.

    Built per call rather than cached at import so tests can switch the
    setting, and so a misconfigured NIC provider fails on the request that
    needs it rather than at startup.
    """
    mode = (settings.EINVOICE_PROVIDER or PROVIDER_DISABLED).strip().lower()
    if mode == PROVIDER_FAKE:
        from app.einvoice.fake_provider import FakeProvider

        return FakeProvider()
    if mode == PROVIDER_NIC:
        from app.einvoice.nic_provider import NicConfig, NicProvider

        return NicProvider(
            NicConfig(
                base_url=settings.EINVOICE_BASE_URL,
                client_id=settings.EINVOICE_CLIENT_ID,
                client_secret=settings.EINVOICE_CLIENT_SECRET,
                username=settings.EINVOICE_USERNAME,
                password=settings.EINVOICE_PASSWORD,
                gstin=settings.EINVOICE_GSTIN,
            )
        )
    raise ProviderDisabled(
        "e-Invoicing is not configured. Set EINVOICE_PROVIDER to 'nic' with the "
        "GSP credentials, or 'fake' for the sandbox."
    )
