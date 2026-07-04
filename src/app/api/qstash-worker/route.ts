import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { Receiver } from "@upstash/qstash";
import { getCollections } from "@/lib/db";
import { sendTemplateMessage } from "@/lib/meta";

export const maxDuration = 30;

/**
 * The endpoint QStash pings (once per second per campaign) to actually
 * send a WhatsApp message. Protected by QStash's request signature, not
 * by session auth.
 */
export async function POST(request: Request) {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    return NextResponse.json(
      { error: "QStash signing keys not configured" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  const valid = await receiver
    .verify({ signature, body: rawBody })
    .catch(() => false);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { messageId } = JSON.parse(rawBody) as { messageId?: string };
  if (!messageId || !ObjectId.isValid(messageId)) {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const { campaigns, messages, blocklist } = await getCollections();
  const message = await messages.findOne({ _id: new ObjectId(messageId) });
  if (!message) {
    return NextResponse.json({ ok: true, skipped: "not found" });
  }
  // Idempotency: QStash retries must never double-send.
  if (message.status !== "queued" && message.status !== "pending") {
    return NextResponse.json({ ok: true, skipped: message.status });
  }

  // The customer may have opted out after this campaign was queued.
  const optedOut = await blocklist.findOne({ phone: message.phone });
  if (optedOut) {
    await messages.updateOne(
      { _id: message._id },
      { $set: { status: "opted_out", updatedAt: new Date() } }
    );
    await maybeCompleteCampaign(message.campaignId);
    return NextResponse.json({ ok: true, skipped: "opted_out" });
  }

  const campaign = await campaigns.findOne({ _id: message.campaignId });
  const result = await sendTemplateMessage({
    phone: message.phone,
    customerName: message.customerName,
    templateName: campaign?.templateName || "feedback_request",
    templateLang: campaign?.templateLang || "en",
  });

  if (result.ok) {
    await messages.updateOne(
      { _id: message._id },
      {
        $set: {
          status: "sent",
          metaMessageId: result.metaMessageId,
          updatedAt: new Date(),
        },
      }
    );
  } else if (result.retryable) {
    // Leave the message queued and let QStash retry with backoff.
    return NextResponse.json({ error: result.error }, { status: 500 });
  } else {
    await messages.updateOne(
      { _id: message._id },
      { $set: { status: "failed", error: result.error, updatedAt: new Date() } }
    );
  }

  await maybeCompleteCampaign(message.campaignId);
  return NextResponse.json({ ok: true });
}

async function maybeCompleteCampaign(campaignId: ObjectId) {
  const { campaigns, messages } = await getCollections();
  const remaining = await messages.countDocuments({
    campaignId,
    status: { $in: ["pending", "queued"] },
  });
  if (remaining === 0) {
    await campaigns.updateOne(
      { _id: campaignId, status: "running" },
      { $set: { status: "completed" } }
    );
  }
}
