"use client";
import { useEffect, useState } from "react";
import { fetchLeads } from "../../lib/api";
import Link from "next/link";

export default function QueuePage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const all = await fetchLeads();
    setLeads(all.filter((l: any) => l.status === "pending"));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Loading queue...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Approval queue</h1>
            <p className="text-sm text-gray-500 mt-1 ">
              {leads.length} lead{leads.length !== 1 ? "s" : ""} waiting for your review
            </p>
          </div>
          <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">← Dashboard</Link>
        </div>

        {leads.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center text-gray-400 border border-gray-100 shadow-sm">
            All caught up. No pending leads.
          </div>
        ) : (
          <div className="space-y-4">
            {leads.map((lead) => (
              <Link key={lead.id} href={`/queue/${lead.id}`}>
                <div className="bg-white rounded-xl p-6 shadow-sm border border-yellow-200 hover:border-indigo-300 transition cursor-pointer mt-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{lead.name} · {lead.company}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {lead.source} · {lead.next_action || "no action yet"}
                      </p>
                    </div>
                    <div className="text-right">
                      {lead.score && (
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${lead.score === "hot" ? "bg-red-100 text-red-700" :
                          lead.score === "warm" ? "bg-amber-100 text-amber-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>
                          {lead.score} · {Math.round((lead.confidence || 0) * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {lead.draft_subject && (
                    <p className="mt-3 text-sm text-gray-600 italic truncate">
                      "{lead.draft_subject}"
                    </p>
                  )}
                  <p className="mt-2 text-xs text-indigo-600">Review draft →</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
