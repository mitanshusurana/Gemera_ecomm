"""
Caratloop ERP — Application Configuration
Reads from .env file (pydantic-settings)
"""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyUrl


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ─── Database ───────────────────────────────────────────────
    # No credential defaults. Both must be supplied by the environment.
    DATABASE_URL: str = ""
    SYNC_DATABASE_URL: str = ""

    # ─── Security ───────────────────────────────────────────────
    # No default. A missing/weak value is rejected at startup (see below).
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480  # 8 hours

    # ─── Admin Bootstrap ────────────────────────────────────────
    ADMIN_EMAIL: str = "admin@caratloop.com"
    ADMIN_PASSWORD: str = ""

    # ─── Cloudflare R2 (Invoice PDF Storage) ────────────────────
    R2_ACCESS_KEY: str = ""
    R2_SECRET_KEY: str = ""
    R2_ENDPOINT: str = ""
    R2_BUCKET_NAME: str = ""
    R2_PUBLIC_URL: str = ""

    # ─── Company / Compliance ───────────────────────────────────
    # Rajasthan state code for GST (08 = Rajasthan)
    COMPANY_STATE_CODE: str = "08"
    COMPANY_STATE_NAME: str = "Rajasthan"

    # [CGST-R56-4] Default GST rates for jewelry sector
    GST_RATE_MATERIAL: float = 3.00   # 3% on gold/gem material value (HSN 7113)
    GST_RATE_MAKING: float = 5.00     # 5% on making charges / job work (SAC 9988)
    GST_RATE_RCM: float = 3.00        # 3% RCM on old gold (Notif 13/2017-CT(Rate))

    # ─── E-commerce bridge ──────────────────────────────────────
    # The storefront API (Spring Boot, ../../backend) posts every paid web
    # order here as a sales invoice and every refund as a credit note,
    # authenticated by this shared key in the X-Api-Key header. Empty
    # disables the endpoints (503).
    ECOMMERCE_API_KEY: str = ""
    # Ledger account credited with online settlements (the receipt voucher's
    # bank side). Razorpay pays out to the current account, so the bank code.
    ECOMMERCE_SETTLEMENT_ACCOUNT_CODE: str = "BNK-001"
    # Company the bridge posts into. Empty = the single active company; the
    # bridge refuses to guess when there is more than one.
    ECOMMERCE_COMPANY_ID: str = ""
    # Item-master codes old metal bought through the exchange programme is
    # booked into; created on first use when absent.
    ECOMMERCE_OLD_GOLD_MATERIAL_CODE: str = "OLD-GOLD"
    ECOMMERCE_OLD_SILVER_MATERIAL_CODE: str = "OLD-SILVER"

    # ─── e-Invoice (IRN) and e-Way Bill through a GSP ─────────────
    # disabled: the endpoints answer 503. fake: deterministic IRNs for tests
    # and the sandbox. nic: the NIC IRP / GSP REST flow in app/einvoice.
    EINVOICE_PROVIDER: str = "disabled"
    EINVOICE_BASE_URL: str = ""
    EINVOICE_CLIENT_ID: str = ""
    EINVOICE_CLIENT_SECRET: str = ""
    EINVOICE_USERNAME: str = ""
    EINVOICE_PASSWORD: str = ""
    EINVOICE_GSTIN: str = ""
    # Invoice value below which an IRN is not requested. 0 = every B2B
    # invoice (the e-invoicing mandate is by the seller's turnover, not by
    # the invoice value, so the default is to e-invoice everything B2B).
    EINVOICE_THRESHOLD_INR: float = 0

    # ─── TDS s.194Q on purchases, TCS s.206C(1H) on sales ─────────
    # Both apply only once the deductor/collector crossed Rs 10 crore
    # turnover in the preceding year, so both are off until the business
    # says otherwise. Threshold is per supplier/customer per financial year.
    TDS_194Q_ENABLED: bool = False
    TDS_194Q_THRESHOLD_INR: float = 5000000
    TDS_194Q_RATE: float = 0.10
    # s.206AA: no PAN on record, deduct at the higher rate.
    TDS_NO_PAN_RATE: float = 5.00
    TCS_206C1H_ENABLED: bool = False
    TCS_206C1H_THRESHOLD_INR: float = 5000000
    TCS_206C1H_RATE: float = 0.10

    # ─── CORS ───────────────────────────────────────────────────
    # Never include "*" here: the API is served with allow_credentials=True,
    # and a wildcard makes the browser reflect any origin back.
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]

    # ─── Environment ────────────────────────────────────────────
    ENVIRONMENT: str = "development"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    def validate_runtime(self) -> None:
        """Fail fast on unsafe configuration rather than booting insecurely.

        Previously a missing JWT_SECRET silently fell back to a hardcoded
        default and the service signed real tokens with a public value.
        """
        problems: List[str] = []

        if not self.DATABASE_URL:
            problems.append("DATABASE_URL is not set")

        weak = {"", "changeme", "changeme_in_production",
                "caratloop_jwt_secret_change_in_prod"}
        if self.JWT_SECRET in weak:
            problems.append("JWT_SECRET is unset or a known default")
        elif len(self.JWT_SECRET) < 32:
            problems.append("JWT_SECRET is shorter than 32 characters")

        if "*" in self.CORS_ORIGINS:
            problems.append('CORS_ORIGINS contains "*", which is unsafe with credentialed requests')

        if self.is_production and self.ADMIN_PASSWORD in {"", "changeme", "Admin@123"}:
            problems.append("ADMIN_PASSWORD is unset or a known default")

        if problems:
            raise RuntimeError(
                "Refusing to start due to unsafe configuration: "
                + "; ".join(problems)
            )


settings = Settings()
