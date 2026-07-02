import Link from "next/link";
import { and, applications, count, db, desc, eq, gte, inArray, postings, reminders, sql } from "@tracker/db";
import { Card, PageHeader } from "@/components/ui";
import { PostingCard } from "@/components/posting-card";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [[newToday], [activeApps], [dueSoon], latest] = await Promise.all([
    db
      .select({ n: count() })
      .from(postings)
      .where(and(eq(postings.status, "active"), gte(postings.firstSeenAt, dayAgo))),
    db
      .select({ n: count() })
      .from(applications)
      .where(inArray(applications.stage, ["saved", "in_progress", "applied", "assessment", "interviewing"])),
    db
      .select({ n: count() })
      .from(reminders)
      .where(and(eq(reminders.done, false), sql`${reminders.dueAt} < now() + interval '7 days'`)),
    db
      .select()
      .from(postings)
      .where(eq(postings.status, "active"))
      .orderBy(desc(postings.firstSeenAt))
      .limit(6),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="New postings, active applications, and upcoming deadlines at a glance"
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Link href="/internships">
          <Card className="transition-shadow hover:shadow-raised">
            <p className="text-[13px] font-medium text-secondary">New in last 24h</p>
            <p className="mt-1 text-[34px] font-bold tracking-tight">{newToday?.n ?? 0}</p>
          </Card>
        </Link>
        <Link href="/tracker">
          <Card className="transition-shadow hover:shadow-raised">
            <p className="text-[13px] font-medium text-secondary">Active applications</p>
            <p className="mt-1 text-[34px] font-bold tracking-tight">{activeApps?.n ?? 0}</p>
          </Card>
        </Link>
        <Card>
          <p className="text-[13px] font-medium text-secondary">Reminders this week</p>
          <p className="mt-1 text-[34px] font-bold tracking-tight">{dueSoon?.n ?? 0}</p>
        </Card>
      </div>

      {latest.length > 0 && (
        <>
          <h2 className="mb-3 text-[17px] font-semibold">Latest postings</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {latest.map((p) => (
              <PostingCard key={p.id} posting={p} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
