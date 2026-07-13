import Link from "next/link";
import { AlertTriangle, Bell, CheckCircle2, Circle, ClipboardList, Puzzle, Sparkles } from "lucide-react";
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
  profile,
  reminders,
  resumes,
  sql,
  writingSamples,
} from "@tracker/db";
import { auth } from "@/auth";
import { Card } from "@/components/ui";
import { PostingCard } from "@/components/posting-card";
import { FadeIn, StaggerGrid } from "@/components/motion";
import { greeting, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Tiny inline trend line for the hero tile — 7 daily posting counts. */
function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(1, ...data);
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${28 - (v / max) * 24}`)
    .join(" ");
  return (
    <svg width="112" height="34" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function Dashboard() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [session, [newToday], [activeApps], [dueSoon], dailyRows, latest, dueReminders, blocked, [prof], [sampleRow], [resumeRow]] =
    await Promise.all([
      auth(),
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
      // Daily new-posting counts for the last 7 days — feeds the hero sparkline.
      db.execute<{ d: string; n: number }>(
        sql`select to_char(date_trunc('day', ${postings.firstSeenAt}), 'YYYY-MM-DD') d, count(*)::int n
            from ${postings}
            where ${postings.status} = 'active' and ${postings.firstSeenAt} > now() - interval '7 days'
            group by 1 order by 1`,
      ),
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
      // First-run setup checklist inputs.
      db.select().from(profile).limit(1),
      db.select({ n: count() }).from(writingSamples).limit(1),
      db.select({ n: count() }).from(resumes).limit(1),
    ]);

  const profileData = (prof?.data ?? {}) as Record<string, string>;
  const displayName = session?.user?.name || profileData.fullName || null;
  const headerTitle = greeting(displayName);

  // Build a 7-slot daily series, filling any gap days with 0.
  const dayMap = new Map([...dailyRows].map((r) => [r.d, Number(r.n)]));
  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
    return dayMap.get(d.toISOString().slice(0, 10)) ?? 0;
  });

  const setupSteps = [
    { key: "profile", label: "Fill your auto-fill profile", href: "/profile", done: !!profileData.fullName },
    { key: "samples", label: "Add writing samples", href: "/profile", done: (sampleRow?.n ?? 0) > 0 },
    { key: "resume", label: "Upload a resume", href: "/profile", done: (resumeRow?.n ?? 0) > 0 },
  ];
  const setupComplete = setupSteps.every((s) => s.done);

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

  const tileBase =
    "flex h-full flex-col justify-between rounded-2xl bg-surface p-4 shadow-card transition-shadow hover:shadow-raised";

  return (
    <>
      {/* Bento hero: greeting + headline metric alongside two stat tiles. */}
      <FadeIn className="mb-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <Link href="/internships" className="group">
          <div className="flex h-full flex-col justify-between rounded-2xl bg-surface p-5 shadow-card transition-shadow group-hover:shadow-raised">
            <div>
              <h1 className="text-[19px] font-bold tracking-tight">{headerTitle}</h1>
              <p className="mt-1 text-[14px] text-secondary">
                {attention.length > 0
                  ? `${attention.length} thing${attention.length === 1 ? "" : "s"} need you today`
                  : "You're all caught up today"}
              </p>
            </div>
            <div className="mt-8 flex items-end justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-secondary">New in last 24h</p>
                <p className="mt-1 text-[40px] font-bold leading-none tracking-tight text-accent">
                  {newToday?.n ?? 0}
                </p>
              </div>
              <Sparkline data={daily} />
            </div>
          </div>
        </Link>

        <div className="grid grid-rows-2 gap-4">
          <Link href="/tracker" className="group">
            <div className={tileBase}>
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-secondary">Active applications</p>
                <ClipboardList className="h-4 w-4 text-accent" />
              </div>
              <div>
                <p className="text-[26px] font-bold tracking-tight">{activeApps?.n ?? 0}</p>
                <p className="text-[12px] text-tertiary">in progress</p>
              </div>
            </div>
          </Link>
          <div className={tileBase}>
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-secondary">Reminders this week</p>
              <Bell className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className={`text-[26px] font-bold tracking-tight ${dueReminders.length > 0 ? "text-warning" : ""}`}>
                {dueSoon?.n ?? 0}
              </p>
              <p className="text-[12px] text-tertiary">
                {dueReminders.length > 0 ? `${dueReminders.length} due now` : "nothing overdue"}
              </p>
            </div>
          </div>
        </div>
      </FadeIn>

      {!setupComplete && (
        <Card className="mb-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="text-[15px] font-semibold">Get set up</h2>
          </div>
          <ul className="grid gap-2.5">
            {setupSteps.map((s) => (
              <li key={s.key} className="flex items-center gap-2.5 text-[14px]">
                {s.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-tertiary" />
                )}
                {s.done ? (
                  <span className="text-secondary line-through">{s.label}</span>
                ) : (
                  <Link href={s.href} className="font-medium text-accent hover:underline">
                    {s.label}
                  </Link>
                )}
              </li>
            ))}
            <li className="flex items-center gap-2.5 text-[14px]">
              <Circle className="h-4 w-4 shrink-0 text-tertiary" />
              <span className="flex items-center gap-1.5 text-secondary">
                <Puzzle className="h-3.5 w-3.5 shrink-0" />
                Load the Chrome extension — see the{" "}
                <a
                  href="https://github.com/joshuamichael365/internship-tracker#readme"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent hover:underline"
                >
                  README
                </a>
              </span>
            </li>
          </ul>
        </Card>
      )}

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
