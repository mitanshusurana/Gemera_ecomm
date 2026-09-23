from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, DateTime, text
from sqlalchemy.dialects.postgresql import UUID

class Base(DeclarativeBase):
    pass
