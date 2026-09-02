from sqlalchemy import Column, String, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, BIGINT
from app.models.base import Base

class JournalEntry(Base):
    __tablename__ = "journal_entries"
    __table_args__ = {"schema": "caratloop"}
    id = Column(BIGINT, primary_key=True)
    # [MCA-11g] Append-only ledger
