"use client";
import { useEffect, useState } from "react";
import { fetchAuditLog } from "../../lib/api";
import Link from "next/link";

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

const ACTOR_STYLE: Record<string, string> = {
  agent: "bg-amber-50 text-amber-700 border border-amber-200",
  human: "bg-indigo-50 text-indigo-700 border border-indigo-200",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z').getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "agent" | "human">("all");

  const load = async () => {
    const data = await fetchAuditLog();
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const filtered = filter === "all" ? logs : logs.filter(l => l.actor === filter);

  if (loading) return <div className="p-8 text-gray-500">Loading audit log...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Audit log</h1>
            <p className="text-sm text-gray-500 mt-0.5">Every agent action and human decision — in order</p>
          </div>
          <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">← Dashboard</Link>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(["all", "agent", "human"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${filter === f ? "bg-indigo-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
              {f === "all" ? `All (${logs.length})` : f === "agent" ? `Agent actions (${logs.filter(l => l.actor === "agent").length})` : `Human decisions (${logs.filter(l => l.actor === "human").length})`}
            </button>
          ))}
        </div>

        {/* Log entries */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-400">No entries yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((log) => (
                <div key={log.id} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition">
                  <div className="flex-shrink-0 pt-0.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTOR_STYLE[log.actor]}`}>
                      {log.actor}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${EVENT_STYLE[log.event_type] || "bg-gray-100 text-gray-600"}`}>
                        {log.event_type.replace(/_/g, " ")}
                      </span>
                      <Link href={`/queue/${log.lead_id}`} className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition">
                        {log.lead_name}
                      </Link>
                      <span className="text-sm text-gray-400">· {log.company}</span>
                    </div>
                    {log.detail && (
                      <p className="text-sm text-gray-500 mt-1 truncate">{log.detail}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-xs text-gray-400">{timeAgo(log.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
