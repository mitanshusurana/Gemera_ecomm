from sqlalchemy import Column, String, Boolean
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base

class Company(Base):
    __tablename__ = "companies"
    __table_args__ = {"schema": "caratloop"}
    id = Column(UUID(as_uuid=True), primary_key=True, server_default="uuid_generate_v4()")
    name = Column(String)
    # Additional fields...
