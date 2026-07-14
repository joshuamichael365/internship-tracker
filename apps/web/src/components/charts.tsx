"use client";

/**
 * Small chart primitives for the analytics page, built to the dataviz method:
 * thin marks with 4px rounded data-ends on a recessive track, a 2px surface gap
 * between segments, values/labels in ink tokens (never the series colour), a
 * native per-mark hover title, and a grow-in on first view. Colours are the
 * app's own stage/mode/status tokens (a fixed categorical order), passed as CSS
 * variable names — identity-preserving rather than a generated ramp.
 */

import { motion } from "motion/react";

export interface Datum {
  label: string;
  value: number;
  colorVar: string;
  dashed?: boolean;
  /** Per-row denominator (e.g. a rate); falls back to the shared total. */
  denom?: number;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** Ordered proportion bars — one row per category, width is its share of total. */
export function ProportionBars({ data, total }: { data: Datum[]; total: number }) {
  return (
    <div className="grid gap-2.5">
      {data.map((d, i) => {
        const denom = d.denom ?? total;
        const pct = denom > 0 ? Math.round((d.value / denom) * 100) : 0;
        return (
          <div key={d.label} className="flex items-center gap-3" title={`${d.label}: ${d.value} (${pct}%)`}>
            <span className="flex w-[132px] shrink-0 items-center gap-1.5 truncate text-[13px] text-secondary">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${d.dashed ? "border border-dashed" : ""}`}
                style={
                  d.dashed
                    ? { borderColor: `var(${d.colorVar})`, background: "transparent" }
                    : { background: `var(${d.colorVar})` }
                }
              />
              {d.label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.07]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: `var(${d.colorVar})` }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, delay: 0.04 * i, ease: EASE }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums text-secondary">
              {d.value} <span className="text-tertiary">({pct}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A single 100%-composition bar with a legend — the right form when the data is
 * "parts of one whole" (mode split, posting status). Segments carry a 2px
 * surface gap; the legend carries identity so colour is never the only cue.
 */
export function SegmentedBar({ data }: { data: Datum[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const shown = data.filter((d) => d.value > 0);

  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.07]">
        {total > 0 &&
          shown.map((d, i) => {
            const pct = (d.value / total) * 100;
            return (
              <motion.div
                key={d.label}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ background: `var(${d.colorVar})` }}
                title={`${d.label}: ${d.value} (${Math.round(pct)}%)`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, delay: 0.05 * i, ease: EASE }}
              />
            );
          })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <span key={d.label} className="flex items-center gap-1.5 text-[12px] text-secondary">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${d.dashed ? "border border-dashed" : ""}`}
                style={
                  d.dashed
                    ? { borderColor: `var(${d.colorVar})`, background: "transparent" }
                    : { background: `var(${d.colorVar})` }
                }
              />
              {d.label}
              <span className="font-semibold tabular-nums text-foreground">{d.value}</span>
              <span className="text-tertiary">({pct}%)</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
