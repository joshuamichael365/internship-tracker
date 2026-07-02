import Link from "next/link";
import { Bookmark, ExternalLink } from "lucide-react";
import { toggleBookmark } from "@/app/actions/postings";
import { LOCATION_MODE_LABELS, ROLE_LABELS, timeAgo } from "@/lib/format";

export interface PostingCardData {
  id: number;
  company: string;
  title: string;
  url: string;
  locations: string[];
  locationMode: string;
  roleType: string;
  jobLevel: string;
  firstSeenAt: Date;
  deadline: Date | null;
  bookmarked: boolean;
  seenIn: { sourceId: number }[];
}

const ROLE_COLORS: Record<string, string> = {
  swe: "bg-accent-soft text-accent",
  ml: "bg-[color-mix(in_srgb,var(--purple)_14%,transparent)] text-grape",
  data: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-success",
  quant: "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-warning",
  other: "bg-black/[0.06] text-secondary dark:bg-white/[0.1]",
};

export function PostingCard({ posting }: { posting: PostingCardData }) {
  return (
    <div className="group relative rounded-2xl bg-surface p-4 shadow-card transition-shadow hover:shadow-raised">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/internships/${posting.id}`} className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-secondary">{posting.company}</p>
          <h3 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug">
            {posting.title}
          </h3>
        </Link>
        <form
          action={async () => {
            "use server";
            await toggleBookmark(posting.id, !posting.bookmarked);
          }}
        >
          <button
            aria-label={posting.bookmarked ? "Remove bookmark" : "Bookmark"}
            className={`rounded-lg p-1.5 transition-colors ${
              posting.bookmarked
                ? "text-accent"
                : "text-tertiary hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            }`}
          >
            <Bookmark className="h-4 w-4" fill={posting.bookmarked ? "currentColor" : "none"} />
          </button>
        </form>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_COLORS[posting.roleType] ?? ROLE_COLORS.other}`}
        >
          {ROLE_LABELS[posting.roleType] ?? posting.roleType}
        </span>
        {posting.jobLevel === "new_grad" && (
          <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold text-secondary dark:bg-white/[0.1]">
            New Grad
          </span>
        )}
        {LOCATION_MODE_LABELS[posting.locationMode] && (
          <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold text-secondary dark:bg-white/[0.1]">
            {LOCATION_MODE_LABELS[posting.locationMode]}
          </span>
        )}
        {posting.locations[0] && (
          <span className="truncate text-[12px] text-tertiary">
            {posting.locations[0]}
            {posting.locations.length > 1 && ` +${posting.locations.length - 1}`}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[12px] text-tertiary">
        <span>
          {timeAgo(posting.firstSeenAt)}
          {posting.seenIn.length > 1 && ` · ${posting.seenIn.length} sources`}
          {posting.deadline && (
            <span className="ml-1 font-medium text-warning">
              · due {posting.deadline.toLocaleDateString([], { month: "short", day: "numeric" })}
            </span>
          )}
        </span>
        <a
          href={posting.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100"
        >
          Apply <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
