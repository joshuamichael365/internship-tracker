import Link from "next/link";
import { AlertTriangle, Bell, CheckCircle2, ClipboardList, Sparkles } from "lucide-react";
import {
  and,
  applications,
  count,
  db,
  desc,
  eq,
  gte,
  inArray,
  lt,
  postings,
  reminders,
  sql,
} from "@tracker/db";
import { Card, PageHeader } from "@/components/ui";
import { PostingCard } from "@/components/posting-card";
import { StaggerGrid } from "@/components/motion";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const now = new Date();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [[newToday], [activeApps], [dueSoon], latest, dueReminders, blocked] = await Promise.all([
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
    // Reminders that are due (or overdue) and not yet done.
    db
      .select({
        id: reminders.id,
        label: reminders.label,
        dueAt: reminders.dueAt,
        applicationId: reminders.applicationId,
        company: applications.company,
        roleTitle: applications.roleTitle,
      })
      .from(reminders)
      .leftJoin(applications, eq(reminders.applicationId, applications.id))
      .where(and(eq(reminders.done, false), lt(reminders.dueAt, now)))
      .orderBy(reminders.dueAt)
      .limit(8),
    // Applications whose auto-apply hit the blocker-retry ceiling.
    db
      .select({
        id: applications.id,
        company: applications.company,
        roleTitle: applications.roleTitle,
        blockerRetries: applications.blockerRetries,
      })
      .from(applications)
      .where(gte(applications.blockerRetries, 3))
      .limit(8),
  ]);

  const attention = [
    ...dueReminders.map((r) => ({
      id: `rem-${r.id}`,
      appId: r.applicationId,
      icon: "reminder" as const,
      title: r.label,
      subtitle: `${r.company ?? "Reminder"}${r.roleTitle ? ` · ${r.roleTitle}` : ""} · due ${timeAgo(r.dueAt)}`,
    })),
    ...blocked.map((b) => ({
      id: `blk-${b.id}`,
      appId: b.id,
      icon: "blocker" as const,
      title: `Auto-apply blocked — ${b.company}`,
      subtitle: `${b.roleTitle} · needs your attention (${b.blockerRetries} retries)`,
    })),
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="New postings, active applications, and upcoming deadlines at a glance"
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Link href="/internships">
          <Card className="transition-shadow hover:shadow-raised">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-secondary">New in last 24h</p>
              <Sparkles className="h-4 w-4 text-accent" />
            </div>
            <p className="mt-1 text-[34px] font-bold tracking-tight">{newToday?.n ?? 0}</p>
            <p className="text-[12px] font-medium text-success">
              +{newToday?.n ?? 0} today
            </p>
          </Card>
        </Link>
        <Link href="/tracker">
          <Card className="transition-shadow hover:shadow-raised">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-secondary">Active applications</p>
              <ClipboardList className="h-4 w-4 text-accent" />
            </div>
            <p className="mt-1 text-[34px] font-bold tracking-tight">{activeApps?.n ?? 0}</p>
            <p className="text-[12px] font-medium text-tertiary">in progress</p>
          </Card>
        </Link>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-secondary">Reminders this week</p>
            <Bell className="h-4 w-4 text-warning" />
          </div>
          <p className="mt-1 text-[34px] font-bold tracking-tight">{dueSoon?.n ?? 0}</p>
          <p className="text-[12px] font-medium text-tertiary">
            {dueReminders.length > 0 ? `${dueReminders.length} due now` : "nothing overdue"}
          </p>
        </Card>
      </div>

      <Card className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <h2 className="text-[15px] font-semibold">Needs attention</h2>
          {attention.length > 0 && (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-warning">
              {attention.length}
            </span>
          )}
        </div>
        {attention.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-[13px] text-secondary">
            <CheckCircle2 className="h-4 w-4 text-success" />
            You&apos;re all caught up — no overdue reminders or blocked applications.
          </div>
        ) : (
          <ul className="divide-y divide-separator">
            {attention.map((a) => {
              const row = (
                <div className="flex items-center gap-3 py-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      a.icon === "blocker"
                        ? "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger"
                        : "bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-warning"
                    }`}
                  >
                    {a.icon === "blocker" ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <Bell className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{a.title}</p>
                    <p className="truncate text-[12px] text-tertiary">{a.subtitle}</p>
                  </div>
                </div>
              );
              return (
                <li key={a.id}>
                  {a.appId ? (
                    <Link href={`/tracker/${a.appId}`} className="block hover:opacity-80">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {latest.length > 0 && (
        <>
          <h2 className="mb-3 text-[17px] font-semibold">Latest postings</h2>
          <StaggerGrid className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {latest.map((p) => (
              <PostingCard key={p.id} posting={p} />
            ))}
          </StaggerGrid>
        </>
      )}
    </>
  );
}
