"""
Caratloop ERP — FastAPI Main Application
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from app.core.config import settings
from app.api.v1.router import api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("caratloop")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Refuse to serve on unsafe configuration (weak/absent JWT secret, CORS
    # wildcard, missing DATABASE_URL) rather than booting with defaults.
    settings.validate_runtime()
    logger.info(f"🪙 Caratloop ERP starting — State: {settings.COMPANY_STATE_NAME}")
    logger.info(f"📊 Database: {settings.DATABASE_URL.split('@')[-1]}")
    yield
    logger.info("Caratloop ERP shutting down.")


app = FastAPI(
    title="Caratloop ERP API",
    description="""
    **Caratloop ERP** — Gems & Jewelry Manufacturing ERP
    
    Compliance:
    - **MCA Rule 11(g)**: Non-disableable audit trail (Companies Audit Rules 2014)
    - **CGST Rule 56(2)**: Stock Register (Manufacturer)
    - **CGST Rule 56(4)**: Tax Register (ITC + RCM)
    - **CGST Rule 56(12)**: Monthly Production Account
    - **Section 44AA IT Act**: Double-entry mercantile accounting
    """,
    version="1.0.0",
    lifespan=lifespan,
    # Interactive API docs expose every endpoint, schema and parameter of the
    # GST/ledger surface. Disabled outside development.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

# CORS. allow_credentials=True means a wildcard origin would cause the browser
# to reflect any caller's Origin back, so the list is validated at startup to
# ensure it never contains "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in settings.CORS_ORIGINS if o != "*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

# Global exception handler
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "status": "error"},
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "status": "error"},
    )

# Mount API router
app.include_router(api_router, prefix="/api/v1")

@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint for Docker/load balancer."""
    return {
        "status": "healthy",
        "app": "Caratloop ERP",
        "version": "1.0.0",
        "compliance": ["MCA-11g", "CGST-R56", "S44AA"]
    }
