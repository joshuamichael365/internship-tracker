import Anthropic from "@anthropic-ai/sdk";
import {
  and,
  applications,
  count,
  db,
  desc,
  eq,
  gte,
  ilike,
  or,
  postings,
  reminders,
  sources,
  sql,
  type SQL,
} from "@tracker/db";

/**
 * The Assistant (/chat) engine. claude-sonnet-5 with read-only tools over the
 * tracker's own data — postings, applications, reminders, analytics — so it
 * answers "what opened today / how's my pipeline / what's due" from live
 * queries instead of a stale context dump, and blends in general recruiting
 * knowledge (typical opening windows, timelines) labeled as such.
 *
 * Everything here is read-only by construction: no tool mutates state, so the
 * model structurally cannot change applications, settings, or postings.
 */

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

const MODEL = "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 6;
/** Messages of history sent to the model (persisted cap lives in the action). */
const HISTORY_WINDOW = 12;
/** Hard cap per tool result so a broad query can't blow out the context. */
const TOOL_RESULT_MAX_CHARS = 7000;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_postings",
    description:
      "Search the live internship postings the tracker has discovered. Use for anything about specific postings: what opened recently, roles at a company, remote ML roles, etc. Returns newest first.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Matches company OR title, case-insensitive substring" },
        role_type: { type: "string", enum: ["swe", "ml", "data", "quant", "other"] },
        location_mode: { type: "string", enum: ["remote", "hybrid", "onsite"] },
        posted_within_days: { type: "number", description: "Only postings first seen in the last N days (1 = today)" },
        term: { type: "string", description: "Season/year filter, e.g. 'Summer 2027' or '2027'" },
        limit: { type: "number", description: "Max rows (default 10, cap 25)" },
      },
    },
  },
  {
    name: "get_posting_stats",
    description:
      "Aggregate counts over active postings: total, new in the last 24h and 7 days, and a by-role-type breakdown. Use for 'how many' questions instead of searching.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_applications",
    description:
      "The user's tracked applications: company, role, pipeline stage, automation mode, applied date. Optionally filter by stage. Use for any 'my application(s)' question.",
    input_schema: {
      type: "object" as const,
      properties: {
        stage: {
          type: "string",
          enum: ["saved", "in_progress", "applied", "assessment", "interviewing", "offer", "rejected"],
        },
      },
    },
  },
  {
    name: "get_reminders",
    description:
      "Open (not-done) reminders and OA deadlines with their application's company/role, split into overdue and upcoming. Use for 'what's due / any deadlines' questions.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_analytics_summary",
    description:
      "Pipeline funnel by stage, automation-mode split, response rate, and source health (enabled sources, polling errors). Use for 'how are my analytics / how's my search going' questions.",
    input_schema: { type: "object" as const, properties: {} },
  },
];

/* ---------- tool executors (all read-only) ---------- */

async function searchPostings(input: {
  query?: string;
  role_type?: string;
  location_mode?: string;
  posted_within_days?: number;
  term?: string;
  limit?: number;
}) {
  const conditions: SQL[] = [eq(postings.status, "active" as const)];
  if (input.query) {
    conditions.push(or(ilike(postings.company, `%${input.query}%`), ilike(postings.title, `%${input.query}%`))!);
  }
  if (input.role_type) conditions.push(eq(postings.roleType, input.role_type as "swe"));
  if (input.location_mode) conditions.push(eq(postings.locationMode, input.location_mode as "remote"));
  if (input.posted_within_days && input.posted_within_days > 0) {
    conditions.push(gte(postings.firstSeenAt, new Date(Date.now() - input.posted_within_days * 86_400_000)));
  }
  if (input.term) {
    conditions.push(
      sql`exists (select 1 from jsonb_array_elements_text(${postings.terms}) t(v) where v ilike ${"%" + input.term + "%"})`,
    );
  }
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const [rows, [total]] = await Promise.all([
    db.select().from(postings).where(and(...conditions)).orderBy(desc(postings.firstSeenAt)).limit(limit),
    db.select({ n: count() }).from(postings).where(and(...conditions)),
  ]);
  return {
    matched: total?.n ?? rows.length,
    returned: rows.length,
    postings: rows.map((p) => ({
      company: p.company,
      title: p.title,
      locations: p.locations?.slice(0, 3),
      role_type: p.roleType,
      location_mode: p.locationMode,
      terms: p.terms,
      sponsorship: p.sponsorship,
      first_seen: p.firstSeenAt?.toISOString().slice(0, 10),
      deadline: p.deadline?.toISOString().slice(0, 10) ?? null,
    })),
  };
}

async function getPostingStats() {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const active = eq(postings.status, "active" as const);
  const [[total], [day], [week], byRole] = await Promise.all([
    db.select({ n: count() }).from(postings).where(active),
    db.select({ n: count() }).from(postings).where(and(active, gte(postings.firstSeenAt, dayAgo))),
    db.select({ n: count() }).from(postings).where(and(active, gte(postings.firstSeenAt, weekAgo))),
    db.select({ role: postings.roleType, n: count() }).from(postings).where(active).groupBy(postings.roleType),
  ]);
  return {
    active_total: total?.n ?? 0,
    new_last_24h: day?.n ?? 0,
    new_last_7d: week?.n ?? 0,
    by_role_type: Object.fromEntries(byRole.map((r) => [r.role, r.n])),
  };
}

async function getApplications(input: { stage?: string }) {
  const rows = await db
    .select()
    .from(applications)
    .where(input.stage ? eq(applications.stage, input.stage as "saved") : undefined)
    .orderBy(desc(applications.updatedAt))
    .limit(50);
  return {
    count: rows.length,
    applications: rows.map((a) => ({
      company: a.company,
      role: a.roleTitle,
      stage: a.stage,
      mode: a.mode ?? "not chosen",
      applied_at: a.appliedAt?.toISOString().slice(0, 10) ?? null,
      notes_excerpt: a.notes ? a.notes.slice(0, 200) : null,
    })),
  };
}

async function getReminders() {
  const rows = await db
    .select({
      label: reminders.label,
      dueAt: reminders.dueAt,
      company: applications.company,
      role: applications.roleTitle,
    })
    .from(reminders)
    .leftJoin(applications, eq(reminders.applicationId, applications.id))
    .where(eq(reminders.done, false))
    .orderBy(reminders.dueAt)
    .limit(30);
  const now = Date.now();
  const fmt = (r: (typeof rows)[number]) => ({
    label: r.label,
    due: r.dueAt.toISOString(),
    company: r.company,
    role: r.role,
  });
  return {
    overdue: rows.filter((r) => r.dueAt.getTime() < now).map(fmt),
    upcoming: rows.filter((r) => r.dueAt.getTime() >= now).map(fmt),
  };
}

async function getAnalyticsSummary() {
  const [stageRows, modeRows, [appliedDenom], [responded], sourceRows] = await Promise.all([
    db.select({ stage: applications.stage, n: count() }).from(applications).groupBy(applications.stage),
    db.select({ mode: applications.mode, n: count() }).from(applications).groupBy(applications.mode),
    db
      .select({ n: count() })
      .from(applications)
      .where(sql`${applications.stage} in ('applied','assessment','interviewing','offer','rejected')`),
    db
      .select({ n: count() })
      .from(applications)
      .where(sql`${applications.stage} in ('interviewing','offer','rejected')`),
    db.select().from(sources),
  ]);
  const denom = appliedDenom?.n ?? 0;
  return {
    funnel_by_stage: Object.fromEntries(stageRows.map((r) => [r.stage, r.n])),
    mode_split: Object.fromEntries(modeRows.map((r) => [r.mode ?? "not chosen", r.n])),
    response_rate:
      denom > 0 ? `${Math.round(((responded?.n ?? 0) / denom) * 100)}% (${responded?.n} of ${denom} applied)` : null,
    sources: {
      total: sourceRows.length,
      enabled: sourceRows.filter((s) => s.enabled).length,
      with_errors: sourceRows.filter((s) => s.lastError).map((s) => s.name),
    },
  };
}

async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    const result =
      name === "search_postings"
        ? await searchPostings(input)
        : name === "get_posting_stats"
          ? await getPostingStats()
          : name === "get_applications"
            ? await getApplications(input)
            : name === "get_reminders"
              ? await getReminders()
              : name === "get_analytics_summary"
                ? await getAnalyticsSummary()
                : { error: `unknown tool: ${name}` };
    return JSON.stringify(result).slice(0, TOOL_RESULT_MAX_CHARS);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : "tool failed" });
  }
}

/* ---------- the chat loop ---------- */

function systemPrompt(): string {
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "full",
  }).format(new Date());
  return [
    "You are the assistant inside Erevnitis, a personal internship discovery and application tracker used by one person (its owner). You answer questions about their job search.",
    "",
    `Today is ${today} (America/New_York).`,
    "",
    "Rules:",
    "- For ANY question about their data — postings, what opened recently, their applications, deadlines, analytics — call the relevant tool first and answer from its result. Never guess at their data.",
    "- For general recruiting questions (when companies typically open internship applications, hiring timelines, interview norms), answer from your own knowledge and make clear it's general guidance, not live tracker data. Blend both when useful — e.g. pair their pipeline status with typical timelines.",
    "- Recruiting cycles move early: many SWE/quant internship postings for a summer open the preceding August–October (quant often earliest), with rolling closes. Frame 'when might X open' answers accordingly, as estimates.",
    "- Be concise and skimmable. Plain text only: short paragraphs and '-' bullets. No markdown headers, bold, tables, or emoji.",
    "- When listing postings, write 'Company — Title' plus location/term when available. Don't dump more than ~10 rows; summarize the rest.",
    "- You are read-only: you can't apply, edit applications, or change settings. If asked to, say so and point to the right page (Tracker, Internships, Settings).",
  ].join("\n");
}

export async function runAssistant(history: AssistantMessage[], message: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return "The assistant needs the Claude API key to be configured (ANTHROPIC_API_KEY) — the rest of the app works without it, but chat can't. Once it's set, ask me anything about your postings, applications, or deadlines.";
  }

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-HISTORY_WINDOW).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: systemPrompt(),
      tools: TOOLS,
      messages,
    });

    if (res.stop_reason === "tool_use") {
      const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      messages.push({ role: "assistant", content: res.content });
      const results = await Promise.all(
        toolUses.map(async (t) => ({
          type: "tool_result" as const,
          tool_use_id: t.id,
          content: await runTool(t.name, t.input as Record<string, unknown>),
        })),
      );
      messages.push({ role: "user", content: results });
      continue;
    }

    const text = res.content.find((b) => b.type === "text");
    return text?.type === "text" ? text.text.trim() : "I couldn't put together an answer — try rephrasing?";
  }

  return "That took more lookups than I allow per question — try asking something more specific.";
}
