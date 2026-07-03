import { Search } from "lucide-react";
import { and, asc, db, desc, eq, gte, ilike, or, postings, settings, sql, type SQL } from "@tracker/db";
import { EmptyState, PageHeader } from "@/components/ui";
import { PostingCard } from "@/components/posting-card";
import { FilterBar, type FilterGroup } from "@/components/filter-bar";
import { StaggerGrid } from "@/components/motion";

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
  const groups: FilterGroup[] = GROUPS.map((g) =>
    g.key === "year" ? { ...g, options: years.map((y) => [y, y] as [string, string]) } : g,
  ).filter((g) => g.options.length > 0);

  const activeFilterCount = FILTER_KEYS.filter((k) => k !== "q" && k !== "sort" && params[k]).length;

  const extraChips = [
    { key: "saved", value: "1", label: "Saved", active: params.saved === "1" },
    { key: "sort", value: "deadline", label: "Deadline soonest", active: params.sort === "deadline" },
    { key: "sort", value: "company", label: "Company A–Z", active: params.sort === "company" },
  ];

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
            className="w-full rounded-xl border border-separator bg-surface py-2.5 pl-10 pr-24 text-[15px] shadow-card outline-none transition-shadow focus:shadow-raised"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-medium text-tertiary">
            {rows.length}
            {rows.length === 200 ? "+" : ""} result{rows.length === 1 ? "" : "s"}
          </span>
          {FILTER_KEYS.filter((k) => k !== "q" && params[k]).map((k) => (
            <input key={k} type="hidden" name={k} value={params[k]} />
          ))}
        </div>
      </form>

      <FilterBar
        params={params}
        groups={groups}
        extraChips={extraChips}
        showLevelToggle={includeNewGrad}
        activeFilterCount={activeFilterCount}
      />

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
        <StaggerGrid className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <PostingCard key={p.id} posting={p} />
          ))}
        </StaggerGrid>
      )}
    </>
  );
}
