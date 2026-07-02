import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bookmark, ExternalLink, ListPlus } from "lucide-react";
import { applications, db, eq, inArray, postings, sources } from "@tracker/db";
import { savePostingNotes, toggleBookmark, trackPosting } from "@/app/actions/postings";
import { Card } from "@/components/ui";
import { LOCATION_MODE_LABELS, ROLE_LABELS, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PostingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const [posting] = await db.select().from(postings).where(eq(postings.id, id)).limit(1);
  if (!posting) notFound();

  const sourceIds = posting.seenIn.map((s) => s.sourceId);
  const sourceRows = sourceIds.length
    ? await db.select().from(sources).where(inArray(sources.id, sourceIds))
    : [];
  const [tracked] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.postingId, id))
    .limit(1);

  return (
    <>
      <Link
        href="/internships"
        className="mb-4 inline-flex items-center gap-1 text-[14px] font-medium text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> Internships
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[15px] font-medium text-secondary">{posting.company}</p>
          <h1 className="mt-0.5 text-[26px] font-bold leading-tight tracking-tight">
            {posting.title}
          </h1>
          <p className="mt-1.5 text-[13px] text-tertiary">
            {[
              ROLE_LABELS[posting.roleType],
              LOCATION_MODE_LABELS[posting.locationMode],
              posting.locations.join(" · "),
              `found ${timeAgo(posting.firstSeenAt)}`,
              posting.deadline &&
                `deadline ${posting.deadline.toLocaleDateString([], { month: "long", day: "numeric" })}`,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        </div>
        <div className="flex gap-2">
          <form
            action={async () => {
              "use server";
              await toggleBookmark(posting.id, !posting.bookmarked);
            }}
          >
            <button
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[14px] font-medium shadow-card transition-colors ${
                posting.bookmarked ? "bg-accent-soft text-accent" : "bg-surface text-secondary"
              }`}
            >
              <Bookmark className="h-4 w-4" fill={posting.bookmarked ? "currentColor" : "none"} />
              {posting.bookmarked ? "Saved" : "Save"}
            </button>
          </form>
          {tracked ? (
            <Link
              href="/tracker"
              className="flex items-center gap-1.5 rounded-xl bg-accent-soft px-3.5 py-2 text-[14px] font-medium text-accent"
            >
              <ListPlus className="h-4 w-4" /> In tracker
            </Link>
          ) : (
            <form
              action={async () => {
                "use server";
                await trackPosting(posting.id);
              }}
            >
              <button className="flex items-center gap-1.5 rounded-xl bg-surface px-3.5 py-2 text-[14px] font-medium text-secondary shadow-card transition-colors hover:text-foreground">
                <ListPlus className="h-4 w-4" /> Track
              </button>
            </form>
          )}
          <a
            href={posting.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Apply <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <h2 className="mb-2 text-[15px] font-semibold">Description</h2>
          {posting.description ? (
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-secondary">
              {posting.description}
            </p>
          ) : (
            <p className="text-[14px] text-tertiary">
              This source doesn&apos;t include a description — open the posting for full details.
            </p>
          )}
        </Card>

        <div className="grid content-start gap-4">
          <Card>
            <h2 className="mb-2 text-[15px] font-semibold">My notes</h2>
            <form
              action={async (fd: FormData) => {
                "use server";
                await savePostingNotes(posting.id, String(fd.get("notes") ?? ""));
              }}
            >
              <textarea
                name="notes"
                defaultValue={posting.notes ?? ""}
                rows={5}
                placeholder="Anything worth remembering about this role…"
                className="w-full resize-y rounded-lg border border-separator bg-surface-secondary p-3 text-[14px] outline-none focus:border-accent"
              />
              <button className="mt-2 rounded-lg bg-accent-soft px-3.5 py-1.5 text-[13px] font-medium text-accent transition-opacity hover:opacity-80">
                Save notes
              </button>
            </form>
          </Card>

          <Card>
            <h2 className="mb-2 text-[15px] font-semibold">Seen in</h2>
            <ul className="grid gap-1.5">
              {posting.seenIn.map((s, i) => {
                const src = sourceRows.find((r) => r.id === s.sourceId);
                return (
                  <li key={i} className="flex items-center justify-between text-[13px]">
                    <span className="text-secondary">{src?.name ?? `Source #${s.sourceId}`}</span>
                    <span className="text-tertiary">{timeAgo(s.seenAt)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
