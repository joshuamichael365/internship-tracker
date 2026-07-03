"use client";

import Link from "next/link";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

export type FilterGroup = { key: string; label: string; options: [string, string][] };

/** All filter keys that participate in the querystring (kept in sync with page). */
const FILTER_KEYS = [
  "q",
  "term",
  "year",
  "role",
  "loc",
  "level",
  "sponsor",
  "posted",
  "saved",
  "sort",
] as const;

type Params = Record<string, string | undefined>;

function buildLink(params: Params, key: string, value: string | null): string {
  const next = new URLSearchParams();
  for (const k of FILTER_KEYS) if (params[k]) next.set(k, params[k]!);
  if (value === null) next.delete(key);
  else next.set(key, value);
  const qs = next.toString();
  return qs ? `/internships?${qs}` : "/internships";
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active
          ? "bg-accent text-white"
          : "bg-surface text-secondary shadow-card hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * Labeled chip groups. Always expanded on md+; on mobile they collapse behind a
 * "Filters" toggle with an active-count badge. The "More" row (level toggles,
 * saved, sort) is passed as a data-driven set of extra chips.
 */
export function FilterBar({
  params,
  groups,
  extraChips,
  showLevelToggle,
  activeFilterCount,
}: {
  params: Params;
  groups: FilterGroup[];
  /** Extra chips for the "More" row that aren't single-select groups. */
  extraChips: { key: string; value: string; label: string; active: boolean }[];
  showLevelToggle: boolean;
  activeFilterCount: number;
}) {
  const [open, setOpen] = useState(false);
  const cur = (key: string) => params[key];

  return (
    <div className="mb-5">
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-2 flex items-center gap-2 rounded-xl bg-surface px-3.5 py-2 text-[13px] font-medium text-secondary shadow-card md:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {activeFilterCount > 0 && (
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {activeFilterCount}
          </span>
        )}
      </button>

      <div className={`${open ? "grid" : "hidden"} gap-2.5 md:grid`}>
        {groups.map((g) => (
          <div key={g.key} className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-tertiary">
              {g.label}
            </span>
            {g.options.map(([v, label]) => (
              <Chip
                key={v}
                href={buildLink(params, g.key, cur(g.key) === v ? null : v)}
                active={cur(g.key) === v}
              >
                {label}
              </Chip>
            ))}
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-tertiary">
            More
          </span>
          {showLevelToggle &&
            (["internship", "new_grad"] as const).map((lvl) => (
              <Chip
                key={lvl}
                href={buildLink(params, "level", cur("level") === lvl ? null : lvl)}
                active={cur("level") === lvl}
              >
                {lvl === "internship" ? "Internships" : "New Grad"}
              </Chip>
            ))}
          {extraChips.map((c) => (
            <Chip
              key={`${c.key}-${c.value}`}
              href={buildLink(params, c.key, c.active ? null : c.value)}
              active={c.active}
            >
              {c.label}
            </Chip>
          ))}
          {activeFilterCount > 0 && (
            <Link href="/internships" className="ml-1 text-[13px] font-medium text-accent">
              Clear all ({activeFilterCount})
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
