import Link from "next/link";
import { Search } from "lucide-react";
import { and, asc, db, desc, eq, gte, ilike, or, postings, settings, sql, type SQL } from "@tracker/db";
import { EmptyState, PageHeader } from "@/components/ui";
import { PostingCard } from "@/components/posting-card";

export const metadata = { title: "Internships" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | undefined>;

const FILTER_KEYS = ["q", "term", "year", "role", "loc", "level", "sponsor", "posted", "saved", "sort"] as const;

const GROUPS: { key: string; label: string; options: [string, string][] }[] = [
  {
    key: "term",
    label: "Season",
    options: [
      ["summer", "Summer"],
      ["fall", "Fall"],
      ["winter", "Winter"],
      ["spring", "Spring"],
    ],
  },
  { key: "year", label: "Year", options: [] }, // filled dynamically
  {
    key: "role",
    label: "Role",
    options: [
      ["swe", "SWE"],
      ["ml", "ML"],
      ["data", "Data"],
      ["quant", "Quant"],
      ["other", "Other"],
    ],
  },
  {
    key: "loc",
    label: "Work mode",
    options: [
      ["remote", "Remote"],
      ["hybrid", "Hybrid"],
      ["onsite", "On-site"],
    ],
  },
  {
    key: "sponsor",
    label: "Sponsorship",
    options: [
      ["sponsors", "Sponsors visas"],
      ["citizens_only", "Citizens only"],
      ["unknown", "Unknown"],
    ],
  },
  {
    key: "posted",
    label: "Posted",
    options: [
      ["1", "24h"],
      ["7", "Week"],
      ["30", "Month"],
    ],
  },
];

function linkFor(params: Params, key: string, value: string | null): string {
  const next = new URLSearchParams();
  for (const k of FILTER_KEYS) if (params[k]) next.set(k, params[k]!);
  if (value === null) next.delete(key);
  else next.set(key, value);
  const qs = next.toString();
  return qs ? `/internships?${qs}` : "/internships";
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active ? "bg-accent text-white" : "bg-surface text-secondary shadow-card hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function InternshipsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const q = params.q?.trim();
  const [prefs] = await db.select().from(settings).limit(1);
  const includeNewGrad = prefs?.includeNewGrad ?? false;

  const conditions: SQL[] = [eq(postings.status, "active" as const)];

  // Level: explicit filter wins; otherwise the new-grad setting gates the view.
  if (params.level === "internship" || params.level === "new_grad") {
    conditions.push(eq(postings.jobLevel, params.level));
  } else if (!includeNewGrad) {
    conditions.push(eq(postings.jobLevel, "internship" as const));
  }

  if (params.role) conditions.push(eq(postings.roleType, params.role as "swe"));
  if (params.loc) conditions.push(eq(postings.locationMode, params.loc as "remote"));
  if (params.sponsor) conditions.push(eq(postings.sponsorship, params.sponsor as "sponsors"));
  if (params.saved === "1") conditions.push(eq(postings.bookmarked, true));
  if (params.term) {
    conditions.push(
      sql`exists (select 1 from jsonb_array_elements_text(${postings.terms}) t(v) where v ilike ${params.term + "%"})`,
    );
  }
  if (params.year) {
    conditions.push(
      sql`exists (select 1 from jsonb_array_elements_text(${postings.terms}) t(v) where v like ${"% " + params.year})`,
    );
  }
  if (params.posted) {
    const days = Number(params.posted);
    if ([1, 7, 30].includes(days)) {
      conditions.push(gte(postings.firstSeenAt, new Date(Date.now() - days * 24 * 60 * 60 * 1000)));
    }
  }
  if (q) {
    conditions.push(
      or(
        ilike(postings.company, `%${q}%`),
        ilike(postings.title, `%${q}%`),
        sql`${postings.locations}::text ilike ${"%" + q + "%"}`,
      )!,
    );
  }

  const orderBy =
    params.sort === "deadline"
      ? [sql`${postings.deadline} asc nulls last`]
      : params.sort === "company"
        ? [asc(postings.company)]
        : [desc(postings.firstSeenAt)];

  const [rows, yearRows] = await Promise.all([
    db
      .select()
      .from(postings)
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(200),
    db.execute<{ year: string }>(
      sql`select distinct right(v, 4) as year from postings, jsonb_array_elements_text(terms) t(v) where v ~ ' 20\\d\\d$' order by 1`,
    ),
  ]);

  const years = [...yearRows].map((r) => r.year);
  const groups = GROUPS.map((g) =>
    g.key === "year" ? { ...g, options: years.map((y) => [y, y] as [string, string]) } : g,
  ).filter((g) => g.options.length > 0);

  const activeFilterCount = FILTER_KEYS.filter((k) => k !== "q" && k !== "sort" && params[k]).length;

  return (
    <>
      <PageHeader
        title="Internships"
        subtitle={`${rows.length}${rows.length === 200 ? "+" : ""} open posting${rows.length === 1 ? "" : "s"} from your sources`}
      />

      <form method="GET" className="mb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search company, role, or location…"
            className="w-full rounded-xl border border-separator bg-surface py-2.5 pl-10 pr-4 text-[15px] shadow-card outline-none transition-shadow focus:shadow-raised"
          />
          {FILTER_KEYS.filter((k) => k !== "q" && params[k]).map((k) => (
            <input key={k} type="hidden" name={k} value={params[k]} />
          ))}
        </div>
      </form>

      <div className="mb-5 grid gap-2.5">
        {groups.map((g) => (
          <div key={g.key} className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-tertiary">
              {g.label}
            </span>
            {g.options.map(([v, label]) => (
              <Chip key={v} href={linkFor(params, g.key, params[g.key] === v ? null : v)} active={params[g.key] === v}>
                {label}
              </Chip>
            ))}
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-tertiary">
            More
          </span>
          {includeNewGrad && (
            <>
              <Chip
                href={linkFor(params, "level", params.level === "internship" ? null : "internship")}
                active={params.level === "internship"}
              >
                Internships
              </Chip>
              <Chip
                href={linkFor(params, "level", params.level === "new_grad" ? null : "new_grad")}
                active={params.level === "new_grad"}
              >
                New Grad
              </Chip>
            </>
          )}
          <Chip href={linkFor(params, "saved", params.saved === "1" ? null : "1")} active={params.saved === "1"}>
            Saved
          </Chip>
          <Chip
            href={linkFor(params, "sort", params.sort === "deadline" ? null : "deadline")}
            active={params.sort === "deadline"}
          >
            Deadline soonest
          </Chip>
          <Chip
            href={linkFor(params, "sort", params.sort === "company" ? null : "company")}
            active={params.sort === "company"}
          >
            Company A–Z
          </Chip>
          {activeFilterCount > 0 && (
            <Link href="/internships" className="ml-1 text-[13px] font-medium text-accent">
              Clear all ({activeFilterCount})
            </Link>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Search className="h-7 w-7" />}
          title={activeFilterCount > 0 || q ? "No matches" : "No postings yet"}
          hint={
            activeFilterCount > 0 || q
              ? "Try removing a filter or broadening the search."
              : "Add sources in Settings — the worker polls them every minute."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <PostingCard key={p.id} posting={p} />
          ))}
        </div>
      )}
    </>
  );
}
