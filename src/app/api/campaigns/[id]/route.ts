import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth, isEmailAllowed } from "@/auth";
import { getCollections, countByStatus } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isEmailAllowed(session?.user?.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const campaignId = new ObjectId(id);
  const { campaigns, messages } = await getCollections();
  const campaign = await campaigns.findOne({ _id: campaignId });
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [counts, log] = await Promise.all([
    countByStatus(campaignId),
    messages
      .find({ campaignId })
      .sort({ updatedAt: -1 })
      .limit(1000)
      .toArray(),
  ]);
  return NextResponse.json({
    campaign: { ...campaign, _id: campaign._id!.toString() },
    counts,
    messages: log.map((m) => ({
      _id: m._id!.toString(),
      phone: m.phone,
      customerName: m.customerName,
      orderId: m.orderId,
      status: m.status,
      error: m.error ?? null,
      updatedAt: m.updatedAt,
    })),
  });
}
