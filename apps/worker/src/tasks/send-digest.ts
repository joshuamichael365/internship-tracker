import type { Task } from "graphile-worker";
import { db, digestQueue, eq, inArray, isNull, postings, settings } from "@tracker/db";
import { digestSlotDue } from "@tracker/shared";
import { deliver, getSettings, toEmailPosting } from "../notify.js";
import { renderDigestEmail } from "../email-template.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Runs every 5 minutes. Flushes the queued email postings as one Simplify-style
 * digest at each configured send hour (default 8am + 5pm in the user's timezone),
 * once per slot. Postings queued between slots accumulate and go out together.
 */
export const sendDigest: Task = async (_payload, { logger }) => {
  const prefs = await getSettings();
  if (!digestSlotDue(new Date(), prefs.timezone, prefs.digestHours, prefs.lastDigestSentAt)) return;

  // Stamp the slot immediately so a slow send can't double-fire on the next tick.
  await db.update(settings).set({ lastDigestSentAt: new Date() }).where(eq(settings.id, true));

  const queued = await db.select().from(digestQueue).where(isNull(digestQueue.sentAt));
  if (queued.length === 0) {
    logger.info("digest slot due but queue empty");
    return;
  }

  const rows = await db
    .select()
    .from(postings)
    .where(inArray(postings.id, queued.map((q) => q.postingId)));
  const active = rows.filter((p) => p.status === "active");

  if (active.length > 0) {
    const { subject, html } = renderDigestEmail(active.map(toEmailPosting), APP_URL);
    // The digest is email-only — push/SMS already fired instantly when each posting arrived.
    await deliver(
      { title: subject, body: `${active.length} new posting(s)`, url: `${APP_URL}/internships`, kind: "digest" },
      { only: ["email"], emailHtml: html },
    );
  }

  for (const q of queued) {
    await db.update(digestQueue).set({ sentAt: new Date() }).where(eq(digestQueue.id, q.id));
  }
  logger.info(`digest flushed: ${active.length} posting(s)`);
};
