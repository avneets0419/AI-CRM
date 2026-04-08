"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchLead, fetchLeadAudit, approveAction } from "../../../lib/api";

const NODES = ["score", "route", "draft", "explain"];

const EVENT_STYLE: Record<string, string> = {
  lead_created: "bg-gray-100 text-gray-600",
  agent_scored: "bg-blue-100 text-blue-700",
  agent_routed: "bg-sky-100 text-sky-700",
  agent_drafted: "bg-indigo-100 text-indigo-700",
  auto_approved: "bg-teal-100 text-teal-700",
  human_approved: "bg-green-100 text-green-700",
  human_edited: "bg-purple-100 text-purple-700",
  human_rejected: "bg-gray-100 text-gray-500",
  error: "bg-red-100 text-red-700",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z').getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function LeadReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<any>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editedBody, setEditedBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const poll = async () => {
      const [l, a] = await Promise.all([fetchLead(id), fetchLeadAudit(id)]);
      setLead(l);
      setAuditLog(a);
      setEditedBody(l.draft_body || "");
      setLoading(false);
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [id]);

  const handleAction = async (action: "approved" | "edited" | "rejected") => {
    setSubmitting(true);
    await approveAction(id, action, action === "edited" ? editedBody : undefined);
    router.push("/queue");
  };

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!lead) return <div className="p-8 text-red-500">Lead not found.</div>;

  const isProcessing = lead.status === "processing";
  const isResolved = ["approved", "edited", "rejected", "auto_approved"].includes(lead.status);
  const isError = lead.status === "error";
  const currentNodeIdx = NODES.indexOf(lead.current_node);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <button onClick={() => router.back()} className="text-sm text-indigo-600 hover:underline">← Back</button>

        {/* Lead identity */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{lead.name}</h1>
              <p className="text-gray-500 text-sm mt-0.5">{lead.company} · {lead.source}</p>
              {lead.utm_campaign && <p className="text-xs text-gray-400 mt-0.5">Campaign: {lead.utm_campaign}</p>}
            </div>
            {lead.auto_approved && (
              <span className="bg-teal-100 text-teal-700 text-xs font-medium px-3 py-1 rounded-full">
                Auto-approved · {Math.round((lead.confidence || 0) * 100)}% confidence
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {lead.pages_viewed?.map((p: string) => (
              <span key={p} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{p}</span>
            ))}
          </div>
        </div>

        {/* Pipeline progress */}
        {isProcessing && (
          <div className="bg-white rounded-xl p-5 shadow-sm border border-sky-200">
            <p className="text-sm font-medium text-sky-700 mb-3">Agent pipeline running...</p>
            <div className="flex items-center gap-2">
              {NODES.map((n, i) => (
                <div key={n} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${i < currentNodeIdx ? "bg-teal-100 text-teal-700" :
                    i === currentNodeIdx ? "bg-amber-100 text-amber-700 animate-pulse" :
                      "bg-gray-100 text-gray-400"
                    }`}>
                    {i < currentNodeIdx ? "✓" : i === currentNodeIdx ? "●" : "○"} {n}
                  </div>
                  {i < NODES.length - 1 && <div className={`w-4 h-px ${i < currentNodeIdx ? "bg-teal-300" : "bg-gray-200"}`} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-red-700">Pipeline error</p>
            <p className="text-sm text-red-600 mt-1">{lead.error_message}</p>
          </div>
        )}

        {/* Agent reasoning */}
        {lead.explanation && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent reasoning</h2>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${lead.score === "hot" ? "bg-red-100 text-red-700" :
                lead.score === "warm" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                }`}>{lead.score} lead</span>
              <span className="text-gray-400 text-sm">{Math.round((lead.confidence || 0) * 100)}% confidence</span>
              <span className="ml-auto text-xs text-gray-400">Action: <strong className="text-gray-700">{lead.next_action}</strong></span>
            </div>
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-4 leading-relaxed">{lead.explanation}</p>
          </div>
        )}

        {/* Draft email */}
        {lead.draft_subject && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent draft</h2>
              {!isResolved && !isError && (
                <button onClick={() => setEditMode(!editMode)} className="text-xs text-indigo-600 hover:underline">
                  {editMode ? "Cancel edit" : "Edit draft"}
                </button>
              )}
            </div>
            <div className="border border-gray-200 rounded-lg p-4 space-y-1">
              <p className="text-xs text-gray-400 uppercase">Subject</p>
              <p className="text-sm font-medium text-gray-900">{lead.draft_subject}</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4 space-y-1">
              <p className="text-xs text-gray-400 uppercase">Body</p>
              {editMode ? (
                <textarea className="w-full text-sm text-gray-800 outline-none resize-none min-h-[140px] leading-relaxed"
                  value={editedBody} onChange={e => setEditedBody(e.target.value)} />
              ) : (
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {lead.human_edit || lead.draft_body}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Approval actions */}
        {!isResolved && !isProcessing && !isError && lead.draft_body && (
          <div className="flex gap-3">
            <button disabled={submitting} onClick={() => handleAction(editMode ? "edited" : "approved")}
              className="flex-1 bg-green-600 text-white py-3 rounded-xl font-medium hover:bg-green-700 transition disabled:opacity-50">
              {editMode ? "Send edited version" : "Approve & send"}
            </button>
            <button disabled={submitting} onClick={() => handleAction("rejected")}
              className="px-6 py-3 rounded-xl font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
              Reject
            </button>
          </div>
        )}

        {/* Resolved state */}
        {isResolved && (
          <div className={`rounded-xl p-4 text-sm font-medium text-center ${lead.status === "approved" ? "bg-green-50 text-green-700 border border-green-200" :
            lead.status === "auto_approved" ? "bg-teal-50 text-teal-700 border border-teal-200" :
              lead.status === "edited" ? "bg-purple-50 text-purple-700 border border-purple-200" :
                "bg-gray-100 text-gray-500 border border-gray-200"
            }`}>
            {lead.status === "approved" && "Approved — email sent"}
            {lead.status === "auto_approved" && `Auto-approved at ${Math.round((lead.confidence || 0) * 100)}% confidence`}
            {lead.status === "edited" && "Edited version sent"}
            {lead.status === "rejected" && "Rejected — lead archived"}
          </div>
        )}

        {/* Per-lead audit trail */}
        {auditLog.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Timeline</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {auditLog.map((log) => (
                <div key={log.id} className="px-6 py-3 flex items-start gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 mt-0.5 ${EVENT_STYLE[log.event_type] || "bg-gray-100 text-gray-600"}`}>
                    {log.event_type.replace(/_/g, " ")}
                  </span>
                  <p className="text-sm text-gray-600 flex-1">{log.detail || "—"}</p>
                  <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(log.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
