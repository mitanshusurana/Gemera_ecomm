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
    DATABASE_URL: str = "postgresql+asyncpg://caratloop:naitiK%4023@localhost:5433/caratloop_erp"
    SYNC_DATABASE_URL: str = "postgresql://caratloop:naitiK%4023@localhost:5433/caratloop_erp"

    # ─── Security ───────────────────────────────────────────────
    JWT_SECRET: str = "changeme_in_production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480  # 8 hours

    # ─── Admin Bootstrap ────────────────────────────────────────
    ADMIN_EMAIL: str = "admin@caratloop.com"
    ADMIN_PASSWORD: str = "changeme"

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
    CORS_ORIGINS: List[str] = ["http://localhost:3001", "http://localhost:3000", "http://127.0.0.1:3001", "http://127.0.0.1:3000", "*"]

    # ─── Environment ────────────────────────────────────────────
    ENVIRONMENT: str = "development"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


settings = Settings()
