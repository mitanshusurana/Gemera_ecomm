"""
Caratloop ERP — API Router v1
"""
from fastapi import APIRouter
from app.api.v1 import auth, inventory, production, sales, gst, accounting, reports
from app.api.v1 import parties, ledger, vouchers, banking, books, purchases
from app.api.v1 import job_work
from app.api.v1 import approval_memos
from app.api.v1 import integrations

api_router = APIRouter()

api_router.include_router(auth.router,        prefix="",           tags=["Authentication"])
api_router.include_router(inventory.router,   prefix="/inventory", tags=["Inventory [CGST-R56-2]"])
api_router.include_router(production.router,  prefix="",           tags=["Manufacturing [CGST-R56-12]"])
api_router.include_router(sales.router,       prefix="/sales",     tags=["Sales [CGST-R56-4]"])
api_router.include_router(gst.router,         prefix="/gst",       tags=["GST Compliance [CGST-R56-4]"])
api_router.include_router(accounting.router,  prefix="/accounting",tags=["Accounting [S44AA]"])
api_router.include_router(reports.router,     prefix="/reports",   tags=["Reports & Compliance"])
api_router.include_router(parties.router,     prefix="/parties",   tags=["Party Master"])
api_router.include_router(ledger.router,      prefix="/ledger",    tags=["Ledger & Outstanding"])
api_router.include_router(vouchers.router,    prefix="/vouchers",  tags=["Vouchers"])
api_router.include_router(banking.router,     prefix="/banking",   tags=["Banking & BRS"])
api_router.include_router(books.router,       prefix="/books",     tags=["Books of Accounts"])
api_router.include_router(purchases.router,   prefix="/purchases", tags=["Purchases"])
api_router.include_router(job_work.router,    prefix="",           tags=["Job Work [CGST s.143]"])
api_router.include_router(integrations.router, prefix="/integrations", tags=["Integrations"])
api_router.include_router(approval_memos.router, prefix="", tags=["Approval Memos (Jangad)"])
from app.api.v1 import einvoice  # noqa: E402  (kept beside its include so the two land together)
api_router.include_router(einvoice.router,   prefix="/gst",       tags=["e-Invoice & e-Way Bill [Rule 48(4), Rule 138]"])
from app.api.v1 import users  # noqa: E402  (user management; owner/admin only)
api_router.include_router(users.router,       prefix="",           tags=["Users"])
from app.api.v1 import fiscal_years, gstr2b  # noqa: E402  (period lock / year-end; GSTR-2B under /gst)
api_router.include_router(fiscal_years.router, prefix="/fiscal-years", tags=["Fiscal Years"])
api_router.include_router(gstr2b.router,      prefix="/gst",       tags=["GSTR-2B Reconciliation [s.16(2)(aa)]"])
from app.api.v1 import lots, locations  # noqa: E402  (gemstone lots; stock locations and transfers)
api_router.include_router(lots.router,        prefix="/lots",      tags=["Gemstone Lots [CGST-R56-2]"])
api_router.include_router(locations.router,   prefix="/stock-locations", tags=["Stock Locations & Transfers [CGST-R56-2]"])
