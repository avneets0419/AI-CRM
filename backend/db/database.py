from sqlalchemy import create_engine, Column, String, Float, JSON, DateTime, Text, Boolean
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from datetime import datetime, timezone
import uuid

DATABASE_URL = "sqlite:///./crm.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class Lead(Base):
    __tablename__ = "leads"

    id               = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name             = Column(String)
    company          = Column(String)
    source           = Column(String)
    utm_campaign     = Column(String)
    pages_viewed     = Column(JSON)
    form_data        = Column(JSON)
    score            = Column(String, nullable=True)
    confidence       = Column(Float, nullable=True)
    score_reasoning  = Column(Text, nullable=True)
    next_action      = Column(String, nullable=True)
    action_reasoning = Column(Text, nullable=True)
    draft_subject    = Column(Text, nullable=True)
    draft_body       = Column(Text, nullable=True)
    explanation      = Column(Text, nullable=True)
    status           = Column(String, default="processing")
    human_edit       = Column(Text, nullable=True)
    auto_approved    = Column(Boolean, default=False)
    current_node     = Column(String, nullable=True)
    error_message    = Column(Text, nullable=True)
    thread_id        = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    resolved_at = Column(DateTime, nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    lead_id     = Column(String)
    lead_name   = Column(String)
    company     = Column(String)
    event_type  = Column(String)
    detail      = Column(Text, nullable=True)
    actor       = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))



def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
