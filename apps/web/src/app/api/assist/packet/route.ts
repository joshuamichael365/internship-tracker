import path from "node:path";
import { NextResponse } from "next/server";
import { applications, db, desc, documents, eq, profile, settings } from "@tracker/db";
import { resolveResumeForApplication, resumeFilename } from "@/lib/resolve-resume";
import { ASSIST_CORS, assistAuthorized, assistPreflight } from "@/lib/extension-auth";

/** The Chrome extension's data source — bearer-token auth, session-free. */

export function OPTIONS() {
  return assistPreflight();
}

export async function GET(req: Request) {
  if (!assistAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: ASSIST_CORS });
  }

  const url = new URL(req.url).searchParams.get("url") ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400, headers: ASSIST_CORS });
  }

  // Match the active tab to a tracked application by URL, then hostname.
  const apps = await db.select().from(applications).orderBy(desc(applications.updatedAt));
  const match =
    apps.find((a) => a.url && url.startsWith(a.url.split("?")[0]!)) ??
    apps.find((a) => {
      try {
        return new URL(a.url).hostname === host;
      } catch {
        return false;
      }
    });

  if (!match) return NextResponse.json({ match: null }, { headers: ASSIST_CORS });

  // Master Auto-Apply kill switch (default off). When disabled, no application
  // may submit regardless of its per-application opt-in: downgrade auto → assist
  // (the extension still fills, but never submits) and report not-approved. This
  // is the authoritative submission gate — the extension can't override it.
  const [prefs] = await db.select().from(settings).limit(1);
  const autoApplyEnabled = prefs?.autoApplyEnabled ?? false;
  const effectiveMode = match.mode === "auto" && !autoApplyEnabled ? "assist" : match.mode;
  const autoApplyApproved = effectiveMode === "auto" && !!match.autoApplyApprovedAt;

  const [prof] = await db.select().from(profile).limit(1);
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, match.id))
    .orderBy(desc(documents.createdAt));
  const coverLetterDoc = docs.find((d) => d.kind === "cover_letter");
  const resume = await resolveResumeForApplication(match.resumeId);

  return NextResponse.json(
    {
      match: {
        applicationId: match.id,
        company: match.company,
        roleTitle: match.roleTitle,
        mode: effectiveMode,
        drafts: match.drafts ?? {},
        autoApply: { approved: autoApplyApproved },
        coverLetterPdfUrl: coverLetterDoc ? `/api/assist/document/${coverLetterDoc.id}` : null,
        resumePdfUrl: resume ? `/api/assist/resume?applicationId=${match.id}` : null,
        resumeFilename: resume ? resumeFilename(resume) : null,
      },
      profile: prof?.data ?? {},
    },
    { headers: ASSIST_CORS },
  );
}
