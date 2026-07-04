import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getCollections, MessageStatus } from "@/lib/db";

/** Meta's one-time subscription handshake. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (
    mode === "subscribe" &&
    token &&
    token === process.env.META_WEBHOOK_VERIFY_TOKEN
  ) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Lifecycle order — a late "delivered" event must never downgrade "read".
const STATUS_RANK: Partial<Record<MessageStatus, number>> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

const OPT_OUT_PATTERN = /^\s*(stop|unsubscribe|opt\s*-?\s*out)\b/i;

/**
 * Full-lifecycle tracking: records sent / delivered / read / failed for
 * every message, and turns inbound "STOP" replies into permanent
 * blocklist entries.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  // Verify X-Hub-Signature-256 when an app secret is configured.
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) {
    const header = request.headers.get("x-hub-signature-256") || "";
    const expected =
      "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return new Response("Invalid signature", { status: 403 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const { messages, blocklist } = await getCollections();
  const now = new Date();

  type WebhookValue = {
    statuses?: Array<{
      id: string;
      status: string;
      errors?: Array<{ title?: string; message?: string }>;
    }>;
    messages?: Array<{
      from: string;
      type: string;
      text?: { body?: string };
      button?: { text?: string };
    }>;
  };

  const entries =
    (payload as { entry?: Array<{ changes?: Array<{ value?: WebhookValue }> }> })
      ?.entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      for (const s of value.statuses ?? []) {
        if (s.status === "failed") {
          const reason =
            s.errors?.map((e) => e.title || e.message).filter(Boolean).join("; ") ||
            "Meta reported failure (number may not be on WhatsApp)";
          await messages.updateOne(
            { metaMessageId: s.id },
            { $set: { status: "failed", error: reason, updatedAt: now } }
          );
          continue;
        }
        const rank = STATUS_RANK[s.status as MessageStatus];
        if (rank === undefined) continue;
        const doc = await messages.findOne({ metaMessageId: s.id });
        if (!doc) continue;
        const currentRank = STATUS_RANK[doc.status] ?? -1;
        if (rank > currentRank) {
          await messages.updateOne(
            { _id: doc._id },
            { $set: { status: s.status as MessageStatus, updatedAt: now } }
          );
        }
      }

      for (const inbound of value.messages ?? []) {
        const text = inbound.text?.body ?? inbound.button?.text ?? "";
        if (!OPT_OUT_PATTERN.test(text)) continue;
        const phone = inbound.from.startsWith("+")
          ? inbound.from
          : `+${inbound.from}`;
        await blocklist.updateOne(
          { phone },
          { $setOnInsert: { phone, reason: "Customer replied STOP", createdAt: now } },
          { upsert: true }
        );
        // Cancel anything still in flight for this customer.
        await messages.updateMany(
          { phone, status: { $in: ["pending", "queued"] } },
          { $set: { status: "opted_out", updatedAt: now } }
        );
      }
    }
  }

  // Always 200 so Meta doesn't disable the webhook.
  return NextResponse.json({ ok: true });
}
