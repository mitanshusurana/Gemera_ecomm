from sqlalchemy import Column, String, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, BIGINT
from app.models.base import Base

class Material(Base):
    __tablename__ = "materials"
    __table_args__ = {"schema": "caratloop"}
    id = Column(UUID(as_uuid=True), primary_key=True)
    code = Column(String)
    name = Column(String)

class StockLedgerEntry(Base):
    __tablename__ = "stock_ledger_entries"
    __table_args__ = {"schema": "caratloop"}
    id = Column(BIGINT, primary_key=True)
    # NO DELETE methods [MCA-11g]
