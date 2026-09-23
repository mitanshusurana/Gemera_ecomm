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
