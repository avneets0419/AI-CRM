from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime


class LeadCreate(BaseModel):
    name: str
    company: str
    source: str
    utm_campaign: str = ""
    pages_viewed: list[str] = []
    form_data: dict = {}


class ApprovalAction(BaseModel):
    action: Literal["approved", "edited", "rejected"]
    human_edit: Optional[str] = None

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    source: Optional[str] = None
    utm_campaign: Optional[str] = None
    pages_viewed: Optional[int] = None
    form_data: Optional[dict] = None
    score: Optional[Literal["hot", "warm", "cold"]] = None
    confidence: Optional[float] = None

class LeadOut(BaseModel):
    id: str
    name: str
    company: str
    source: str
    utm_campaign: str
    pages_viewed: list[str]
    form_data: dict
    score: Optional[str]
    confidence: Optional[float]
    score_reasoning: Optional[str]
    next_action: Optional[str]
    action_reasoning: Optional[str]
    draft_subject: Optional[str]
    draft_body: Optional[str]
    explanation: Optional[str]
    status: str
    human_edit: Optional[str]
    auto_approved: Optional[bool]
    current_node: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    resolved_at: Optional[datetime]

    class Config:
        from_attributes = True


class AuditLogOut(BaseModel):
    id: str
    lead_id: str
    lead_name: str
    company: str
    event_type: str
    detail: Optional[str]
    actor: str
    created_at: datetime

    class Config:
        from_attributes = True


class StatsOut(BaseModel):
    total: int
    pending: int
    approved: int
    edited: int
    rejected: int
    auto_approved: int
    error: int
    avg_confidence: float
    hot: int
    warm: int
    cold: int
    sla_breached: int   # leads pending > 5 min
