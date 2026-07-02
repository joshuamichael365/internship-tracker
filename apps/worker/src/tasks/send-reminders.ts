import type { Task } from "graphile-worker";
import { and, applications, db, eq, isNull, lt, reminders, sql } from "@tracker/db";
import { deliver } from "../notify.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/** Fires due, un-notified reminders (OA deadlines, follow-ups). Runs every 5 min. */
export const sendReminders: Task = async (_payload, { logger }) => {
  const due = await db
    .select({
      id: reminders.id,
      label: reminders.label,
      applicationId: reminders.applicationId,
      company: applications.company,
      roleTitle: applications.roleTitle,
    })
    .from(reminders)
    .innerJoin(applications, eq(reminders.applicationId, applications.id))
    .where(and(eq(reminders.done, false), isNull(reminders.notifiedAt), lt(reminders.dueAt, sql`now()`)));

  for (const r of due) {
    await deliver({
      title: `Reminder: ${r.label}`,
      body: `${r.company} — ${r.roleTitle}`,
      url: `${APP_URL}/tracker/${r.applicationId}`,
      kind: "instant",
      applicationId: r.applicationId,
    });
    await db.update(reminders).set({ notifiedAt: new Date() }).where(eq(reminders.id, r.id));
  }
  if (due.length > 0) logger.info(`sent ${due.length} reminder(s)`);
};
