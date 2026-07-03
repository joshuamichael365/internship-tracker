import { Plus } from "lucide-react";
import { applications, db, desc, eq, reminders } from "@tracker/db";
import { addManualApplication } from "@/app/actions/applications";
import { PageHeader } from "@/components/ui";
import { TrackerBoard, type Stage, type TrackerCard } from "@/components/tracker-board";

export const metadata = { title: "Tracker" };
export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const [apps, rems] = await Promise.all([
    db.select().from(applications).orderBy(desc(applications.updatedAt)),
    db.select().from(reminders).where(eq(reminders.done, false)),
  ]);

  const weekOut = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const cards: TrackerCard[] = apps.map((a) => ({
    id: a.id,
    company: a.company,
    roleTitle: a.roleTitle,
    location: a.location,
    url: a.url,
    mode: a.mode,
    stage: a.stage as Stage,
    appliedAt: a.appliedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    dueSoon: rems
      .filter((r) => r.applicationId === a.id && r.dueAt.getTime() < weekOut)
      .sort((x, y) => x.dueAt.getTime() - y.dueAt.getTime())
      .map((r) => ({ label: r.label, dueAt: r.dueAt.toISOString() })),
  }));

  return (
    <>
      <PageHeader
        title="Tracker"
        subtitle="Every application, its stage, and its automation mode — always explicit"
      />

      <details className="group mb-5">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-xl bg-accent-soft px-3.5 py-2 text-[14px] font-medium text-accent transition-opacity hover:opacity-80">
          <Plus className="h-4 w-4" /> Add application by link
        </summary>
        <form
          action={addManualApplication}
          className="mt-3 grid max-w-2xl gap-3 rounded-2xl bg-surface p-4 shadow-card sm:grid-cols-2"
        >
          <label className="grid gap-1 text-[13px] font-medium sm:col-span-2">
            Posting / careers URL
            <input
              name="url"
              required
              type="url"
              placeholder="https://…"
              className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal"
            />
          </label>
          <label className="grid gap-1 text-[13px] font-medium">
            Company <span className="font-normal text-tertiary">(auto-detected if blank)</span>
            <input name="company" className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal" />
          </label>
          <label className="grid gap-1 text-[13px] font-medium">
            Role <span className="font-normal text-tertiary">(auto-detected if blank)</span>
            <input name="roleTitle" className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal" />
          </label>
          <label className="grid gap-1 text-[13px] font-medium">
            Location
            <input name="location" className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal" />
          </label>
          <div className="flex items-end">
            <button className="rounded-xl bg-accent px-4 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90">
              Add to tracker
            </button>
          </div>
        </form>
      </details>

      <TrackerBoard cards={cards} />
    </>
  );
}
