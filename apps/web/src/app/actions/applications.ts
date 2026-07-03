"use server";

import { revalidatePath } from "next/cache";
import { applications, db, eq, reminders } from "@tracker/db";
import { type ApplicationStage } from "@tracker/shared";
import { onApplied } from "@/lib/applied-side-effects";

function refresh() {
  revalidatePath("/tracker");
  revalidatePath("/");
}

export async function updateStage(id: number, stage: ApplicationStage) {
  const [app] = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
  if (!app) return;
  const wasApplied = app.appliedAt !== null;

  await db
    .update(applications)
    .set({
      stage,
      updatedAt: new Date(),
      ...(stage === "applied" && !wasApplied ? { appliedAt: new Date() } : {}),
    })
    .where(eq(applications.id, id));

  // First transition into "applied": fire the submission receipt and hide
  // matching active postings so reposts stop showing/notifying.
  if (stage === "applied" && !wasApplied) {
    await onApplied(id, app.company, app.roleTitle);
  }
  refresh();
}

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|.*\.(internal|local)$)/i;

/** Only fetch public http(s) URLs — never internal/metadata addresses. */
function safeToFetch(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (PRIVATE_HOST_RE.test(u.hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function addManualApplication(formData: FormData) {
  const url = String(formData.get("url") ?? "").trim();
  let company = String(formData.get("company") ?? "").trim();
  let roleTitle = String(formData.get("roleTitle") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  if (!url) return;

  // Paste-a-link flow: try to fill company/role from the page title.
  if ((!company || !roleTitle) && safeToFetch(url)) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: { "user-agent": "internship-tracker (personal job-search tool)" },
      });
      const html = (await res.text()).slice(0, 100_000);
      const title =
        html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ??
        html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ??
        "";
      const parts = title.split(/\s+[-–|@]\s+/);
      if (!roleTitle) roleTitle = (parts[0] ?? "").trim() || "Untitled role";
      if (!company) company = (parts[1] ?? "").trim() || new URL(url).hostname.replace(/^www\./, "");
    } catch {
      if (!roleTitle) roleTitle = "Untitled role";
      if (!company) company = new URL(url).hostname.replace(/^www\./, "");
    }
  }

  if (!roleTitle) roleTitle = "Untitled role";
  if (!company) {
    try {
      company = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      company = "Unknown";
    }
  }

  await db.insert(applications).values({
    company,
    roleTitle,
    location: location || null,
    url,
    stage: "saved",
  });
  refresh();
}

export async function updateApplication(
  id: number,
  fields: { notes?: string; resumeId?: number | null; company?: string; roleTitle?: string; location?: string },
) {
  await db
    .update(applications)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(applications.id, id));
  revalidatePath(`/tracker/${id}`);
  refresh();
}

export async function setApplicationMode(id: number, mode: "manual" | "assist" | "auto" | null) {
  const [app] = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
  if (!app) return;
  // Any move away from 'auto' revokes a standing auto-apply approval. Auto is
  // only ever set through approveAutoApply, never here.
  await db
    .update(applications)
    .set({
      mode,
      updatedAt: new Date(),
      ...(mode !== "auto" ? { autoApplyApprovedAt: null } : {}),
    })
    .where(eq(applications.id, id));

  // Record recommendation-vs-choice so the recommender can learn override patterns.
  const rec = app.modeRecommendation as { recommended?: string; signals?: unknown } | null;
  if (mode && rec?.recommended) {
    const { modeDecisions } = await import("@tracker/db");
    await db.insert(modeDecisions).values({
      applicationId: id,
      recommended: rec.recommended as "manual" | "assist" | "auto",
      chosen: mode,
      signals: (rec.signals ?? {}) as Record<string, unknown>,
    });
  }
  revalidatePath(`/tracker/${id}`);
  refresh();
}

/**
 * Full Auto-Apply opt-in. Only reached through the pre-submit preview + explicit
 * checkbox in auto-apply-optin.tsx — mode 'auto' is never set any other way.
 * Per-application and revocable (setApplicationMode clears the approval).
 */
export async function approveAutoApply(id: number) {
  const [app] = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
  if (!app) return;
  await db
    .update(applications)
    .set({ mode: "auto", autoApplyApprovedAt: new Date(), blockerRetries: 0, updatedAt: new Date() })
    .where(eq(applications.id, id));

  const rec = app.modeRecommendation as { recommended?: string; signals?: unknown } | null;
  if (rec?.recommended) {
    const { modeDecisions } = await import("@tracker/db");
    await db.insert(modeDecisions).values({
      applicationId: id,
      recommended: rec.recommended as "manual" | "assist" | "auto",
      chosen: "auto",
      signals: (rec.signals ?? {}) as Record<string, unknown>,
    });
  }
  revalidatePath(`/tracker/${id}`);
  refresh();
}

export async function deleteApplication(id: number) {
  await db.delete(applications).where(eq(applications.id, id));
  refresh();
}

export async function addReminder(applicationId: number, label: string, dueAt: string) {
  const due = new Date(dueAt);
  if (isNaN(due.getTime()) || !label.trim()) return;
  await db.insert(reminders).values({ applicationId, label: label.trim(), dueAt: due });
  revalidatePath(`/tracker/${applicationId}`);
  refresh();
}

export async function toggleReminder(id: number, done: boolean) {
  await db.update(reminders).set({ done }).where(eq(reminders.id, id));
  refresh();
}

export async function deleteReminder(id: number) {
  await db.delete(reminders).where(eq(reminders.id, id));
  refresh();
}
