import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, isEmailAllowed } from "@/auth";
import { getCollections, countByStatus, Campaign } from "@/lib/db";
import { formatInr } from "@/lib/cost";

export const dynamic = "force-dynamic";

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-hairline rounded-lg p-6">
      <div className="text-[34px] font-semibold leading-tight">{value}</div>
      <div className="text-sm text-ink-muted-48 mt-1">{label}</div>
    </div>
  );
}

const STATUS_LABEL: Record<Campaign["status"], string> = {
  draft: "Draft",
  running: "Sending…",
  completed: "Completed",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!isEmailAllowed(session?.user?.email)) redirect("/login");

  let campaigns: Campaign[] = [];
  let counts = {
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    opted_out: 0,
    pending: 0,
    queued: 0,
  };
  let dbError: string | null = null;
  try {
    const { campaigns: col } = await getCollections();
    campaigns = await col.find().sort({ createdAt: -1 }).limit(50).toArray();
    counts = await countByStatus();
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  const reached = counts.delivered + counts.read;
  const attempted =
    counts.sent + counts.delivered + counts.read + counts.failed;
  const deliveryRate =
    attempted > 0 ? `${Math.round((reached / attempted) * 100)}%` : "—";

  return (
    <div className="mx-auto max-w-[1024px] px-5 py-12">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[40px] leading-[1.1] font-semibold">Dashboard</h1>
          <p className="mt-2 text-ink-muted-80 tracking-normal">
            Every campaign, delivery, and opt-out at a glance.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="press bg-primary text-white rounded-full px-6 py-3 no-underline"
        >
          New Campaign
        </Link>
      </div>

      {dbError ? (
        <div className="mt-10 bg-white border border-hairline rounded-lg p-8">
          <h2 className="text-[21px] font-semibold">Database not connected</h2>
          <p className="mt-2 text-ink-muted-80">
            Set <code className="text-sm">MONGODB_URI</code> in{" "}
            <code className="text-sm">.env.local</code> (see{" "}
            <code className="text-sm">.env.example</code> and the README for
            MongoDB Atlas setup).
          </p>
          <p className="mt-3 text-xs text-ink-muted-48 break-all">{dbError}</p>
        </div>
      ) : (
        <>
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile label="Campaigns" value={campaigns.length} />
            <StatTile label="Delivery rate" value={deliveryRate} />
            <StatTile label="Messages read" value={counts.read} />
            <StatTile label="Opt-outs" value={counts.opted_out} />
          </div>

          <div className="mt-10 bg-white border border-hairline rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-divider-soft text-[21px] font-semibold">
              Campaigns
            </div>
            {campaigns.length === 0 ? (
              <div className="px-6 py-12 text-center text-ink-muted-48">
                No campaigns yet.{" "}
                <Link href="/campaigns/new" className="text-primary">
                  Create your first one.
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-ink-muted-48 border-b border-divider-soft">
                      <th className="px-6 py-3 font-semibold">Name</th>
                      <th className="px-6 py-3 font-semibold">Status</th>
                      <th className="px-6 py-3 font-semibold">Recipients</th>
                      <th className="px-6 py-3 font-semibold">Est. cost</th>
                      <th className="px-6 py-3 font-semibold">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr
                        key={c._id!.toString()}
                        className="border-b border-divider-soft last:border-0"
                      >
                        <td className="px-6 py-3">
                          <Link
                            href={`/campaigns/${c._id}`}
                            className="text-primary"
                          >
                            {c.name}
                          </Link>
                        </td>
                        <td className="px-6 py-3">{STATUS_LABEL[c.status]}</td>
                        <td className="px-6 py-3">{c.total}</td>
                        <td className="px-6 py-3">
                          {formatInr(c.costEstimateInr)}
                        </td>
                        <td className="px-6 py-3 text-ink-muted-48">
                          {new Date(c.createdAt).toLocaleDateString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
