"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { addWritingSample, deleteWritingSample } from "@/app/actions/samples";
import { useToast } from "@/components/toast";

interface Sample {
  id: number;
  title: string;
  content: string;
}

function SampleSet({
  set,
  title,
  hint,
  samples,
}: {
  set: "cover_letter" | "short_answer";
  title: string;
  hint: string;
  samples: Sample[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  return (
    <div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mb-2 text-[12px] text-secondary">{hint}</p>
      <ul className="grid gap-1.5">
        {samples.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-2 rounded-lg bg-surface-secondary px-3 py-2"
          >
            <details className="min-w-0 flex-1">
              <summary className="cursor-pointer truncate text-[13px] font-medium">
                {s.title}
                <span className="ml-2 font-normal text-tertiary">
                  {s.content.length.toLocaleString()} chars
                </span>
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-[12px] text-secondary">{s.content}</p>
            </details>
            <button
              onClick={() =>
                startTransition(async () => {
                  await deleteWritingSample(s.id);
                  showToast("Sample deleted");
                })
              }
              aria-label={`Delete sample ${s.title}`}
              className="shrink-0 text-tertiary transition-colors active:scale-[0.98] hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {samples.length === 0 && (
          <li className="text-[13px] text-tertiary">No samples yet.</li>
        )}
      </ul>
      {open ? (
        <form
          action={(fd) =>
            startTransition(async () => {
              await addWritingSample(set, fd);
              setOpen(false);
              showToast("Sample added");
            })
          }
          className="mt-2 grid gap-2"
        >
          <input
            name="title"
            required
            placeholder={set === "cover_letter" ? "e.g. Stripe SWE cover letter 2025" : "e.g. “Why this company” — Datadog"}
            className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[13px]"
          />
          <textarea
            name="content"
            required
            rows={6}
            placeholder="Paste the full text…"
            className="rounded-lg border border-separator bg-surface-secondary p-3 text-[13px]"
          />
          <div className="flex gap-2">
            <button
              disabled={pending}
              className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              Add sample
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-secondary transition-transform active:scale-[0.98]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-2 flex items-center gap-1 rounded-lg bg-accent-soft px-3 py-1.5 text-[13px] font-medium text-accent transition-transform active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      )}
    </div>
  );
}

export function WritingSamples({
  coverLetters,
  shortAnswers,
}: {
  coverLetters: Sample[];
  shortAnswers: Sample[];
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <SampleSet
        set="cover_letter"
        title="Cover letter samples"
        hint="Full past cover letters — used to draft new tailored ones in your voice."
        samples={coverLetters}
      />
      <SampleSet
        set="short_answer"
        title="Short-answer samples"
        hint="Past answers to prompts like “why this company” — a separate voice from cover letters."
        samples={shortAnswers}
      />
    </div>
  );
}
