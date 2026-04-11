# Krazimo Mini AI CRM — Shadow Launch Demo

A working prototype of Krazimo's Stage 3 "man-in-the-middle" pattern.
AI agents score, route, and draft outreach for incoming leads — humans approve, edit, or reject before anything sends.

## What it demonstrates

- **LangGraph multi-node pipeline** — 4 sequential agent nodes (score → route → draft → explain)
- **Human-in-the-loop interrupt** — graph pauses before approval, resumes after human decision
- **Observability** — confidence scores, agent reasoning, and audit log per lead
- **Phased autonomy** — nothing executes without human sign-off (mirrors Krazimo's exact Stage 3)

## Architecture

```
Lead submitted
      │
      ▼
 score_node      → hot/warm/cold + confidence %
      │
 route_node      → email / call / demo / book
      │
 draft_node      → personalized first-touch email
      │
 explain_node    → human-readable reasoning summary
      │
 ── INTERRUPT ── ← human reviews in approval queue UI
      │
 approval_gate   → approved / edited / rejected → logged
```

## Stack

| Layer | Tech |
|---|---|
| Agent graph | LangGraph + Groq (LLaMA3 8B) |
| Backend API | FastAPI + SQLAlchemy + SQLite |
| Frontend | Next.js 15 + Tailwind CSS |

## Setup

### 1. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Add your Groq API key
echo "GROQ_API_KEY=your_key_here" > .env

# Start the API
uvicorn api.main:app --reload --port 8000
```

### 2. Seed mock leads

```bash
cd backend
python seed.py
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

## Usage

1. Open the dashboard at `http://localhost:3000`
2. Watch leads get processed by the agent pipeline in real time
3. Click "Approval Queue" to see pending agent drafts
4. On each lead: read the agent's reasoning + email draft
5. Approve, edit, or reject — the decision is logged

## Key files

```
backend/
  agents/graph.py       ← LangGraph graph definition (core logic)
  api/main.py           ← FastAPI routes
  db/database.py        ← SQLAlchemy models
  seed.py               ← Mock lead data

frontend/
  app/dashboard/        ← Pipeline overview + stats
  app/queue/            ← Pending approvals list
  app/queue/[id]/       ← Individual lead review + MITM approval UI
  lib/api.ts            ← API client
```

## Extending this

- **Add a scoring rubric** — pass historical conversion data to the score agent
- **Connect a real CRM** — swap mock leads for Salesforce/HubSpot webhooks
- **Add email sending** — call Resend API after approval
- **Confidence threshold automation** — auto-approve leads above 90% confidence (gradual autonomy)
