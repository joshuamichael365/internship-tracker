"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Bookmark, ExternalLink } from "lucide-react";
import { toggleBookmark } from "@/app/actions/postings";
import { CompanyLogo } from "@/components/company-logo";
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
  terms: string[];
}

const ROLE_COLORS: Record<string, string> = {
  swe: "bg-accent-soft text-accent",
  ml: "bg-[color-mix(in_srgb,var(--purple)_14%,transparent)] text-grape",
  data: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-success",
  quant: "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-warning",
  other: "bg-black/[0.06] text-secondary dark:bg-white/[0.1]",
};

const NEUTRAL_CHIP =
  "rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold text-secondary dark:bg-white/[0.1] whitespace-nowrap shrink-0";

export function PostingCard({ posting }: { posting: PostingCardData }) {
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
      className="group relative flex cursor-pointer flex-col rounded-2xl bg-surface p-4 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-raised focus-visible:shadow-raised"
    >
      <div className="flex items-start gap-3">
        <CompanyLogo company={posting.company} url={posting.url} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-secondary">{posting.company}</p>
          <h3 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug">
            {posting.title}
          </h3>
        </div>
        <button
          aria-label={posting.bookmarked ? "Remove bookmark" : "Bookmark"}
          onClick={(e) => {
            e.stopPropagation();
            startTransition(() => toggleBookmark(posting.id, !posting.bookmarked));
          }}
          className={`-mr-1 -mt-1 rounded-lg p-1.5 transition-colors ${
            posting.bookmarked
              ? "text-accent"
              : "text-tertiary hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          }`}
        >
          <Bookmark className="h-4 w-4" fill={posting.bookmarked ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_COLORS[posting.roleType] ?? ROLE_COLORS.other}`}
        >
          {ROLE_LABELS[posting.roleType] ?? posting.roleType}
        </span>
        {posting.terms[0] && <span className={NEUTRAL_CHIP}>{posting.terms[0]}</span>}
        {posting.jobLevel === "new_grad" && <span className={NEUTRAL_CHIP}>New Grad</span>}
        {LOCATION_MODE_LABELS[posting.locationMode] && (
          <span className={NEUTRAL_CHIP}>{LOCATION_MODE_LABELS[posting.locationMode]}</span>
        )}
        {posting.locations[0] && (
          <span className="truncate text-[12px] text-tertiary">
            {posting.locations[0]}
            {posting.locations.length > 1 && ` +${posting.locations.length - 1}`}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[12px] text-tertiary">
        <span className="flex items-center gap-1.5">
          <span>
            {timeAgo(posting.firstSeenAt)}
            {posting.seenIn.length > 1 && ` · ${posting.seenIn.length} sources`}
          </span>
          {posting.deadline && (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-1.5 py-0.5 font-semibold text-warning">
              due {posting.deadline.toLocaleDateString([], { month: "short", day: "numeric" })}
            </span>
          )}
        </span>
        {/* Screenshot-intake postings can have no URL (story said "link in bio") */}
        {posting.url && (
          <a
            href={posting.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            Apply <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
