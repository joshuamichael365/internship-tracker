import type { Task } from "graphile-worker";
import { applications, db, eq, ne, settings } from "@tracker/db";
import { normalizeCompany, refreshGoogleAccessToken } from "@tracker/shared";
import { classifyStatusSignal, getMessageMeta, listRecentMessageIds, type StatusSignal } from "../gmail-client.js";
import { deliver } from "../notify.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

// Same order as the applicationStage enum in packages/db/src/schema.ts. Defined
// locally — schema.ts only exports the Drizzle enum object, not a plain array,
// and duplicating seven literal strings is simpler than reshaping the export.
const STAGE_ORDER = ["saved", "in_progress", "applied", "assessment", "interviewing", "offer", "rejected"] as const;
type Stage = (typeof STAGE_ORDER)[number];
const rank = (s: Stage) => STAGE_ORDER.indexOf(s);

// A rejection can end any application at any point; every other signal only
// ever moves the pipeline forward, so a Gmail false-positive can't clobber
// further-along state the user (or a previous, more specific signal) already set.
const SIGNAL_TARGET: Partial<Record<StatusSignal, Stage>> = {
  confirmation: "applied",
  oa_invite: "assessment",
  interview_invite: "interviewing",
  offer: "offer",
  rejection: "rejected",
};

const SIGNAL_LABEL: Record<StatusSignal, string> = {
  confirmation: "application confirmation",
  oa_invite: "online assessment invite",
  interview_invite: "interview invite",
  offer: "offer",
  rejection: "rejection",
  none: "",
};

// First sync ever (gmailLastSyncAt null) looks back this far; every sync after
// that starts from the last sync time, with a small overlap to tolerate clock
// skew (harmless — matching is idempotent since it only ever moves forward).
const FIRST_SYNC_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;
const OVERLAP_MS = 5 * 60 * 1000;

/**
 * Runs every 15 minutes (P2-M2). Opt-in — no-ops entirely unless the user has
 * connected Gmail (settings.gmailEnabled + a stored refresh token). Polls only
 * for NEW messages since the last sync, matches candidates against tracked
 * applications by company name, classifies matches with Haiku, and moves stage
 * forward on a high-confidence signal. Never stores email content — only the
 * classification result, as a short note on the application.
 */
export const syncGmailStatus: Task = async (_payload, { logger }) => {
  const [prefs] = await db.select().from(settings).limit(1);
  if (!prefs?.gmailEnabled || !prefs.gmailRefreshToken) return;

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    logger.error("gmail sync: AUTH_GOOGLE_ID/SECRET not configured on the worker");
    return;
  }

  const since = prefs.gmailLastSyncAt
    ? new Date(prefs.gmailLastSyncAt.getTime() - OVERLAP_MS)
    : new Date(Date.now() - FIRST_SYNC_LOOKBACK_MS);
  const now = new Date();

  let accessToken: string;
  try {
    accessToken = await refreshGoogleAccessToken({ clientId, clientSecret }, prefs.gmailRefreshToken);
  } catch (err) {
    logger.error(`gmail sync: token refresh failed — ${(err as Error).message}`);
    return;
  }

  // Only match against applications a status signal could still meaningfully change.
  const tracked = await db.select().from(applications).where(ne(applications.stage, "rejected"));
  if (tracked.length === 0) {
    await db.update(settings).set({ gmailLastSyncAt: now }).where(eq(settings.id, true));
    return;
  }

  let messageIds: string[];
  try {
    messageIds = await listRecentMessageIds(accessToken, Math.floor(since.getTime() / 1000));
  } catch (err) {
    logger.error(`gmail sync: list failed — ${(err as Error).message}`);
    return;
  }

  let updated = 0;
  for (const id of messageIds) {
    const meta = await getMessageMeta(accessToken, id);
    if (!meta) continue;

    const haystack = `${meta.from} ${meta.subject}`.toLowerCase();
    // Guard against a company that normalizes to "" — includes("") is always
    // true, so an empty-normalizing app would shadow every real match. Skip
    // those in the find, not after, so a genuine later match isn't lost.
    const match = tracked.find((a) => {
      const norm = normalizeCompany(a.company);
      return norm && haystack.includes(norm);
    });
    if (!match) continue;

    const { signal, confidence } = await classifyStatusSignal({
      company: match.company,
      roleTitle: match.roleTitle,
      from: meta.from,
      subject: meta.subject,
      snippet: meta.snippet,
    });
    // meta (From/Subject/snippet) is discarded here — nothing from the email
    // itself survives past this point, only `signal`.
    if (signal === "none" || confidence !== "high") continue;

    const target = SIGNAL_TARGET[signal];
    if (!target) continue;
    const currentStage = match.stage as Stage;
    const isForwardMove = target === "rejected" || rank(target) > rank(currentStage);
    if (!isForwardMove) continue;

    const notePrefix = `[Gmail: ${SIGNAL_LABEL[signal]} detected, ${now.toLocaleDateString()}]`;
    await db
      .update(applications)
      .set({
        stage: target,
        appliedAt: match.appliedAt ?? (target !== "saved" && target !== "in_progress" ? now : match.appliedAt),
        notes: match.notes ? `${notePrefix}\n${match.notes}` : notePrefix,
        updatedAt: now,
      })
      .where(eq(applications.id, match.id));

    await deliver({
      title: `${match.company} — ${SIGNAL_LABEL[signal]}`,
      body: `${match.roleTitle} · detected from your Gmail`,
      url: `${APP_URL}/tracker/${match.id}`,
      kind: "instant",
      applicationId: match.id,
    });
    updated++;
    // Keep `tracked` consistent in case the same company matches a later message this run.
    match.stage = target;
  }

  await db.update(settings).set({ gmailLastSyncAt: now }).where(eq(settings.id, true));
  if (updated > 0 || messageIds.length > 0) {
    logger.info(`gmail sync: ${messageIds.length} message(s) checked, ${updated} application(s) updated`);
  }
};
