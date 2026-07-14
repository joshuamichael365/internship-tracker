"use client";

import Link from "next/link";
import { useTransition } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { updateStage } from "@/app/actions/applications";
import { CompanyLogo } from "@/components/company-logo";
import { ModeBadge } from "@/components/ui";
import { timeAgo } from "@/lib/format";

export const STAGES = [
  ["saved", "Saved"],
  ["in_progress", "In Progress"],
  ["applied", "Applied"],
  ["assessment", "Assessment / OA"],
  ["interviewing", "Interviewing"],
  ["offer", "Offer"],
  ["rejected", "Rejected"],
] as const;

export type Stage = (typeof STAGES)[number][0];

/** Subtle tinted dot per column, matching stage semantics. */
const STAGE_DOT: Record<Stage, string> = {
  saved: "bg-tertiary",
  in_progress: "bg-accent",
  applied: "bg-success",
  assessment: "bg-warning",
  interviewing: "bg-grape",
  offer: "bg-success",
  rejected: "bg-danger",
};

/** The underlying CSS variable per stage, used for color-mix tints on the column body + count pill. */
const STAGE_VAR: Record<Stage, string> = {
  saved: "--text-tertiary",
  in_progress: "--accent",
  applied: "--success",
  assessment: "--warning",
  interviewing: "--purple",
  offer: "--success",
  rejected: "--danger",
};

const STAGE_TEXT: Record<Stage, string> = {
  saved: "text-tertiary",
  in_progress: "text-accent",
  applied: "text-success",
  assessment: "text-warning",
  interviewing: "text-grape",
  offer: "text-success",
  rejected: "text-danger",
};

export interface TrackerCard {
  id: number;
  company: string;
  roleTitle: string;
  location: string | null;
  url?: string | null;
  mode: "manual" | "assist" | "auto" | null;
  stage: Stage;
  appliedAt: string | null;
  createdAt: string;
  dueSoon: { label: string; dueAt: string }[];
}

function Card({ app }: { app: TrackerCard }) {
  const [pending, startTransition] = useTransition();
  const idx = STAGES.findIndex(([s]) => s === app.stage);
  const move = (dir: -1 | 1) => {
    const next = STAGES[idx + dir]?.[0];
    if (next) startTransition(() => updateStage(app.id, next));
  };

  return (
    <motion.div
      layout
      layoutId={`card-${app.id}`}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: pending ? 0.5 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl bg-surface p-3.5 shadow-card transition-shadow duration-200 hover:shadow-raised"
    >
      <Link href={`/tracker/${app.id}`} className="flex items-start gap-2.5">
        <CompanyLogo company={app.company} url={app.url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-secondary">{app.company}</p>
          <p className="mt-0.5 line-clamp-2 text-[14px] font-semibold leading-snug">
            {app.roleTitle}
          </p>
        </div>
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2">
        <ModeBadge mode={app.mode} />
        <span className="text-[11px] text-tertiary">
          {app.appliedAt ? `applied ${timeAgo(app.appliedAt)}` : timeAgo(app.createdAt)}
        </span>
      </div>
      {app.dueSoon.length > 0 && (
        <p className="mt-2 rounded-lg bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-2 py-1 text-[11px] font-medium text-warning">
          ⏰ {app.dueSoon[0]!.label} ·{" "}
          {new Date(app.dueSoon[0]!.dueAt).toLocaleDateString([], { month: "short", day: "numeric" })}
        </p>
      )}
      <div className="mt-2 flex justify-between">
        <button
          onClick={() => move(-1)}
          disabled={idx === 0 || pending}
          aria-label="Move to previous stage"
          className="rounded-lg p-1 text-tertiary transition-colors active:scale-[0.98] hover:bg-black/[0.05] disabled:opacity-30 disabled:active:scale-100 dark:hover:bg-white/[0.08]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => move(1)}
          disabled={idx === STAGES.length - 1 || pending}
          aria-label="Move to next stage"
          className="rounded-lg p-1 text-tertiary transition-colors active:scale-[0.98] hover:bg-black/[0.05] disabled:opacity-30 disabled:active:scale-100 dark:hover:bg-white/[0.08]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

// Entrance sweep: columns rise in left-to-right on load, matching the
// internships grid's staggered reveal.
const boardStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const columnRise = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
};

export function TrackerBoard({ cards }: { cards: TrackerCard[] }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-4 md:-mx-10 md:px-10">
      <LayoutGroup>
        <motion.div className="flex min-w-max gap-3" variants={boardStagger} initial="hidden" animate="show">
          {STAGES.map(([stage, label]) => {
            const items = cards.filter((c) => c.stage === stage);
            return (
              <motion.div key={stage} variants={columnRise} className="w-[260px] shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-secondary">
                    <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} />
                    {label}
                  </h2>
                  <motion.span
                    layout
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${STAGE_TEXT[stage]}`}
                    style={{ background: `color-mix(in srgb, var(${STAGE_VAR[stage]}) 14%, transparent)` }}
                  >
                    {items.length}
                  </motion.span>
                </div>
                <motion.div
                  layout
                  className="grid gap-2 rounded-2xl p-2"
                  style={{ background: `color-mix(in srgb, var(${STAGE_VAR[stage]}) 5%, var(--background))` }}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {items.map((app) => (
                      <Card key={app.id} app={app} />
                    ))}
                  </AnimatePresence>
                  {items.length === 0 && (
                    <p className="px-2 py-6 text-center text-[12px] text-tertiary">Empty</p>
                  )}
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>
      </LayoutGroup>
    </div>
  );
}
