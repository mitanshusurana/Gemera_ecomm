from sqlalchemy.ext.asyncio import AsyncSession
from app.tax.gst_engine import calculate_jewelry_gst
from app.core.audit import audit_context

async def create_sales_invoice(db: AsyncSession, data: dict, user_id: str, ip: str):
    async with audit_context(db, user_id, "sess", ip, "Sales Invoice"):
        # 1. Call gst_engine
        gst = calculate_jewelry_gst(data['material_value'], data['making_charges'], '08', data['buyer_state'])
        # 2. Generate invoice number sequence CL/FY/XXXXX
        # 3. Post stock outward entries
        # 4. Post accounting journal entry
        # 5. Post to gst_output_tax_register
        pass
