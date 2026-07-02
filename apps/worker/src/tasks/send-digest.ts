import type { Task } from "graphile-worker";
import { db, digestQueue, eq, inArray, isNull, postings } from "@tracker/db";
import { inQuietHours } from "@tracker/shared";
import { deliver, getSettings } from "../notify.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Runs every 5 minutes. Postings queued during quiet hours are flushed as a
 * single morning digest the first tick after the window ends.
 */
export const sendDigest: Task = async (_payload, { logger }) => {
  const prefs = await getSettings();
  if (inQuietHours(new Date(), prefs.timezone, prefs.quietHoursStart, prefs.quietHoursEnd)) return;

  const queued = await db.select().from(digestQueue).where(isNull(digestQueue.sentAt));
  if (queued.length === 0) return;

  const rows = await db
    .select()
    .from(postings)
    .where(inArray(postings.id, queued.map((q) => q.postingId)));
  const active = rows.filter((p) => p.status === "active");

  if (active.length > 0) {
    const lines = active
      .slice(0, 15)
      .map((p) => `• ${p.company} — ${p.title}${p.locations[0] ? ` (${p.locations[0]})` : ""}`)
      .join("\n");
    const more = active.length > 15 ? `\n…and ${active.length - 15} more` : "";
    await deliver({
      title: `${active.length} new internship${active.length === 1 ? "" : "s"} overnight`,
      body: `${lines}${more}`,
      url: `${APP_URL}/internships`,
      kind: "digest",
    });
  }

  for (const q of queued) {
    await db.update(digestQueue).set({ sentAt: new Date() }).where(eq(digestQueue.id, q.id));
  }
  logger.info(`digest flushed: ${active.length} posting(s)`);
};
