"use client";

import { useState, useTransition } from "react";
import { GraduationCap } from "lucide-react";
import { generatePrep } from "@/app/actions/prep";
import type { InterviewPrep } from "@/lib/interview-prep";
import { Card } from "@/components/ui";
import { useToast } from "@/components/toast";

const DIFFICULTY_STYLES: Record<InterviewPrep["practiceProblems"][number]["difficulty"], string> = {
  easy: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-success",
  medium: "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-warning",
  hard: "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger",
};

/**
 * Interview & skill-prep guidance, generated from the posting description and
 * cached on the application row. Unlike AssistPanel this is useful in every
 * mode — it never touches the application's drafts or submission path.
 */
export function PrepPanel({
  applicationId,
  initialPrep,
}: {
  applicationId: number;
  initialPrep: InterviewPrep | null;
}) {
  const [prep, setPrep] = useState<InterviewPrep | null>(initialPrep);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  const generate = () =>
    startTransition(async () => {
      try {
        setPrep(await generatePrep(applicationId));
      } catch {
        showToast("Couldn't generate prep — try again");
      }
    });

  return (
    <Card>
      <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
        <GraduationCap className="h-4 w-4 text-accent" /> Interview & skill prep
      </h2>

      {!prep ? (
        <>
          <p className="mb-4 mt-1 text-[13px] text-secondary">
            Turns this posting into concrete prep: likely focus areas, practice problems, project
            ideas, resources, and behavioral prompts — grounded in the description, not generic advice.
          </p>
          <button
            onClick={generate}
            disabled={pending}
            className="rounded-xl bg-accent px-4 py-2 text-[14px] font-medium text-white transition-opacity active:scale-[0.98] hover:opacity-90 disabled:opacity-50 disabled:active:scale-100"
          >
            {pending ? "Generating…" : "Generate prep"}
          </button>
        </>
      ) : (
        <div className="mt-3 grid gap-4">
          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-secondary">Focus areas</h3>
            <div className="grid gap-2">
              {prep.focusAreas.map((f, i) => (
                <div key={i} className="rounded-lg bg-surface-secondary p-2.5">
                  <p className="text-[13px] font-medium">{f.topic}</p>
                  <p className="text-[12px] text-tertiary">{f.why}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-secondary">Practice problems</h3>
            <div className="grid gap-1.5">
              {prep.practiceProblems.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[13px]">
                  <span>
                    {p.name} <span className="text-tertiary">· {p.pattern}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${DIFFICULTY_STYLES[p.difficulty]}`}
                  >
                    {p.difficulty}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-secondary">Project ideas</h3>
            <ul className="grid gap-1 text-[13px] text-secondary">
              {prep.projectIdeas.map((idea, i) => (
                <li key={i}>• {idea}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-secondary">Resources</h3>
            <div className="flex flex-wrap gap-1.5">
              {prep.resources.map((r, i) => (
                <span
                  key={i}
                  className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold text-secondary dark:bg-white/[0.1]"
                >
                  {r.name} <span className="font-normal text-tertiary">· {r.kind}</span>
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-secondary">Behavioral prompts</h3>
            <ul className="grid gap-1 text-[13px] text-secondary">
              {prep.behavioral.map((b, i) => (
                <li key={i}>• {b}</li>
              ))}
            </ul>
          </section>

          <div className="border-t border-separator pt-3">
            <button
              onClick={generate}
              disabled={pending}
              className="rounded-lg bg-accent-soft px-3 py-1.5 text-[13px] font-medium text-accent transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {pending ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
