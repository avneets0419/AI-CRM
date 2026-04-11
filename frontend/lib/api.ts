const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchLeads(status?: string) {
  const url = status ? `${BASE}/leads?status=${status}` : `${BASE}/leads`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch leads");
  console.log("Fetched leads with status", status, ":", await res.clone().json());
  return res.json();

}

export async function fetchLead(id: string) {
  const res = await fetch(`${BASE}/leads/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch lead");
  return res.json();
}

export async function fetchStats() {
  const res = await fetch(`${BASE}/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function fetchAuditLog() {
  const res = await fetch(`${BASE}/audit`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch audit log");
  return res.json();
}

export async function fetchLeadAudit(id: string) {
  const res = await fetch(`${BASE}/audit/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch lead audit");
  return res.json();
}

export async function submitLead(data: {
  name: string; company: string; source: string;
  utm_campaign?: string; pages_viewed?: string[]; form_data?: Record<string, string>;
}) {
  const res = await fetch(`${BASE}/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to submit lead");
  return res.json();
}

export async function approveAction(
  leadId: string, action: "approved" | "edited" | "rejected", humanEdit?: string
) {
  const res = await fetch(`${BASE}/leads/${leadId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, human_edit: humanEdit }),
  });
  if (!res.ok) throw new Error("Failed to submit approval");
  return res.json();
}
