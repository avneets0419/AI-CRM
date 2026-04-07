from typing import TypedDict, Literal, Optional
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
import json, re, time, logging
import os
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0.3)

AUTO_APPROVE_THRESHOLD = 0.90


class LeadState(TypedDict):
    lead_id: str
    name: str
    company: str
    source: str
    utm_campaign: str
    pages_viewed: list[str]
    form_data: dict
    score: Optional[Literal["hot", "warm", "cold"]]
    confidence: Optional[float]
    score_reasoning: Optional[str]
    next_action: Optional[Literal["email", "call", "demo", "book"]]
    action_reasoning: Optional[str]
    draft_subject: Optional[str]
    draft_body: Optional[str]
    explanation: Optional[str]
    status: Optional[Literal["pending", "approved", "edited", "rejected", "error", "auto_approved"]]
    human_edit: Optional[str]
    current_node: Optional[str]
    auto_approved: Optional[bool]
    error_message: Optional[str]


def call_llm_with_retry(prompt: str, retries: int = 2, delay: float = 1.5) -> dict:
    last_err = None
    for attempt in range(retries + 1):
        try:
            resp = llm.invoke([HumanMessage(content=prompt)])
            raw = resp.content.strip()
            print("RAW LLM:", raw)
            raw = re.sub(r"^```json|```$", "", raw, flags=re.MULTILINE).strip()
            # Fix literal newlines inside JSON strings
            raw = re.sub(r'(?<!\\)\n', '\\n', raw)
            return json.loads(raw)
        except Exception as e:
            print(f"LLM error on attempt {attempt + 1}: {e}")
            last_err = e
            logger.warning(f"LLM attempt {attempt + 1} failed: {e}")
            if attempt < retries:
                time.sleep(delay)
    raise RuntimeError(f"LLM failed after {retries + 1} attempts: {last_err}")


def score_node(state: LeadState) -> dict:
    prompt = f"""You are a strict B2B lead scoring expert. Score conservatively — default to cold unless signals are strong.

Lead data:
- Name: {state['name']}
- Company: {state['company']}
- Source: {state['source']}
- Campaign: {state['utm_campaign']}
- Pages visited: {', '.join(state['pages_viewed']) if state['pages_viewed'] else 'none'}
- Form data: {json.dumps(state['form_data'])}

Scoring rubric — use ALL signals together:
HOT: pricing/demo page visited + decision-maker role + specific product question
WARM: multiple pages OR specific question OR relevant role (but not all three)
COLD: single page (e.g. homepage only), vague message, intern/student role, cold outreach source, no specific intent

Be strict. An intern asking about CRM generically via cold outreach who only visited "/" is COLD.

Respond ONLY valid JSON:
{{"score": "hot|warm|cold", "confidence": 0.0-1.0, "reasoning": "cite the specific signals that determined this score"}}"""
    try:
        data = call_llm_with_retry(prompt)
        return {
            "score": data["score"],
            "confidence": float(data["confidence"]),
            "score_reasoning": data["reasoning"],
            "current_node": "score",
            "error_message": None,
        }
    except Exception as e:
        return {"status": "error", "error_message": f"score_node: {e}", "current_node": "score"}


def route_node(state: LeadState) -> dict:
    if state.get("status") == "error":
        return {"current_node": "route"}
    prompt = f"""Sales routing expert. Choose the most appropriate next action based on ALL signals.

Lead score: {state['score']} (confidence: {state['confidence']})
Source: {state['source']}
Pages visited: {', '.join(state['pages_viewed']) if state['pages_viewed'] else 'homepage only'}
Score reasoning: {state['score_reasoning']}

Routing rules:
- hot + demo/pricing page visited → book (schedule a call immediately)
- hot + no demo page → demo (invite to demo)
- warm → email (nurture first)
- cold → email (low-touch outreach only)
- Never route a cold lead to call or demo

Respond ONLY valid JSON:
{{"action": "email|call|demo|book", "reasoning": "one sentence referencing the specific signals"}}"""
    try:
        data = call_llm_with_retry(prompt)
        return {"next_action": data["action"], "action_reasoning": data["reasoning"], "current_node": "route"}
    except Exception as e:
        return {"status": "error", "error_message": f"route_node: {e}", "current_node": "route"}


def draft_node(state: LeadState) -> dict:
    if state.get("status") == "error":
        return {"current_node": "draft"}
    prompt = f"""You are a B2B sales rep writing a first-touch email. You must personalize it using ONLY the data provided — do not invent facts.

Lead data:
- Name: {state['name']}
- Company: {state['company']}
- Source: {state['source']}
- Pages they visited: {', '.join(state['pages_viewed']) if state['pages_viewed'] else 'homepage only'}
- What they wrote in the form: {json.dumps(state['form_data'])}
- Lead score: {state['score']}
- Recommended action: {state['next_action']}

Rules:
- Reference their ACTUAL form message (e.g. if they asked about CRM, mention CRM specifically)
- Reference the pages they visited if relevant (e.g. if they saw pricing, acknowledge it)
- Do NOT use filler phrases like "innovative approach" or "streamline processes"
- Do NOT invent company details you don't have
- If the lead is cold, keep it short and low-pressure (2-3 sentences max)
- If hot, be direct about next step (book a demo, here's a link etc.)
- Max 100 words
- Sign off as "Team [Your Company]" not "[Your Name]"

Respond ONLY valid JSON:
{{"subject": "...", "body": "..."}}"""
    try:
        data = call_llm_with_retry(prompt)
        return {"draft_subject": data["subject"], "draft_body": data["body"], "current_node": "draft"}
    except Exception as e:
        return {"status": "error", "error_message": f"draft_node: {e}", "current_node": "draft"}


def explain_node(state: LeadState) -> dict:
    if state.get("status") == "error":
        return {"current_node": "explain"}
    explanation = (
        f"Lead '{state['name']}' from {state['company']} scored **{state['score']}** "
        f"(confidence {int((state['confidence'] or 0)*100)}%) — {state['score_reasoning']}. "
        f"Recommended: **{state['next_action']}** — {state['action_reasoning']}."
    )
    confidence = state.get("confidence") or 0.0
    if state.get("score") == "hot" and confidence >= AUTO_APPROVE_THRESHOLD:
        return {"explanation": explanation, "status": "auto_approved", "auto_approved": True, "current_node": "explain"}
    return {"explanation": explanation, "status": "pending", "auto_approved": False, "current_node": "explain"}


def approval_gate(state: LeadState) -> dict:
    if state.get("status") in ("approved", "edited", "rejected", "auto_approved", "error"):
        return {"current_node": "approval_gate"}
    return {"status": "pending"}


def build_graph():
    builder = StateGraph(LeadState)
    builder.add_node("score_node", score_node)
    builder.add_node("route", route_node)
    builder.add_node("draft", draft_node)
    builder.add_node("explain", explain_node)
    builder.add_node("approval_gate", approval_gate)
    builder.set_entry_point("score_node")
    builder.add_edge("score_node", "route")
    builder.add_edge("route", "draft")
    builder.add_edge("draft", "explain")
    builder.add_edge("explain", "approval_gate")
    builder.add_edge("approval_gate", END)
    checkpointer = MemorySaver()
    return builder.compile(checkpointer=checkpointer, interrupt_before=["approval_gate"])

graph = build_graph()
