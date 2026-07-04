import { NextResponse } from "next/server";
import { MongoBulkWriteError } from "mongodb";
import { auth, isEmailAllowed } from "@/auth";
import { getCollections, Campaign, MessageDoc } from "@/lib/db";
import { sanitizePhone } from "@/lib/phone";
import { estimateCostInr } from "@/lib/cost";

interface IncomingRow {
  phone: string;
  customerName?: string;
  orderId: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!isEmailAllowed(session?.user?.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const rows: IncomingRow[] = Array.isArray(body?.rows) ? body.rows : [];
  if (!name || rows.length === 0) {
    return NextResponse.json(
      { error: "A campaign name and at least one row are required." },
      { status: 400 }
    );
  }
  if (rows.length > 20000) {
    return NextResponse.json(
      { error: "Maximum 20,000 rows per campaign." },
      { status: 400 }
    );
  }

  const { campaigns, messages, blocklist } = await getCollections();

  // Re-sanitize server-side; never trust client-side validation alone.
  const now = new Date();
  const seenInUpload = new Set<string>();
  let invalid = 0;
  const candidates: Omit<MessageDoc, "campaignId">[] = [];
  for (const row of rows) {
    const phone = sanitizePhone(row?.phone);
    const orderId = String(row?.orderId ?? "").trim();
    if (!phone || !orderId) {
      invalid++;
      continue;
    }
    const key = `${phone}|${orderId}`;
    if (seenInUpload.has(key)) {
      invalid++;
      continue;
    }
    seenInUpload.add(key);
    candidates.push({
      phone,
      customerName: String(row?.customerName ?? "").trim(),
      orderId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "No valid rows after sanitization." },
      { status: 400 }
    );
  }

  const phones = [...new Set(candidates.map((c) => c.phone))];

  // Opt-out blocklist check.
  const blocked = new Set(
    (await blocklist.find({ phone: { $in: phones } }).toArray()).map(
      (b) => b.phone
    )
  );

  // Order-ID centric dedupe: a phone may be messaged again only for a
  // distinct order. Existing (phone, orderId) pairs are skipped.
  const existing = new Set(
    (
      await messages
        .find(
          { phone: { $in: phones } },
          { projection: { phone: 1, orderId: 1 } }
        )
        .toArray()
    ).map((m) => `${m.phone}|${m.orderId}`)
  );

  const fresh = candidates.filter(
    (c) => !blocked.has(c.phone) && !existing.has(`${c.phone}|${c.orderId}`)
  );
  const skippedBlocked = candidates.filter((c) => blocked.has(c.phone)).length;
  let skippedDuplicates = candidates.length - fresh.length - skippedBlocked;

  const campaign: Campaign = {
    name,
    templateName: process.env.META_TEMPLATE_NAME || "feedback_request",
    templateLang: process.env.META_TEMPLATE_LANG || "en",
    createdBy: session!.user!.email!,
    createdAt: now,
    status: "draft",
    total: fresh.length,
    skippedDuplicates,
    skippedBlocked,
    costEstimateInr: estimateCostInr(fresh.length),
  };
  const { insertedId } = await campaigns.insertOne(campaign);

  let inserted = fresh.length;
  if (fresh.length > 0) {
    try {
      const result = await messages.insertMany(
        fresh.map((c) => ({ ...c, campaignId: insertedId })),
        { ordered: false }
      );
      inserted = result.insertedCount;
    } catch (e) {
      // Unique index backstop: concurrent uploads of the same pair.
      if (e instanceof MongoBulkWriteError) {
        inserted = e.result.insertedCount;
      } else {
        throw e;
      }
    }
  }
  if (inserted !== fresh.length) {
    skippedDuplicates += fresh.length - inserted;
    await campaigns.updateOne(
      { _id: insertedId },
      { $set: { total: inserted, skippedDuplicates, costEstimateInr: estimateCostInr(inserted) } }
    );
  }

  return NextResponse.json({
    campaignId: insertedId.toString(),
    total: inserted,
    skippedDuplicates,
    skippedBlocked,
    invalid,
    costEstimateInr: estimateCostInr(inserted),
  });
}

export async function GET() {
  const session = await auth();
  if (!isEmailAllowed(session?.user?.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { campaigns } = await getCollections();
  const list = await campaigns.find().sort({ createdAt: -1 }).limit(100).toArray();
  return NextResponse.json({
    campaigns: list.map((c) => ({ ...c, _id: c._id!.toString() })),
  });
}
