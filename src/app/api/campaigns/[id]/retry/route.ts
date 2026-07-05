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
 * Re-queues only this campaign's failed messages. Anything already
 * sent/delivered/read is untouched — the worker's idempotency check
 * skips every status except queued/pending, so nothing can double-send.
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

  const failed = await messages
    .find({ campaignId, status: "failed" }, { projection: { _id: 1 } })
    .toArray();
  if (failed.length === 0) {
    return NextResponse.json(
      { error: "No failed messages to retry." },
      { status: 400 }
    );
  }
  const failedIds = failed.map((m) => m._id);

  // Flip to pending BEFORE publishing: the worker only processes
  // queued/pending, and a delay-0 delivery can arrive before any
  // post-publish status update lands.
  const now = new Date();
  await messages.updateMany(
    { _id: { $in: failedIds } },
    { $set: { status: "pending", updatedAt: now }, $unset: { error: "" } }
  );

  const qstash = new Client({ token: process.env.QSTASH_TOKEN });
  const workerUrl = `${baseUrl}/api/qstash-worker`;

  // Same shape as dispatch: one message per second via incremental
  // delays, batched 100 per API call.
  const CHUNK = 100;
  for (let offset = 0; offset < failedIds.length; offset += CHUNK) {
    const chunk = failedIds.slice(offset, offset + CHUNK);
    await qstash.batchJSON(
      chunk.map((msgId, i) => ({
        url: workerUrl,
        body: { messageId: msgId.toString() },
        delay: offset + i,
        retries: 3,
      }))
    );
  }

  await messages.updateMany(
    { _id: { $in: failedIds }, status: "pending" },
    { $set: { status: "queued", updatedAt: new Date() } }
  );
  await campaigns.updateOne(
    { _id: campaignId },
    { $set: { status: "running" } }
  );

  return NextResponse.json({ requeued: failedIds.length });
}
