import { applications, db, desc, eq, reminders } from "@tracker/db";
import { PageHeader } from "@/components/ui";
import { TrackerBoard, type Stage, type TrackerCard } from "@/components/tracker-board";
import { AddApplicationForm } from "@/components/add-application-form";

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

      <AddApplicationForm />

      <TrackerBoard cards={cards} />
    </>
  );
}
