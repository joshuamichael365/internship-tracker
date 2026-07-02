import { Archive } from "lucide-react";
import { db, desc, eq, ne, postings } from "@tracker/db";
import { EmptyState, PageHeader } from "@/components/ui";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Archive" };
export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const rows = await db
    .select()
    .from(postings)
    .where(ne(postings.status, "active"))
    .orderBy(desc(postings.firstSeenAt))
    .limit(300);

  return (
    <>
      <PageHeader
        title="Archive"
        subtitle="Postings past their deadline, plus roles hidden because you already applied"
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Archive className="h-7 w-7" />}
          title="Nothing archived"
          hint="Expired postings move here automatically so the active list stays clean."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
          <ul className="divide-y divide-separator">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {p.company} — {p.title}
                  </p>
                  <p className="text-[12px] text-tertiary">
                    {p.status === "expired" ? "Deadline passed" : "Hidden (already applied)"} · found{" "}
                    {timeAgo(p.firstSeenAt)}
                  </p>
                </div>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13px] font-medium text-accent"
                >
                  View
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
