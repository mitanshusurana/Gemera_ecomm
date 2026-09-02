"""
Caratloop ERP — API Router v1
"""
from fastapi import APIRouter
from app.api.v1 import auth, inventory, production, sales, gst, accounting, reports
from app.api.v1 import parties, ledger, vouchers, banking, books, purchases
from app.api.v1 import job_work

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
