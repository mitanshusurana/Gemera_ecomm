"""The non-secret view of the deployment configuration.

The owner asked where the GST state, the e-invoice provider and the bridge
settings come from, and the honest answer was "a file on the server". This
builds the page that shows them. Every secret is reduced to a boolean --
present or not -- in one place, here, so the API handler never names a
credential setting and a test can read the handler's source to prove it.

build_runtime_view() is pure: it takes the settings object and the two facts
that live in the database (the company's state and the resolved settlement
account) and returns a dict that is safe to serialise to any owner or admin.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional

# Settings whose VALUE must never leave the server, reduced to "is set".
# Any new credential belongs in this table, not in the view.
_PRESENCE: dict[str, tuple[str, ...]] = {
    "einvoice_client_credentials": ("EINVOICE_CLIENT_ID", "EINVOICE_CLIENT_SECRET"),
    "einvoice_user_credentials": ("EINVOICE_USERNAME", "EINVOICE_PASSWORD"),
    "ecommerce_api_key": ("ECOMMERCE_API_KEY",),
    "r2_storage": ("R2_ACCESS_KEY", "R2_SECRET_KEY"),
}


def secret_presence(settings: Any) -> dict[str, bool]:
    """True for each credential group whose every member is non-empty."""
    return {
        label: all(bool(str(getattr(settings, name, "") or "").strip()) for name in names)
        for label, names in _PRESENCE.items()
    }


def build_runtime_view(
    settings: Any,
    *,
    company_state_code: Optional[str],
    company_state_name: Optional[str],
    settlement_account: Optional[Mapping[str, Any]],
) -> dict[str, Any]:
    """Configuration as the settings screen shows it. No secret values."""
    present = secret_presence(settings)
    provider = (settings.EINVOICE_PROVIDER or "disabled").strip().lower()
    configured_state = (settings.COMPANY_STATE_CODE or "").strip().zfill(2) if settings.COMPANY_STATE_CODE else ""
    in_use = (company_state_code or "").strip().zfill(2) if company_state_code else configured_state

    settlement_code = (settings.ECOMMERCE_SETTLEMENT_ACCOUNT_CODE or "").strip()
    return {
        "environment": settings.ENVIRONMENT,
        "source": ".env.erp (read once at start-up; change the file and restart the API)",
        "seller_state": {
            # The row wins; the setting is only the fallback for a company
            # row without a state (see app.core.company.seller_state_code).
            "in_use": in_use,
            "in_use_name": company_state_name if company_state_code else settings.COMPANY_STATE_NAME,
            "from": "company" if company_state_code else "setting",
            "setting_default": configured_state,
            "setting_default_name": settings.COMPANY_STATE_NAME,
        },
        "gst_rates": {
            "material_pct": settings.GST_RATE_MATERIAL,
            "making_pct": settings.GST_RATE_MAKING,
            "rcm_pct": settings.GST_RATE_RCM,
        },
        "einvoice": {
            "provider": provider,
            "enabled": provider not in ("", "disabled"),
            "base_url_present": bool((settings.EINVOICE_BASE_URL or "").strip()),
            "client_credentials_present": present["einvoice_client_credentials"],
            "user_credentials_present": present["einvoice_user_credentials"],
            "gstin_present": bool((settings.EINVOICE_GSTIN or "").strip()),
            "threshold_inr": settings.EINVOICE_THRESHOLD_INR,
        },
        "tds_194q": {
            "enabled": bool(settings.TDS_194Q_ENABLED),
            "threshold_inr": settings.TDS_194Q_THRESHOLD_INR,
            "rate_pct": settings.TDS_194Q_RATE,
            "no_pan_rate_pct": settings.TDS_NO_PAN_RATE,
        },
        "tcs_206c1h": {
            "enabled": bool(settings.TCS_206C1H_ENABLED),
            "threshold_inr": settings.TCS_206C1H_THRESHOLD_INR,
            "rate_pct": settings.TCS_206C1H_RATE,
        },
        "ecommerce_bridge": {
            "enabled": present["ecommerce_api_key"],
            "settlement_account_code": settlement_code or None,
            # What the bridge will actually credit: the configured code when
            # it names an account, else the default bank account.
            "settlement_account": (
                {
                    "id": str(settlement_account["id"]),
                    "code": settlement_account.get("code"),
                    "name": settlement_account.get("name"),
                    "from": settlement_account.get("from", "setting"),
                }
                if settlement_account else None
            ),
            "company_id_pinned": bool((settings.ECOMMERCE_COMPANY_ID or "").strip()),
            "old_gold_material_code": settings.ECOMMERCE_OLD_GOLD_MATERIAL_CODE,
            "old_silver_material_code": settings.ECOMMERCE_OLD_SILVER_MATERIAL_CODE,
        },
        "document_storage": {
            "r2_configured": present["r2_storage"] and bool((settings.R2_BUCKET_NAME or "").strip()),
            "bucket_present": bool((settings.R2_BUCKET_NAME or "").strip()),
        },
        "sessions": {
            "jwt_expire_minutes": settings.JWT_EXPIRE_MINUTES,
        },
        "cors_origins": list(settings.CORS_ORIGINS),
    }


__all__ = ["build_runtime_view", "secret_presence"]
