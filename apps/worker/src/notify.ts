import {
  applications,
  db,
  digestQueue,
  eq,
  notificationLog,
  postings,
  settings,
} from "@tracker/db";
import { inQuietHours, isWatchedCompany, passesNotificationRules, type NotificationRules } from "@tracker/shared";
import { sendPush } from "./channels/push.js";
import { sendEmail } from "./channels/email.js";
import { sendSms } from "./channels/sms.js";
import { renderPostingEmail, type EmailPosting } from "./email-template.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

const DEFAULTS = {
  timezone: "America/New_York",
  quietHoursStart: 23,
  quietHoursEnd: 7,
  channels: { push: true, email: true, sms: false },
  includeNewGrad: false,
  notificationRules: null as NotificationRules | null,
  watchlistCompanies: [] as string[],
  digestHours: [8, 17] as number[],
  lastDigestSentAt: null as Date | null,
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
    watchlistCompanies: row.watchlistCompanies,
    digestHours: row.digestHours,
    lastDigestSentAt: row.lastDigestSentAt,
  };
}

/** Map a postings row to the shape the email templates render. */
export function toEmailPosting(p: {
  id: number;
  company: string;
  title: string;
  url: string;
  locations: string[];
  roleType: string;
  jobLevel: string;
  locationMode: string;
}): EmailPosting {
  return {
    id: p.id,
    company: p.company,
    title: p.title,
    url: p.url,
    locations: p.locations,
    roleType: p.roleType,
    jobLevel: p.jobLevel,
    locationMode: p.locationMode,
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

type Channel = "push" | "email" | "sms";

/**
 * Fan a message out to enabled channels and log each delivery.
 * - `opts.only` restricts to a subset of channels (still gated by the user's prefs).
 * - `opts.emailHtml` supplies rich HTML (Simplify-style) instead of the plain fallback.
 */
export async function deliver(
  msg: Sendable,
  opts?: { only?: Channel[]; emailHtml?: string },
): Promise<void> {
  const prefs = await getSettings();
  const allow = (ch: Channel) => (!opts?.only || opts.only.includes(ch)) && prefs.channels[ch];
  const sends: { channel: Channel; ok: boolean }[] = [];

  if (allow("push")) {
    sends.push({ channel: "push", ok: await sendPush({ title: msg.title, body: msg.body, url: msg.url }) });
  }
  if (allow("email")) {
    const html = opts?.emailHtml ?? `<p>${msg.body}</p><p><a href="${msg.url}">Open in Internships</a></p>`;
    sends.push({ channel: "email", ok: await sendEmail(msg.title, html) });
  }
  if (allow("sms")) {
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
 * New-posting entry point. Email is batched into the twice-daily digest to avoid
 * inbox spam; the exception is a **watchlisted company**, which alerts instantly
 * on every channel. Push/SMS stay instant for everything (but respect quiet hours).
 */
export async function onNewPosting(postingId: number): Promise<void> {
  const [p] = await db.select().from(postings).where(eq(postings.id, postingId)).limit(1);
  if (!p || p.status !== "active") return;

  const prefs = await getSettings();
  if (!passesNotificationRules(p, prefs.notificationRules, prefs.includeNewGrad)) return;

  const msg: Sendable = {
    title: `${p.company} — new internship`,
    body: `${p.title}${p.locations[0] ? ` · ${p.locations[0]}` : ""}`,
    url: `${APP_URL}/internships/${p.id}`,
    kind: "instant",
    postingId: p.id,
  };

  // Watchlisted company → instant on every enabled channel (rich single-posting
  // email), bypassing both the digest and quiet hours ("apply early").
  if (isWatchedCompany(p.company, prefs.watchlistCompanies)) {
    const email = renderPostingEmail(toEmailPosting(p), APP_URL);
    await deliver({ ...msg, title: email.subject }, { emailHtml: email.html });
    return;
  }

  // Everyone else: the email goes into the twice-daily digest queue...
  if (prefs.channels.email) {
    await db.insert(digestQueue).values({ postingId });
  }
  // ...while push/SMS still fire instantly, unless it's quiet hours.
  if (!inQuietHours(new Date(), prefs.timezone, prefs.quietHoursStart, prefs.quietHoursEnd)) {
    await deliver(msg, { only: ["push", "sms"] });
  }
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
