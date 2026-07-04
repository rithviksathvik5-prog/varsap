"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatInr } from "@/lib/cost";

interface CampaignDto {
  _id: string;
  name: string;
  status: "draft" | "running" | "completed";
  total: number;
  skippedDuplicates: number;
  skippedBlocked: number;
  costEstimateInr: number;
  createdAt: string;
  createdBy: string;
}

interface Counts {
  pending: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  opted_out: number;
}

interface MessageDto {
  _id: string;
  phone: string;
  customerName: string;
  orderId: string;
  status: keyof Counts;
  error: string | null;
  updatedAt: string;
}

const BADGE: Record<keyof Counts, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-parchment text-ink-muted-80" },
  queued: { label: "Queued", cls: "bg-parchment text-ink-muted-80" },
  sent: { label: "Sent", cls: "bg-[#e8f0fe] text-primary" },
  delivered: { label: "Delivered", cls: "bg-[#e3f5e8] text-[#1d7a3a]" },
  read: { label: "Read", cls: "bg-[#d7f0de] text-[#146a30]" },
  failed: { label: "Failed", cls: "bg-[#fdeaea] text-[#c0392b]" },
  opted_out: { label: "Opted out", cls: "bg-[#f4e8fd] text-[#7d3c98]" },
};

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<CampaignDto | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [log, setLog] = useState<MessageDto[]>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setCampaign(json.campaign);
      setCounts(json.counts);
      setLog(json.messages);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 5000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);

  if (error && !campaign) {
    return (
      <div className="mx-auto max-w-[1024px] px-5 py-12">
        <p className="text-[#d70015]">{error}</p>
        <Link href="/" className="text-primary text-sm">
          Back to dashboard
        </Link>
      </div>
    );
  }
  if (!campaign || !counts) {
    return (
      <div className="mx-auto max-w-[1024px] px-5 py-12 text-ink-muted-48">
        Loading…
      </div>
    );
  }

  const inFlight = counts.pending + counts.queued;
  const done = campaign.total - inFlight;
  const progress =
    campaign.total > 0 ? Math.round((done / campaign.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1024px] px-5 py-12">
      <Link href="/" className="text-primary text-sm">
        ← Dashboard
      </Link>
      <div className="mt-2 flex items-end justify-between flex-wrap gap-3">
        <h1 className="text-[40px] leading-[1.1] font-semibold">
          {campaign.name}
        </h1>
        <div className="text-sm text-ink-muted-48">
          {campaign.status === "running"
            ? `Sending… ${progress}% processed`
            : campaign.status === "completed"
              ? "Completed"
              : "Draft — not dispatched yet"}
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-muted-48">
        {campaign.total.toLocaleString("en-IN")} recipients · est.{" "}
        {formatInr(campaign.costEstimateInr)} ·{" "}
        {campaign.skippedDuplicates + campaign.skippedBlocked} skipped at upload
        · created by {campaign.createdBy}
      </p>

      {campaign.status === "running" && (
        <div className="mt-6 h-1.5 bg-hairline rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {(Object.keys(BADGE) as (keyof Counts)[]).map((k) => (
          <div key={k} className="bg-white border border-hairline rounded-lg p-4">
            <div className="text-[28px] font-semibold leading-tight">
              {counts[k]}
            </div>
            <div className="text-xs text-ink-muted-48 mt-1">{BADGE[k].label}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-white border border-hairline rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-divider-soft flex items-center justify-between">
          <span className="text-[21px] font-semibold">Message log</span>
          <span className="text-xs text-ink-muted-48">
            auto-refreshes every 5s
          </span>
        </div>
        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-ink-muted-48 border-b border-divider-soft">
                <th className="px-6 py-3 font-semibold">Customer</th>
                <th className="px-6 py-3 font-semibold">Phone</th>
                <th className="px-6 py-3 font-semibold">Order ID</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {log.map((m) => (
                <tr key={m._id} className="border-b border-divider-soft last:border-0">
                  <td className="px-6 py-2.5">{m.customerName || "—"}</td>
                  <td className="px-6 py-2.5 tabular-nums">{m.phone}</td>
                  <td className="px-6 py-2.5">{m.orderId}</td>
                  <td className="px-6 py-2.5">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[m.status].cls}`}
                    >
                      {BADGE[m.status].label}
                    </span>
                  </td>
                  <td className="px-6 py-2.5 text-xs text-ink-muted-48 max-w-[280px] truncate">
                    {m.error || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
