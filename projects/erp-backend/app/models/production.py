from sqlalchemy import Column, String, Numeric, ForeignKey, Date
from sqlalchemy.dialects.postgresql import UUID, BIGINT
from app.models.base import Base

class ProductionOrder(Base):
    __tablename__ = "production_orders"
    __table_args__ = {"schema": "caratloop"}
    id = Column(UUID(as_uuid=True), primary_key=True)
    order_no = Column(String)

class ProductionConsumptionEntry(Base):
    __tablename__ = "production_consumption_entries"
    __table_args__ = {"schema": "caratloop"}
    id = Column(BIGINT, primary_key=True)

class ProductionOutputEntry(Base):
    __tablename__ = "production_output_entries"
    __table_args__ = {"schema": "caratloop"}
    id = Column(BIGINT, primary_key=True)
