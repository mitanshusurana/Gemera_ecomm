from sqlalchemy import Column, String, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base

class SalesInvoice(Base):
    __tablename__ = "sales_invoices"
    __table_args__ = {"schema": "caratloop"}
    id = Column(UUID(as_uuid=True), primary_key=True)
    invoice_no = Column(String)
