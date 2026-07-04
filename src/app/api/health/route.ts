import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

/** Unauthenticated liveness probe: reports whether the DB is reachable. */
export async function GET() {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return NextResponse.json({ ok: true, db: "connected" });
  } catch {
    return NextResponse.json({ ok: false, db: "unreachable" }, { status: 503 });
  }
}
