import { Collection, ObjectId } from "mongodb";
import { getDb } from "./mongodb";

export type CampaignStatus = "draft" | "running" | "completed";

export type MessageStatus =
  | "pending" // created, not yet dispatched
  | "queued" // handed to QStash
  | "sent" // accepted by Meta
  | "delivered"
  | "read"
  | "failed"
  | "opted_out";

export interface Campaign {
  _id?: ObjectId;
  name: string;
  templateName: string;
  templateLang: string;
  createdBy: string;
  createdAt: Date;
  dispatchedAt?: Date;
  /** When set, QStash holds delivery until this time (send-later). */
  scheduledFor?: Date;
  status: CampaignStatus;
  total: number;
  skippedDuplicates: number;
  skippedBlocked: number;
  costEstimateInr: number;
}

export interface MessageDoc {
  _id?: ObjectId;
  campaignId: ObjectId;
  phone: string; // E.164, e.g. +919876543210
  customerName: string;
  orderId: string;
  status: MessageStatus;
  metaMessageId?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BlocklistEntry {
  _id?: ObjectId;
  phone: string;
  reason: string;
  createdAt: Date;
}

let indexesEnsured = false;

async function ensureIndexes(
  campaigns: Collection<Campaign>,
  messages: Collection<MessageDoc>,
  blocklist: Collection<BlocklistEntry>
) {
  if (indexesEnsured) return;
  indexesEnsured = true;
  await Promise.all([
    // Order-ID centric tracking: the same phone may be messaged again,
    // but only for a distinct order.
    messages.createIndex({ phone: 1, orderId: 1 }, { unique: true }),
    messages.createIndex({ campaignId: 1 }),
    messages.createIndex({ metaMessageId: 1 }, { sparse: true }),
    blocklist.createIndex({ phone: 1 }, { unique: true }),
    campaigns.createIndex({ createdAt: -1 }),
  ]);
}

export async function getCollections() {
  const db = await getDb();
  const campaigns = db.collection<Campaign>("campaigns");
  const messages = db.collection<MessageDoc>("messages");
  const blocklist = db.collection<BlocklistEntry>("blocklist");
  await ensureIndexes(campaigns, messages, blocklist);
  return { campaigns, messages, blocklist };
}

export interface StatusCounts {
  pending: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  opted_out: number;
}

export function emptyCounts(): StatusCounts {
  return { pending: 0, queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, opted_out: 0 };
}

export async function countByStatus(campaignId?: ObjectId): Promise<StatusCounts> {
  const { messages } = await getCollections();
  const match = campaignId ? { campaignId } : {};
  const rows = await messages
    .aggregate<{ _id: MessageStatus; n: number }>([
      { $match: match },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ])
    .toArray();
  const counts = emptyCounts();
  for (const r of rows) counts[r._id] = r.n;
  return counts;
}
