import React, { useEffect, useState } from "react";
import { getPendingApprovals, approveUser } from "@/lib/auth";

export default function AdminApprovalsPanel() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      console.log("FETCHING APPROVALS...");
      const items = await getPendingApprovals();
      console.log("DATA:", items);
      setApprovals(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleApprove = async (requestId: string) => {
    setApproving(requestId);
    try {
      await approveUser(requestId);
      await load();
    } catch (err) {
      console.error("Approve failed:", err);
    } finally {
      setApproving(null);
    }
  };

  if (loading) return <div>Loading…</div>;
  if (!approvals || approvals.length === 0) return <div>No pending approvals</div>;

  return (
    <div>
      <h3 className="text-lg font-semibold">Pending Approvals</h3>
      <ul className="space-y-3">
        {approvals.map((a) => (
          <li key={a.requestId} className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">{a.name} <span className="text-sm text-muted-foreground">({a.email})</span></div>
              <div className="text-sm text-muted-foreground">{a.role}</div>
              <div className="text-xs text-muted-foreground">Requested: {new Date(a.requestedAt).toLocaleString()}</div>
            </div>
            <div>
              <button
                className="rounded-md bg-primary px-3 py-1 text-white"
                onClick={() => void handleApprove(a.requestId)}
                disabled={approving === a.requestId}
              >
                {approving === a.requestId ? "Approving…" : "Approve"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
