from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone

import uuid

from db.database import init_db, get_db, Lead, AuditLog
from models.schemas import LeadCreate, ApprovalAction, LeadOut, StatsOut, AuditLogOut, LeadUpdate
from agents.graph import graph

app = FastAPI(title="Krazimo Mini AI CRM", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SLA_MINUTES = 5  # leads pending longer than this are flagged


@app.on_event("startup")
def startup():
    init_db()


# ── Audit log helper ───────────────────────────────────────────────────────────
def write_audit(db, lead: Lead, event_type: str, detail: str, actor: str):
    entry = AuditLog(
        id=str(uuid.uuid4()),
        lead_id=lead.id,
        lead_name=lead.name,
        company=lead.company,
        event_type=event_type,
        detail=detail,
        actor=actor,
    )
    db.add(entry)
    db.commit()


# ── Agent pipeline ─────────────────────────────────────────────────────────────
def run_agent_pipeline(lead_id: str):
    from db.database import SessionLocal
    db = SessionLocal()
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        db.close()
        return

    thread_id = str(uuid.uuid4())
    lead.thread_id = thread_id
    db.commit()

    config = {"configurable": {"thread_id": thread_id}}
    initial_state = {
        "lead_id": lead.id,
        "name": lead.name,
        "company": lead.company,
        "source": lead.source,
        "utm_campaign": lead.utm_campaign,
        "pages_viewed": lead.pages_viewed,
        "form_data": lead.form_data,
    }

    try:
        for event in graph.stream(initial_state, config=config):
            node_name = list(event.keys())[0]
            node_output = event[node_name]

            lead.current_node = node_name

            if node_name == "score_node":
                if node_output.get("status") == "error":
                    lead.status = "error"
                    lead.error_message = node_output.get("error_message")
                    write_audit(db, lead, "error", lead.error_message, "agent")
                else:
                    lead.score = node_output.get("score")
                    lead.confidence = node_output.get("confidence")
                    lead.score_reasoning = node_output.get("score_reasoning")
                    write_audit(db, lead, "agent_scored",
                        f"Score: {lead.score} ({int((lead.confidence or 0)*100)}%) — {lead.score_reasoning}", "agent")

            elif node_name == "route":
                if node_output.get("status") == "error":
                    lead.status = "error"
                    lead.error_message = node_output.get("error_message")
                    write_audit(db, lead, "error", lead.error_message, "agent")
                else:
                    lead.next_action = node_output.get("next_action")
                    lead.action_reasoning = node_output.get("action_reasoning")
                    write_audit(db, lead, "agent_routed",
                        f"Action: {lead.next_action} — {lead.action_reasoning}", "agent")

            elif node_name == "draft":
                if node_output.get("status") == "error":
                    lead.status = "error"
                    lead.error_message = node_output.get("error_message")
                    write_audit(db, lead, "error", lead.error_message, "agent")
                else:
                    lead.draft_subject = node_output.get("draft_subject")
                    lead.draft_body = node_output.get("draft_body")
                    write_audit(db, lead, "agent_drafted",
                        f"Subject: {lead.draft_subject}", "agent")

            elif node_name == "explain":
                lead.explanation = node_output.get("explanation")
                auto = node_output.get("auto_approved", False)
                lead.auto_approved = auto
                if auto:
                    lead.status = "auto_approved"
                    
                    lead.resolved_at = datetime.now(timezone.utc)
                    write_audit(db, lead, "auto_approved",
                        f"Confidence {int((lead.confidence or 0)*100)}% exceeded threshold — auto-approved", "agent")
                else:
                    lead.status = "pending"

            db.commit()

    except Exception as e:
        lead.status = "error"
        lead.error_message = str(e)
        write_audit(db, lead, "error", str(e), "agent")
        db.commit()

    db.close()


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.post("/leads", response_model=LeadOut)
def create_lead(payload: LeadCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    lead = Lead(id=str(uuid.uuid4()), **payload.model_dump(), status="processing")
    db.add(lead)
    db.commit()
    db.refresh(lead)
    write_audit(db, lead, "lead_created", f"Source: {lead.source}", "human")
    background_tasks.add_task(run_agent_pipeline, lead.id)
    return lead


@app.get("/leads", response_model=list[LeadOut])
def list_leads(status: str = None, db: Session = Depends(get_db)):
    q = db.query(Lead)
    if status:
        q = q.filter(Lead.status == status)
    return q.order_by(Lead.created_at.desc()).all()
@app.patch("/leads/{lead_id}", response_model=LeadOut)
def update_lead(
    lead_id: str,
    payload: LeadUpdate,
    db: Session = Depends(get_db)
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    update_data = payload.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    for field, value in update_data.items():
        setattr(lead, field, value)

    write_audit(
        db,
        lead,
        "lead_updated",
        f"Updated fields: {list(update_data.keys())}",
        "human"
    )

    db.commit()
    db.refresh(lead)

    return lead

@app.get("/leads/{lead_id}", response_model=LeadOut)
def get_lead(lead_id: str, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@app.post("/leads/{lead_id}/approve", response_model=LeadOut)
def approve_lead(lead_id: str, payload: ApprovalAction, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.status not in ("pending",):
        raise HTTPException(status_code=400, detail=f"Lead is already {lead.status}")

    lead.status = payload.action
    lead.human_edit = payload.human_edit
    lead.resolved_at = datetime.now(timezone.utc)

    event_map = {"approved": "human_approved", "edited": "human_edited", "rejected": "human_rejected"}
    detail = payload.human_edit if payload.action == "edited" else f"Action: {payload.action}"
    write_audit(db, lead, event_map[payload.action], detail, "human")

    if lead.thread_id:
        config = {"configurable": {"thread_id": lead.thread_id}}
        graph.update_state(config, {"status": payload.action, "human_edit": payload.human_edit})
        for _ in graph.stream(None, config=config):
            pass

    db.commit()
    db.refresh(lead)
    return lead


@app.get("/stats", response_model=StatsOut)
def get_stats(db: Session = Depends(get_db)):
    sla_cutoff = datetime.now(timezone.utc) - timedelta(minutes=SLA_MINUTES)
    sla_breached = db.query(Lead).filter(
        Lead.status == "pending",
        Lead.created_at < sla_cutoff
    ).count()

    return StatsOut(
        total        = db.query(Lead).count(),
        pending      = db.query(Lead).filter(Lead.status == "pending").count(),
        approved     = db.query(Lead).filter(Lead.status == "approved").count(),
        edited       = db.query(Lead).filter(Lead.status == "edited").count(),
        rejected     = db.query(Lead).filter(Lead.status == "rejected").count(),
        auto_approved= db.query(Lead).filter(Lead.status == "auto_approved").count(),
        error        = db.query(Lead).filter(Lead.status == "error").count(),
        avg_confidence=round(db.query(func.avg(Lead.confidence)).scalar() or 0.0, 2),
        hot          = db.query(Lead).filter(Lead.score == "hot").count(),
        warm         = db.query(Lead).filter(Lead.score == "warm").count(),
        cold         = db.query(Lead).filter(Lead.score == "cold").count(),
        sla_breached = sla_breached,
    )


@app.get("/audit", response_model=list[AuditLogOut])
def get_audit_log(limit: int = 100, db: Session = Depends(get_db)):
    return db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()


@app.get("/audit/{lead_id}", response_model=list[AuditLogOut])
def get_lead_audit(lead_id: str, db: Session = Depends(get_db)):
    return db.query(AuditLog).filter(AuditLog.lead_id == lead_id).order_by(AuditLog.created_at.asc()).all()


@app.get("/health")
def health():
    return {"status": "ok"}

@app.head("/health")
def health_head():
    return Response(status_code=200)