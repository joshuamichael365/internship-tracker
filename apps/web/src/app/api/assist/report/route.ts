import { NextResponse } from "next/server";
import { applications, db, eq, sql } from "@tracker/db";
import { onApplied } from "@/lib/applied-side-effects";
import { ASSIST_CORS, assistAuthorized, assistPreflight } from "@/lib/extension-auth";

/**
 * The extension reports auto-apply outcomes here (token auth, session-free):
 *   submitted → mark applied + receipt + hide reposts
 *   blocked   → bump blockerRetries; at 3 fire the "needs you" notice
 *   failed    → no state change (the popup shows the reason)
 */

export function OPTIONS() {
  return assistPreflight();
}

export async function POST(req: Request) {
  if (!assistAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: ASSIST_CORS });
  }

  let body: { applicationId?: unknown; event?: unknown; detail?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400, headers: ASSIST_CORS });
  }

  const applicationId = Number(body.applicationId);
  const event = body.event;
  const detail = typeof body.detail === "string" ? body.detail : undefined;
  if (!Number.isFinite(applicationId) || !["submitted", "blocked", "failed"].includes(event as string)) {
    return NextResponse.json({ error: "bad body" }, { status: 400, headers: ASSIST_CORS });
  }

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) {
    return NextResponse.json({ error: "not found" }, { status: 404, headers: ASSIST_CORS });
  }

  let blockerRetries = app.blockerRetries;

  if (event === "submitted") {
    const wasApplied = app.appliedAt !== null;
    await db
      .update(applications)
      .set({ stage: "applied", updatedAt: new Date(), ...(wasApplied ? {} : { appliedAt: new Date() }) })
      .where(eq(applications.id, applicationId));
    if (!wasApplied) await onApplied(applicationId, app.company, app.roleTitle);
  } else if (event === "blocked") {
    blockerRetries = app.blockerRetries + 1;
    await db
      .update(applications)
      .set({ blockerRetries, updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
    // Bounded retries: once the extension has exhausted its attempts, hand it
    // back to the user with a notification.
    if (blockerRetries >= 3) {
      await db.execute(
        sql`select graphile_worker.add_job('send_blocker_notice', json_build_object('applicationId', ${applicationId}::int, 'detail', ${detail ?? null}::text))`,
      );
    }
  }
  // "failed" → no state change; the popup already surfaced the reason.

  return NextResponse.json({ ok: true, blockerRetries }, { headers: ASSIST_CORS });
}
