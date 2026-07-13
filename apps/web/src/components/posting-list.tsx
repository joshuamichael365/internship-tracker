"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Bookmark, ExternalLink } from "lucide-react";
import { toggleBookmark } from "@/app/actions/postings";
import { CompanyLogo } from "@/components/company-logo";
import { LOCATION_MODE_LABELS, ROLE_LABELS, timeAgo } from "@/lib/format";
import type { PostingCardData } from "@/components/posting-card";

const NEUTRAL_CHIP =
  "rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold text-secondary dark:bg-white/[0.1] h-[19px] inline-flex items-center whitespace-nowrap";

function ListRow({ posting }: { posting: PostingCardData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/internships/${posting.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(`/internships/${posting.id}`);
      }}
      className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-black/[0.025] focus-visible:bg-black/[0.025] dark:hover:bg-white/[0.04] dark:focus-visible:bg-white/[0.04]"
    >
      <CompanyLogo company={posting.company} url={posting.url} size="sm" />

      <div className="min-w-0 flex-[1.4]">
        <p className="truncate text-[14px] font-semibold leading-snug">{posting.title}</p>
        <p className="truncate text-[12px] text-secondary">{posting.company}</p>
      </div>

      <div className="hidden w-24 shrink-0 sm:block">
        {posting.terms[0] && <span className={NEUTRAL_CHIP}>{posting.terms[0]}</span>}
      </div>

      <div className="hidden w-24 shrink-0 md:block">
        {LOCATION_MODE_LABELS[posting.locationMode] && (
          <span className={NEUTRAL_CHIP}>{LOCATION_MODE_LABELS[posting.locationMode]}</span>
        )}
      </div>

      <div className="hidden min-w-0 flex-1 truncate text-[12px] text-tertiary lg:block">
        {posting.locations[0]
          ? `${posting.locations[0]}${posting.locations.length > 1 ? ` +${posting.locations.length - 1}` : ""}`
          : "—"}
      </div>

      <div className="hidden w-20 shrink-0 text-right text-[12px] text-tertiary sm:block">
        {timeAgo(posting.firstSeenAt)}
      </div>

      <button
        aria-label={posting.bookmarked ? "Remove bookmark" : "Bookmark"}
        onClick={(e) => {
          e.stopPropagation();
          startTransition(() => toggleBookmark(posting.id, !posting.bookmarked));
        }}
        className={`shrink-0 rounded-lg p-1.5 transition-colors active:scale-[0.98] ${
          posting.bookmarked
            ? "text-accent"
            : "text-tertiary hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        }`}
      >
        <Bookmark className="h-4 w-4" fill={posting.bookmarked ? "currentColor" : "none"} />
      </button>

      {/* Screenshot-intake postings can have no URL (story said "link in bio") */}
      {posting.url && (
        <a
          href={posting.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="hidden shrink-0 items-center gap-1 text-[12px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 sm:flex"
        >
          Apply <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

/** Simplify-style dense rows: one bg-surface card, divide-y, whole row clickable. */
export function PostingList({ postings }: { postings: PostingCardData[] }) {
  return (
    <div className="divide-y divide-separator overflow-hidden rounded-2xl bg-surface shadow-card">
      {postings.map((p) => (
        <ListRow key={p.id} posting={p} />
      ))}
    </div>
  );
}
