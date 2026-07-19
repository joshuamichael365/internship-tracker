"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bookmark, Check, ChevronDown } from "lucide-react";

export type FilterGroup = {
  key: string;
  label: string;
  options: [string, string][];
  /** Label for the "clear this group" menu row (e.g. "Newest", "All levels"). */
  anyLabel?: string;
};

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

/** Non-filter view state that must survive a filter change (view mode, pagination). */
const PRESERVE_KEYS = ["view", "limit"] as const;

type Params = Record<string, string | undefined>;

function buildLink(params: Params, key: string, value: string | null): string {
  const next = new URLSearchParams();
  for (const k of [...FILTER_KEYS, ...PRESERVE_KEYS]) if (params[k]) next.set(k, params[k]!);
  if (value === null) next.delete(key);
  else next.set(key, value);
  const qs = next.toString();
  return qs ? `/internships?${qs}` : "/internships";
}

/** A single filter group rendered as a compact dropdown of mutually-exclusive options. */
function FilterDropdown({
  group,
  value,
  onSelect,
}: {
  group: FilterGroup;
  value: string | undefined;
  onSelect: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = group.options.find(([v]) => v === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (v: string | null) => {
    setOpen(false);
    onSelect(v);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium shadow-card transition-colors ${
          selected
            ? "bg-accent text-white"
            : "bg-surface text-secondary hover:text-foreground"
        }`}
      >
        <span>{selected ? selected[1] : group.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""} ${
            selected ? "opacity-90" : "opacity-60"
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: "top left" }}
            className="absolute left-0 top-full z-30 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-separator bg-surface p-1 shadow-raised"
          >
            <MenuItem active={!value} onClick={() => pick(null)}>
              {group.anyLabel ?? `Any ${group.label.toLowerCase()}`}
            </MenuItem>
            <div className="my-1 h-px bg-separator" />
            {group.options.map(([v, label]) => (
              <MenuItem key={v} active={v === value} onClick={() => pick(v === value ? null : v)}>
                {label}
              </MenuItem>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
        active
          ? "bg-accent-soft font-medium text-accent"
          : "text-secondary hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
      }`}
    >
      {children}
      {active && <Check className="h-3.5 w-3.5 shrink-0" />}
    </button>
  );
}

/**
 * Compact dropdown filter row. Each group is its own dropdown (label when
 * empty, selected value + accent fill when set); "Saved" is a standalone
 * toggle. Entirely URL-driven — selecting an option navigates so the server
 * component re-queries; the querystring stays the single source of truth.
 */
export function FilterBar({
  params,
  groups,
  savedActive,
  activeFilterCount,
}: {
  params: Params;
  groups: FilterGroup[];
  savedActive: boolean;
  activeFilterCount: number;
}) {
  const router = useRouter();
  const go = (key: string, value: string | null) => router.push(buildLink(params, key, value));

  // "Clear all" wipes filters but keeps view state (list/card, pagination).
  const clearAllQs = new URLSearchParams();
  for (const k of PRESERVE_KEYS) if (params[k]) clearAllQs.set(k, params[k]!);
  const clearAllHref = clearAllQs.toString() ? `/internships?${clearAllQs}` : "/internships";

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {groups.map((g) => (
        <FilterDropdown
          key={g.key}
          group={g}
          value={params[g.key]}
          onSelect={(v) => go(g.key, v)}
        />
      ))}

      <button
        type="button"
        onClick={() => go("saved", savedActive ? null : "1")}
        aria-pressed={savedActive}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium shadow-card transition-colors ${
          savedActive ? "bg-accent text-white" : "bg-surface text-secondary hover:text-foreground"
        }`}
      >
        <Bookmark className="h-3.5 w-3.5" fill={savedActive ? "currentColor" : "none"} />
        Saved
      </button>

      {activeFilterCount > 0 && (
        <Link
          href={clearAllHref}
          className="ml-0.5 rounded-full px-2.5 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent-soft"
        >
          Clear all ({activeFilterCount})
        </Link>
      )}
    </div>
  );
}
