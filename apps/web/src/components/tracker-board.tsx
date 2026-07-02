"use client";

import Link from "next/link";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { updateStage } from "@/app/actions/applications";
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

export interface TrackerCard {
  id: number;
  company: string;
  roleTitle: string;
  location: string | null;
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
    <div
      className={`rounded-xl bg-surface p-3.5 shadow-card transition-opacity ${pending ? "opacity-50" : ""}`}
    >
      <Link href={`/tracker/${app.id}`} className="block">
        <p className="truncate text-[12px] font-medium text-secondary">{app.company}</p>
        <p className="mt-0.5 line-clamp-2 text-[14px] font-semibold leading-snug">
          {app.roleTitle}
        </p>
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
          className="rounded-lg p-1 text-tertiary transition-colors hover:bg-black/[0.05] disabled:opacity-30 dark:hover:bg-white/[0.08]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => move(1)}
          disabled={idx === STAGES.length - 1 || pending}
          aria-label="Move to next stage"
          className="rounded-lg p-1 text-tertiary transition-colors hover:bg-black/[0.05] disabled:opacity-30 dark:hover:bg-white/[0.08]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function TrackerBoard({ cards }: { cards: TrackerCard[] }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-4 md:-mx-10 md:px-10">
      <div className="flex min-w-max gap-3">
        {STAGES.map(([stage, label]) => {
          const items = cards.filter((c) => c.stage === stage);
          return (
            <div key={stage} className="w-[260px] shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-[13px] font-semibold text-secondary">{label}</h2>
                <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold text-tertiary dark:bg-white/[0.1]">
                  {items.length}
                </span>
              </div>
              <div className="grid gap-2 rounded-2xl bg-black/[0.03] p-2 dark:bg-white/[0.04]">
                {items.map((app) => (
                  <Card key={app.id} app={app} />
                ))}
                {items.length === 0 && (
                  <p className="px-2 py-6 text-center text-[12px] text-tertiary">Empty</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
