import { NextResponse } from "next/server";
import { db, eq, pushSubscriptions } from "@tracker/db";

export async function POST(req: Request) {
  const sub = (await req.json()) as {
    endpoint?: string;
    keys?: { p256dh: string; auth: string };
  };
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  await db
    .insert(pushSubscriptions)
    .values({ endpoint: sub.endpoint, keys: sub.keys })
    .onConflictDoNothing({ target: pushSubscriptions.endpoint });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (endpoint) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }
  return NextResponse.json({ ok: true });
}
