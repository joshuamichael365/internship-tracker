import Link from "next/link";
import { Search } from "lucide-react";
import { and, db, desc, eq, ilike, or, postings, settings } from "@tracker/db";
import { EmptyState, PageHeader } from "@/components/ui";
import { PostingCard } from "@/components/posting-card";

export const metadata = { title: "Internships" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "role", values: ["swe", "ml", "data", "quant", "other"], labels: ["SWE", "ML", "Data", "Quant", "Other"] },
  { key: "loc", values: ["remote", "hybrid", "onsite"], labels: ["Remote", "Hybrid", "On-site"] },
] as const;

export default async function InternshipsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const q = params.q?.trim();
  const [prefs] = await db.select().from(settings).limit(1);

  const conditions = [eq(postings.status, "active" as const)];
  if (!prefs?.includeNewGrad) conditions.push(eq(postings.jobLevel, "internship" as const));
  if (params.role) conditions.push(eq(postings.roleType, params.role as "swe"));
  if (params.loc) conditions.push(eq(postings.locationMode, params.loc as "remote"));
  if (params.saved === "1") conditions.push(eq(postings.bookmarked, true));
  if (q) {
    conditions.push(
      or(ilike(postings.company, `%${q}%`), ilike(postings.title, `%${q}%`))!,
    );
  }

  const rows = await db
    .select()
    .from(postings)
    .where(and(...conditions))
    .orderBy(desc(postings.firstSeenAt))
    .limit(200);

  const linkFor = (key: string, value: string | null) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (params.role) next.set("role", params.role);
    if (params.loc) next.set("loc", params.loc);
    if (params.saved) next.set("saved", params.saved);
    if (value === null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    return qs ? `/internships?${qs}` : "/internships";
  };

  return (
    <>
      <PageHeader title="Internships" subtitle={`${rows.length} open posting${rows.length === 1 ? "" : "s"} from your sources`} />

      <form method="GET" className="mb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search company or role…"
            className="w-full rounded-xl border border-separator bg-surface py-2.5 pl-10 pr-4 text-[15px] shadow-card outline-none transition-shadow focus:shadow-raised"
          />
          {params.role && <input type="hidden" name="role" value={params.role} />}
          {params.loc && <input type="hidden" name="loc" value={params.loc} />}
        </div>
      </form>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map(({ key, values, labels }) =>
          values.map((v, i) => {
            const active = params[key] === v;
            return (
              <Link
                key={`${key}-${v}`}
                href={linkFor(key, active ? null : v)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-accent text-white"
                    : "bg-surface text-secondary shadow-card hover:text-foreground"
                }`}
              >
                {labels[i]}
              </Link>
            );
          }),
        )}
        <Link
          href={linkFor("saved", params.saved === "1" ? null : "1")}
          className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
            params.saved === "1"
              ? "bg-accent text-white"
              : "bg-surface text-secondary shadow-card hover:text-foreground"
          }`}
        >
          Saved
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Search className="h-7 w-7" />}
          title={q || params.role || params.loc ? "No matches" : "No postings yet"}
          hint={
            q || params.role || params.loc
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
