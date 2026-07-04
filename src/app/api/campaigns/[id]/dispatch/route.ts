import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { Client } from "@upstash/qstash";
import { auth, isEmailAllowed } from "@/auth";
import { getCollections } from "@/lib/db";

export const maxDuration = 60;

function getBaseUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

/**
 * Hands the whole campaign to QStash and returns immediately. QStash
 * delivers one message per second to /api/qstash-worker in the
 * background, so the employee can close their laptop the moment this
 * responds — nothing runs in the browser.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isEmailAllowed(session?.user?.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.QSTASH_TOKEN) {
    return NextResponse.json(
      { error: "QSTASH_TOKEN not configured. See .env.example." },
      { status: 500 }
    );
  }
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      {
        error:
          "APP_URL not configured. QStash needs a public URL to call back — set APP_URL (or deploy to Vercel).",
      },
      { status: 500 }
    );
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
  if (campaign.status !== "draft") {
    return NextResponse.json(
      { error: "Campaign was already dispatched." },
      { status: 409 }
    );
  }

  const pending = await messages
    .find({ campaignId, status: "pending" }, { projection: { _id: 1 } })
    .toArray();
  if (pending.length === 0) {
    return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
  }

  const qstash = new Client({ token: process.env.QSTASH_TOKEN });
  const workerUrl = `${baseUrl}/api/qstash-worker`;

  // One message per second via incremental delays; batched 100 per API
  // call to stay fast on large campaigns.
  const CHUNK = 100;
  for (let offset = 0; offset < pending.length; offset += CHUNK) {
    const chunk = pending.slice(offset, offset + CHUNK);
    await qstash.batchJSON(
      chunk.map((msg, i) => ({
        url: workerUrl,
        body: { messageId: msg._id.toString() },
        delay: offset + i,
        retries: 3,
      }))
    );
  }

  const now = new Date();
  await messages.updateMany(
    { campaignId, status: "pending" },
    { $set: { status: "queued", updatedAt: now } }
  );
  await campaigns.updateOne(
    { _id: campaignId },
    { $set: { status: "running", dispatchedAt: now } }
  );

  return NextResponse.json({ queued: pending.length });
}
