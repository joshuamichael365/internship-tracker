import {
  applications,
  count,
  db,
  eq,
  inArray,
  modeDecisions,
  not,
  notificationLog,
  postings,
  sources,
  sql,
} from "@tracker/db";
import {
  BarChart3,
  Bell,
  ClipboardList,
  Database,
  GitCompare,
  Search,
  Send,
  TrendingUp,
} from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { type Stage } from "@/components/tracker-board";
import { timeAgo } from "@/lib/format";

/**
 * Canonical ordered stage list. Defined locally rather than imported from
 * tracker-board.tsx: that's a "use client" module, and importing a plain data
 * const from a client module into this server component turns it into a client
 * reference (STAGE_LIST.map would throw at runtime). The `Stage` type import is
 * type-only, so it's erased and safe.
 */
const STAGE_LIST: readonly [Stage, string][] = [
  ["saved", "Saved"],
  ["in_progress", "In Progress"],
  ["applied", "Applied"],
  ["assessment", "Assessment / OA"],
  ["interviewing", "Interviewing"],
  ["offer", "Offer"],
  ["rejected", "Rejected"],
];

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

/**
 * Mirrors tracker-board.tsx's STAGE_DOT/STAGE_VAR — those consts aren't exported (tracker-board is
 * a client component and out of scope here), so the stage → color mapping is duplicated deliberately
 * to keep this page a pure, read-only server component.
 */
const STAGE_VAR: Record<Stage, string> = {
  saved: "--text-tertiary",
  in_progress: "--accent",
  applied: "--success",
  assessment: "--warning",
  interviewing: "--purple",
  offer: "--success",
  rejected: "--danger",
};

const MODE_VAR: Record<string, string> = {
  manual: "--text-tertiary",
  assist: "--accent",
  auto: "--purple",
  unset: "--text-tertiary",
};

const MODE_LABEL: Record<string, string> = {
  manual: "Manual",
  assist: "Assisted",
  auto: "Auto-Apply",
  unset: "Not chosen",
};

/** One labeled horizontal proportion bar — width is this row's share of `total`. */
function BarRow({
  label,
  value,
  total,
  colorVar,
  dashed = false,
}: {
  label: string;
  value: number;
  total: number;
  colorVar: string;
  dashed?: boolean;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="flex w-[132px] shrink-0 items-center gap-1.5 truncate text-[13px] text-secondary">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${dashed ? "border border-dashed" : ""}`}
          style={
            dashed
              ? { borderColor: `var(${colorVar})`, background: "transparent" }
              : { background: `var(${colorVar})` }
          }
        />
        {label}
      </span>
      <div className="h-2 flex-1 rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${pct}%`, background: `var(${colorVar})` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums text-secondary">
        {value} <span className="text-tertiary">({pct}%)</span>
      </span>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  caption,
  tone = "accent",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  caption: string;
  tone?: "accent" | "success" | "tertiary";
}) {
  const toneClass = tone === "success" ? "text-success" : tone === "tertiary" ? "text-tertiary" : "text-accent";
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-secondary">{label}</p>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </div>
      <p className="mt-1 text-[34px] font-bold tracking-tight">{value}</p>
      <p className="text-[12px] font-medium text-tertiary">{caption}</p>
    </Card>
  );
}

export default async function AnalyticsPage() {
  const [
    [totalAppsRow],
    [appliedPlusRow],
    [activePostingsRow],
    [appliedDenomRow],
    [respondedRow],
    stageRows,
    modeRows,
    [decisionsOverall],
    decisionsByAts,
    notifKindRows,
    notifChannelRows,
    postingStatusRows,
    sourceRows,
  ] = await Promise.all([
    db.select({ n: count() }).from(applications),
    db.select({ n: count() }).from(applications).where(not(inArray(applications.stage, ["saved", "in_progress"]))),
    db.select({ n: count() }).from(postings).where(eq(postings.status, "active")),
    db
      .select({ n: count() })
      .from(applications)
      .where(inArray(applications.stage, ["applied", "assessment", "interviewing", "offer", "rejected"])),
    db
      .select({ n: count() })
      .from(applications)
      .where(inArray(applications.stage, ["interviewing", "offer", "rejected"])),
    db.select({ stage: applications.stage, n: count() }).from(applications).groupBy(applications.stage),
    db.select({ mode: applications.mode, n: count() }).from(applications).groupBy(applications.mode),
    db
      .select({
        total: count(),
        agree: sql<number>`count(*) filter (where ${modeDecisions.recommended} = ${modeDecisions.chosen})`,
      })
      .from(modeDecisions),
    db
      .select({
        ats: sql<string | null>`${modeDecisions.signals}->>'ats'`,
        total: count(),
        agree: sql<number>`count(*) filter (where ${modeDecisions.recommended} = ${modeDecisions.chosen})`,
      })
      .from(modeDecisions)
      .groupBy(sql`${modeDecisions.signals}->>'ats'`),
    db.select({ kind: notificationLog.kind, n: count() }).from(notificationLog).groupBy(notificationLog.kind),
    db
      .select({ channel: notificationLog.channel, n: count() })
      .from(notificationLog)
      .groupBy(notificationLog.channel),
    db.select({ status: postings.status, n: count() }).from(postings).groupBy(postings.status),
    db.select().from(sources),
  ]);

  const totalApps = totalAppsRow?.n ?? 0;
  const appliedPlus = appliedPlusRow?.n ?? 0;
  const activePostings = activePostingsRow?.n ?? 0;
  const appliedDenom = appliedDenomRow?.n ?? 0;
  const responded = respondedRow?.n ?? 0;
  const responseRatePct = appliedDenom > 0 ? Math.round((responded / appliedDenom) * 100) : null;

  // Fill every stage/mode so a section never silently drops a zero-count row.
  const stageCounts = new Map(stageRows.map((r) => [r.stage, r.n]));
  const pipelineRows = STAGE_LIST.map(([stage, label]) => ({ stage, label, n: stageCounts.get(stage) ?? 0 }));

  const modeCounts = new Map(modeRows.map((r) => [r.mode ?? "unset", r.n]));
  const modeOrder: (keyof typeof MODE_LABEL)[] = ["manual", "assist", "auto", "unset"];
  const modeRowsFilled = modeOrder.map((m) => ({ mode: m, n: modeCounts.get(m) ?? 0 }));

  const overallTotal = decisionsOverall?.total ?? 0;
  const overallAgree = decisionsOverall?.agree ?? 0;
  const overallAgreePct = overallTotal > 0 ? Math.round((overallAgree / overallTotal) * 100) : null;
  const atsBreakdown = decisionsByAts.filter((r) => r.ats).map((r) => ({
    ats: r.ats as string,
    total: r.total,
    agree: r.agree,
    pct: r.total > 0 ? Math.round((r.agree / r.total) * 100) : 0,
  }));

  const notifTotal = notifKindRows.reduce((sum, r) => sum + r.n, 0);
  const notifKindLabels: Record<string, string> = {
    instant: "Instant",
    digest: "Digest",
    confirmation: "Confirmation",
    blocker: "Blocker",
  };
  const notifChannelLabels: Record<string, string> = { push: "Push", email: "Email", sms: "SMS" };

  const postingStatusTotal = postingStatusRows.reduce((sum, r) => sum + r.n, 0);
  const postingStatusLabels: Record<string, string> = { active: "Active", expired: "Expired", hidden: "Hidden" };
  const postingStatusVar: Record<string, string> = {
    active: "--success",
    expired: "--text-tertiary",
    hidden: "--warning",
  };

  const enabledSources = sourceRows.filter((s) => s.enabled).length;
  const erroringSources = sourceRows.filter((s) => s.lastError);
  const mostRecentPoll = sourceRows
    .map((s) => s.lastPolledAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="A read-only look at your job search, built from what's already tracked — no new data collected here"
      />

      {/* 1. Top stat row */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ClipboardList} label="Total applications" value={String(totalApps)} caption="all-time, every stage" />
        <StatCard
          icon={Send}
          label="Applied+"
          value={String(appliedPlus)}
          caption="past Saved / In Progress"
          tone="success"
        />
        <StatCard
          icon={Search}
          label="Active postings tracked"
          value={String(activePostings)}
          caption="currently live listings"
          tone="tertiary"
        />
        <StatCard
          icon={TrendingUp}
          label="Response rate"
          value={responseRatePct === null ? "—" : `${responseRatePct}%`}
          caption={appliedDenom > 0 ? `${responded} of ${appliedDenom} applied reached a response` : "no applied apps yet"}
        />
      </div>

      {/* 2. Pipeline funnel */}
      <Card className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-accent" />
          <h2 className="text-[15px] font-semibold">Pipeline funnel</h2>
        </div>
        {totalApps === 0 ? (
          <EmptyState
            title="No applications yet"
            hint="Track a posting from Internships to start building pipeline data."
          />
        ) : (
          <div className="grid gap-2.5">
            {pipelineRows.map((r) => (
              <BarRow key={r.stage} label={r.label} value={r.n} total={totalApps} colorVar={STAGE_VAR[r.stage]} />
            ))}
          </div>
        )}
      </Card>

      {/* 3. Automation mode split */}
      <Card className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <Send className="h-4 w-4 text-accent" />
          <h2 className="text-[15px] font-semibold">Automation mode split</h2>
        </div>
        {totalApps === 0 ? (
          <EmptyState title="No applications yet" hint="A mode badge appears here once you pick one per application." />
        ) : (
          <div className="grid gap-2.5">
            {modeRowsFilled.map((r) => (
              <BarRow
                key={r.mode}
                label={MODE_LABEL[r.mode]}
                value={r.n}
                total={totalApps}
                colorVar={MODE_VAR[r.mode]}
                dashed={r.mode === "unset"}
              />
            ))}
          </div>
        )}
      </Card>

      {/* 4. Recommendation vs. choice */}
      <Card className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-accent" />
          <h2 className="text-[15px] font-semibold">Recommendation vs. your choice</h2>
        </div>
        {overallTotal === 0 ? (
          <EmptyState
            title="No recommendation data yet"
            hint="Logged each time you pick a mode after seeing the recommender's suggestion — the more you use it, the better this gets."
          />
        ) : (
          <>
            <div className="mb-4 flex items-baseline gap-2">
              <p className="text-[28px] font-bold tracking-tight">{overallAgreePct}%</p>
              <p className="text-[13px] text-secondary">
                agreement — you followed the recommendation {overallAgree} of {overallTotal} times
              </p>
            </div>
            {atsBreakdown.length > 0 && (
              <>
                <p className="mb-2 text-[12px] font-medium text-tertiary">By ATS platform</p>
                <div className="grid gap-2.5">
                  {atsBreakdown
                    .sort((a, b) => b.total - a.total)
                    .map((r) => (
                      <BarRow key={r.ats} label={r.ats} value={r.agree} total={r.total} colorVar="--accent" />
                    ))}
                </div>
              </>
            )}
          </>
        )}
      </Card>

      {/* 5. Notification activity */}
      <Card className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-4 w-4 text-accent" />
          <h2 className="text-[15px] font-semibold">Notification activity</h2>
        </div>
        {notifTotal === 0 ? (
          <EmptyState
            title="No notifications sent yet"
            hint="Instant alerts, digests, confirmations, and blocker notices will show up here once sent."
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[12px] font-medium text-tertiary">By kind</p>
              <div className="grid gap-2.5">
                {notifKindRows.map((r) => (
                  <BarRow
                    key={r.kind}
                    label={notifKindLabels[r.kind] ?? r.kind}
                    value={r.n}
                    total={notifTotal}
                    colorVar="--accent"
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[12px] font-medium text-tertiary">By channel</p>
              <div className="grid gap-2.5">
                {notifChannelRows.map((r) => (
                  <BarRow
                    key={r.channel}
                    label={notifChannelLabels[r.channel] ?? r.channel}
                    value={r.n}
                    total={notifTotal}
                    colorVar="--purple"
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* 6. Sources contribution */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-accent" />
          <h2 className="text-[15px] font-semibold">Sources & postings</h2>
        </div>
        {postingStatusTotal === 0 && sourceRows.length === 0 ? (
          <EmptyState
            title="No sources configured"
            hint="Add a GitHub repo or ATS board in Settings to start discovering postings."
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[12px] font-medium text-tertiary">Postings by status</p>
              {postingStatusTotal === 0 ? (
                <p className="text-[13px] text-secondary">No postings ingested yet.</p>
              ) : (
                <div className="grid gap-2.5">
                  {postingStatusRows.map((r) => (
                    <BarRow
                      key={r.status}
                      label={postingStatusLabels[r.status] ?? r.status}
                      value={r.n}
                      total={postingStatusTotal}
                      colorVar={postingStatusVar[r.status] ?? "--text-tertiary"}
                    />
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 text-[12px] font-medium text-tertiary">Source health</p>
              {sourceRows.length === 0 ? (
                <p className="text-[13px] text-secondary">
                  No sources configured — add one in{" "}
                  <a href="/settings" className="font-medium text-accent hover:underline">
                    Settings
                  </a>
                  .
                </p>
              ) : (
                <div className="grid gap-1.5 text-[13px]">
                  <p className="text-secondary">
                    <span className="font-semibold text-foreground">{enabledSources}</span> of {sourceRows.length}{" "}
                    enabled
                  </p>
                  <p className="text-secondary">
                    Last poll:{" "}
                    <span className="font-medium text-foreground">
                      {mostRecentPoll ? timeAgo(mostRecentPoll) : "never"}
                    </span>
                  </p>
                  {erroringSources.length === 0 ? (
                    <p className="text-success">No source errors</p>
                  ) : (
                    <p className="text-danger">
                      {erroringSources.length} source{erroringSources.length === 1 ? "" : "s"} with errors —{" "}
                      {erroringSources.map((s) => s.name).join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
