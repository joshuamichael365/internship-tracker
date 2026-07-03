import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { applications, db, eq, postings, profile, reminders, resumes } from "@tracker/db";
import { ApplicationEditor } from "@/components/application-editor";
import { AssistPanel } from "@/components/assist-panel";
import { CompanyLogo } from "@/components/company-logo";
import { Card, ModeBadge } from "@/components/ui";
import type { Stage } from "@/components/tracker-board";
import { timeAgo } from "@/lib/format";
import { recommendMode, type ModeRecommendation } from "@/lib/recommendation";

export const dynamic = "force-dynamic";

export default async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const [app] = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
  if (!app) notFound();

  // Compute (and persist) the mode recommendation once per application.
  let recommendation = app.modeRecommendation as ModeRecommendation | null;
  if (!recommendation?.recommended) {
    recommendation = await recommendMode(id);
    await db
      .update(applications)
      .set({ modeRecommendation: recommendation as unknown as Record<string, unknown> })
      .where(eq(applications.id, id));
  }

  const [rems, allResumes, posting, [prof]] = await Promise.all([
    db.select().from(reminders).where(eq(reminders.applicationId, id)),
    db.select({ id: resumes.id, name: resumes.name }).from(resumes),
    app.postingId
      ? db.select().from(postings).where(eq(postings.id, app.postingId)).limit(1)
      : Promise.resolve([]),
    db.select().from(profile).limit(1),
  ]);

  const resumeName = allResumes.find((r) => r.id === app.resumeId)?.name ?? null;

  return (
    <>
      <Link
        href="/tracker"
        className="mb-4 inline-flex items-center gap-1 text-[14px] font-medium text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> Tracker
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <CompanyLogo company={app.company} url={app.url} size="lg" />
          <div>
            <p className="text-[15px] font-medium text-secondary">{app.company}</p>
            <h1 className="mt-0.5 text-[26px] font-bold leading-tight tracking-tight">
              {app.roleTitle}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-tertiary">
              <ModeBadge mode={app.mode} />
              {app.location && <span>{app.location}</span>}
              <span>added {timeAgo(app.createdAt)}</span>
              {app.appliedAt && <span>· applied {timeAgo(app.appliedAt)}</span>}
            </div>
          </div>
        </div>
        <a
          href={app.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
        >
          Open portal <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-4">
          {posting[0]?.description && (
            <Card>
              <h2 className="mb-2 text-[15px] font-semibold">Posting description</h2>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-secondary">
                {posting[0].description}
              </p>
            </Card>
          )}
          {app.mode === "assist" ? (
            <AssistPanel applicationId={app.id} />
          ) : (
            <Card>
              <h2 className="mb-1 text-[15px] font-semibold">Agentic Assist</h2>
              <p className="text-[13px] text-secondary">
                {app.mode === "manual"
                  ? "Manual mode — you're handling this one yourself; the app just tracks it."
                  : "Choose Agentic Assist in the mode picker to draft a cover letter and short answers in your voice."}
              </p>
            </Card>
          )}
        </div>
        <ApplicationEditor
          data={{
            id: app.id,
            company: app.company,
            roleTitle: app.roleTitle,
            location: app.location,
            mode: app.mode,
            autoApplyApprovedAt: app.autoApplyApprovedAt?.toISOString() ?? null,
            stage: app.stage as Stage,
            notes: app.notes,
            resumeId: app.resumeId,
            reminders: rems.map((r) => ({
              id: r.id,
              label: r.label,
              dueAt: r.dueAt.toISOString(),
              done: r.done,
            })),
            resumes: allResumes,
            recommendation: recommendation as {
              recommended: "manual" | "assist";
              reasons: string[];
            } | null,
            autoApply: {
              profile: (prof?.data ?? {}) as Record<string, string>,
              drafts: app.drafts ?? {},
              resumeName,
            },
          }}
        />
      </div>
    </>
  );
}
