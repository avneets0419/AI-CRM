"use client";
import { useEffect, useState } from "react";
import { fetchLeads, fetchStats, submitLead } from "../../lib/api";
import Link from "next/link";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";

// ── Colour maps ────────────────────────────────────────────────────────────────
const SCORE_COLOR: Record<string, string> = {
  hot: "bg-red-100 text-red-800",
  warm: "bg-amber-100 text-amber-800",
  cold: "bg-blue-100 text-blue-800",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  edited: "bg-purple-100 text-purple-800",
  rejected: "bg-gray-100 text-gray-500",
  processing: "bg-sky-100 text-sky-700",
  auto_approved: "bg-teal-100 text-teal-800",
  error: "bg-red-100 text-red-700",
};

const PIE_COLORS_SCORE = ["#ef4444", "#f59e0b", "#3b82f6"];
const PIE_COLORS_STATUS = ["#f59e0b", "#10b981", "#8b5cf6", "#6b7280", "#0ea5e9", "#14b8a6", "#ef4444"];

// ── Node progress ──────────────────────────────────────────────────────────────
const NODES = ["score", "route", "draft", "explain"];
function NodeProgress({ current }: { current: string | null }) {
  if (!current) return null;
  const idx = NODES.indexOf(current);
  return (
    <div className="flex items-center gap-1 mt-1">
      {NODES.map((n, i) => (
        <div key={n} className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${i < idx ? "bg-teal-400" : i === idx ? "bg-amber-400 animate-pulse" : "bg-gray-200"}`} />
          {i < NODES.length - 1 && <div className={`w-3 h-px ${i < idx ? "bg-teal-400" : "bg-gray-200"}`} />}
        </div>
      ))}
      <span className="text-xs text-gray-400 ml-1">{current}…</span>
    </div>
  );
}

// ── Timestamp ─────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z").getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ── Helpers for chart data ─────────────────────────────────────────────────────
function buildLeadsOverTime(leads: any[]) {
  const buckets: Record<string, number> = {};
  leads.forEach((l) => {
    const d = new Date(l.created_at.endsWith("Z") ? l.created_at : l.created_at + "Z");
    const key = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
    buckets[key] = (buckets[key] || 0) + 1;
  });
  return Object.entries(buckets)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([time, count]) => ({ time, count }));
}

function buildActionBar(leads: any[]) {
  const counts: Record<string, number> = {};
  leads.forEach((l) => {
    if (l.next_action) counts[l.next_action] = (counts[l.next_action] || 0) + 1;
  });
  return Object.entries(counts).map(([action, count]) => ({ action, count }));
}

function buildConfidenceDist(leads: any[]) {
  const buckets = [
    { range: "0–25%", count: 0 },
    { range: "26–50%", count: 0 },
    { range: "51–75%", count: 0 },
    { range: "76–100%", count: 0 },
  ];
  leads.forEach((l) => {
    if (l.confidence == null) return;
    const pct = l.confidence * 100;
    if (pct <= 25) buckets[0].count++;
    else if (pct <= 50) buckets[1].count++;
    else if (pct <= 75) buckets[2].count++;
    else buckets[3].count++;
  });
  return buckets;
}

// ── Chart card wrapper ────────────────────────────────────────────────────────
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">{title}</p>
      {children}
    </div>
  );
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
      {label && <p className="font-medium text-gray-700 mb-1">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color || p.fill }}>
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

const SOURCES = ["Google Ads", "LinkedIn", "Organic", "Referral", "Cold Outreach"];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"leads" | "analytics">("leads");
  const [form, setForm] = useState({
    name: "", company: "", source: "Google Ads",
    utm_campaign: "", pages: "", role: "", message: "",
  });

  const load = async () => {
    const [s, l] = await Promise.all([fetchStats(), fetchLeads()]);
    setStats(s); setLeads(l); setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);

  const handleSubmit = async () => {
    if (!form.name || !form.company) return;
    setSubmitting(true);
    await submitLead({
      name: form.name, company: form.company, source: form.source,
      utm_campaign: form.utm_campaign,
      pages_viewed: form.pages.split(",").map((p) => p.trim()).filter(Boolean),
      form_data: { role: form.role, message: form.message },
    });
    setForm({ name: "", company: "", source: "Google Ads", utm_campaign: "", pages: "", role: "", message: "" });
    setShowForm(false);
    setSubmitting(false);
    load();
  };

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;

  // ── Derived chart data ──────────────────────────────────────────────────────
  const scoreData = [
    { name: "Hot", value: stats.hot },
    { name: "Warm", value: stats.warm },
    { name: "Cold", value: stats.cold },
  ].filter((d) => d.value > 0);

  const statusData = [
    { name: "Pending", value: stats.pending },
    { name: "Approved", value: stats.approved },
    { name: "Edited", value: stats.edited },
    { name: "Rejected", value: stats.rejected },
    { name: "Auto-approved", value: stats.auto_approved },
    { name: "Error", value: stats.error },
  ].filter((d) => d.value > 0);

  const leadsOverTime = buildLeadsOverTime(leads);
  const actionBar = buildActionBar(leads);
  const confidenceDist = buildConfidenceDist(leads);

  // Source breakdown
  const sourceCounts: Record<string, number> = {};
  leads.forEach((l) => { sourceCounts[l.source] = (sourceCounts[l.source] || 0) + 1; });
  const sourceBar = Object.entries(sourceCounts).map(([source, count]) => ({ source, count }));

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">AI CRM Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">Shadow launch — agent drafts await your approval</p>
          </div>
          <div className="flex gap-3">
            <Link href="/audit" className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
              Audit log
            </Link>
            <button onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
              + New lead
            </button>
            <Link href="/queue"
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
              Approval queue
              {stats?.pending > 0 && (
                <span className="ml-2 bg-white text-indigo-600 text-xs font-bold px-2 py-0.5 rounded-full">{stats.pending}</span>
              )}
            </Link>
          </div>
        </div>

        {/* SLA breach banner */}
        {stats?.sla_breached > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center justify-between">
            <p className="text-sm text-red-700 font-medium">
              {stats.sla_breached} lead{stats.sla_breached > 1 ? "s" : ""} breached 5-min SLA — pending too long
            </p>
            <Link href="/queue" className="text-sm text-red-600 underline">Review now →</Link>
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total leads", value: stats.total },
            { label: "Pending review", value: stats.pending, highlight: stats.pending > 0 },
            { label: "Auto-approved", value: stats.auto_approved, green: true },
            { label: "Avg confidence", value: `${Math.round(stats.avg_confidence * 100)}%` },
          ].map((s) => (
            <div key={s.label} className={`bg-white rounded-xl p-5 shadow-sm border ${s.highlight ? "border-yellow-300" : s.green ? "border-teal-200" : "border-gray-100"}`}>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Score breakdown */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Hot", value: stats.hot, color: "text-red-600" },
            { label: "Warm", value: stats.warm, color: "text-amber-600" },
            { label: "Cold", value: stats.cold, color: "text-blue-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 text-center">
              <p className={`text-4xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label} leads</p>
            </div>
          ))}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 border-b border-gray-200">
          {(["leads", "analytics"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition ${activeTab === tab ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
              {tab}
            </button>
          ))}
        </div>

        {/* ── LEADS TAB ── */}
        {activeTab === "leads" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">All leads</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>{["Name", "Company", "Source", "Score", "Action", "Status", "Created", ""].map((h) => (
                  <th key={h} className="px-6 py-3 text-left">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{lead.name}</p>
                      {lead.status === "processing" && <NodeProgress current={lead.current_node} />}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{lead.company}</td>
                    <td className="px-6 py-4 text-gray-500">{lead.source}</td>
                    <td className="px-6 py-4">
                      {lead.score ? (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${SCORE_COLOR[lead.score]}`}>
                          {lead.score} {lead.confidence ? `· ${Math.round(lead.confidence * 100)}%` : ""}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{lead.next_action || "—"}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[lead.status] || ""}`}>
                        {lead.status === "auto_approved" ? "auto-approved" : lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs whitespace-nowrap">
                      {lead.created_at ? timeAgo(lead.created_at) : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <Link href={`/queue/${lead.id}`} className="text-indigo-600 hover:underline text-xs">Review →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── ANALYTICS TAB ── */}
        {activeTab === "analytics" && (
          <div className="space-y-6">

            {/* Row 1: two pies */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ChartCard title="Lead score distribution">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={scoreData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={55} outerRadius={85} paddingAngle={3} label={({ name, percent }) =>
                        `${name} ${Math.round((percent ?? 0) * 100)}%`}>
                      {scoreData.map((_, i) => <Cell key={i} fill={PIE_COLORS_SCORE[i]} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Status breakdown">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={55} outerRadius={85} paddingAngle={3} label={({ name, percent }) =>
                        `${name} ${Math.round((percent ?? 0) * 100)}%`}>
                      {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS_STATUS[i % PIE_COLORS_STATUS.length]} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Row 2: leads over time line chart */}
            <ChartCard title="Leads over time">
              {leadsOverTime.length < 2 ? (
                <p className="text-xs text-gray-400 text-center py-10">Not enough data yet — add more leads to see the trend.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={leadsOverTime} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="count" name="Leads" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Row 3: action bar + source bar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ChartCard title="Next action distribution">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={actionBar} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="action" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Leads" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Leads by source">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={sourceBar} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="source" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Leads" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Row 4: confidence distribution */}
            <ChartCard title="Confidence distribution">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={confidenceDist} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                    {confidenceDist.map((_, i) => (
                      <Cell key={i} fill={["#ef4444", "#f59e0b", "#10b981", "#6366f1"][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

          </div>
        )}
      </div>

      {/* Lead submission modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">New lead</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            {[
              { label: "Name *", key: "name", placeholder: "Jane Smith" },
              { label: "Company *", key: "company", placeholder: "Acme Corp" },
              { label: "UTM Campaign", key: "utm_campaign", placeholder: "q2-enterprise" },
              { label: "Pages viewed (comma-separated)", key: "pages", placeholder: "/pricing, /contact" },
              { label: "Role", key: "role", placeholder: "VP Sales" },
              { label: "Message", key: "message", placeholder: "Interested in…" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 font-medium">{label}</label>
                <input
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  placeholder={placeholder}
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 font-medium">Source</label>
              <select className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}>
                {SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <button onClick={handleSubmit} disabled={submitting || !form.name || !form.company}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition disabled:opacity-40">
              {submitting ? "Submitting…" : "Submit lead"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}