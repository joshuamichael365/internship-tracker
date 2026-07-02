import {
  applications,
  db,
  digestQueue,
  eq,
  notificationLog,
  postings,
  settings,
} from "@tracker/db";
import { inQuietHours, passesNotificationRules, type NotificationRules } from "@tracker/shared";
import { sendPush } from "./channels/push.js";
import { sendEmail } from "./channels/email.js";
import { sendSms } from "./channels/sms.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

const DEFAULTS = {
  timezone: "America/New_York",
  quietHoursStart: 23,
  quietHoursEnd: 7,
  channels: { push: true, email: true, sms: false },
  includeNewGrad: false,
  notificationRules: null as NotificationRules | null,
};

export async function getSettings() {
  const [row] = await db.select().from(settings).limit(1);
  if (!row) return DEFAULTS;
  return {
    timezone: row.timezone,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    channels: row.channels,
    includeNewGrad: row.includeNewGrad,
    notificationRules: (row.notificationRules ?? null) as NotificationRules | null,
  };
}

interface Sendable {
  title: string;
  body: string;
  url: string;
  kind: "instant" | "digest" | "confirmation" | "blocker";
  postingId?: number;
  applicationId?: number;
}

/** Fan a message out to every enabled channel and log each delivery. */
export async function deliver(msg: Sendable): Promise<void> {
  const prefs = await getSettings();
  const sends: { channel: "push" | "email" | "sms"; ok: boolean }[] = [];

  if (prefs.channels.push) {
    sends.push({ channel: "push", ok: await sendPush({ title: msg.title, body: msg.body, url: msg.url }) });
  }
  if (prefs.channels.email) {
    const html = `<p>${msg.body}</p><p><a href="${msg.url}">Open in Internships</a></p>`;
    sends.push({ channel: "email", ok: await sendEmail(msg.title, html) });
  }
  if (prefs.channels.sms) {
    sends.push({ channel: "sms", ok: await sendSms(`${msg.title}\n${msg.body}\n${msg.url}`) });
  }

  for (const s of sends.filter((s) => s.ok)) {
    await db.insert(notificationLog).values({
      postingId: msg.postingId,
      applicationId: msg.applicationId,
      channel: s.channel,
      kind: msg.kind,
      payload: { title: msg.title, body: msg.body, url: msg.url },
    });
  }
}

/**
 * New-posting entry point: rule check → instant delivery, or digest queue
 * during quiet hours.
 */
export async function onNewPosting(postingId: number): Promise<void> {
  const [p] = await db.select().from(postings).where(eq(postings.id, postingId)).limit(1);
  if (!p || p.status !== "active") return;

  const prefs = await getSettings();
  if (!passesNotificationRules(p, prefs.notificationRules, prefs.includeNewGrad)) return;

  if (inQuietHours(new Date(), prefs.timezone, prefs.quietHoursStart, prefs.quietHoursEnd)) {
    await db.insert(digestQueue).values({ postingId });
    return;
  }

  await deliver({
    title: `${p.company} — new internship`,
    body: `${p.title}${p.locations[0] ? ` · ${p.locations[0]}` : ""}`,
    url: `${APP_URL}/internships/${p.id}`,
    kind: "instant",
    postingId: p.id,
  });
}

/**
 * Submission receipt — fired whenever an application is marked applied,
 * whether by hand or (in Phase 2) by auto-apply.
 */
export async function onSubmissionConfirmed(applicationId: number): Promise<void> {
  const [a] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!a) return;
  await deliver({
    title: `Application submitted ✓`,
    body: `${a.company} — ${a.roleTitle}`,
    url: `${APP_URL}/tracker`,
    kind: "confirmation",
    applicationId: a.id,
  });
}
