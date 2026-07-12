"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, Check, Trash2 } from "lucide-react";
import {
  addReminder,
  deleteApplication,
  deleteReminder,
  setApplicationMode,
  toggleReminder,
  updateApplication,
  updateStage,
} from "@/app/actions/applications";
import { STAGES, type Stage } from "@/components/tracker-board";
import { AutoApplyOptin, type AutoApplyData } from "@/components/auto-apply-optin";
import { useToast } from "@/components/toast";

export interface EditorData {
  id: number;
  company: string;
  roleTitle: string;
  location: string | null;
  mode: "manual" | "assist" | "auto" | null;
  autoApplyApprovedAt: string | null;
  stage: Stage;
  notes: string | null;
  resumeId: number | null;
  reminders: { id: number; label: string; dueAt: string; done: boolean }[];
  resumes: { id: number; name: string }[];
  recommendation: { recommended: "manual" | "assist"; reasons: string[] } | null;
  autoApply: AutoApplyData;
}

const MODES = [
  {
    value: "manual" as const,
    label: "Manual",
    desc: "You fill the portal yourself; the app just tracks it.",
    available: true,
  },
  {
    value: "assist" as const,
    label: "Agentic Assist",
    desc: "Drafted cover letter & answers in your voice + extension auto-fill. You review everything and submit yourself.",
    available: true,
  },
  {
    value: "auto" as const,
    label: "Full Auto-Apply",
    desc: "Submits for you after a deliberate per-application opt-in. You review everything once, up front.",
    available: true,
  },
];

export function ApplicationEditor({ data }: { data: EditorData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState(data.notes ?? "");
  const [remLabel, setRemLabel] = useState("");
  const [remDue, setRemDue] = useState("");
  const [details, setDetails] = useState({
    company: data.company,
    roleTitle: data.roleTitle,
    location: data.location ?? "",
  });
  const [showOptin, setShowOptin] = useState(false);
  const { showToast } = useToast();

  return (
    <div className="grid content-start gap-4">
      {/* Details — auto-detected fields are heuristic, so keep them editable */}
      <div className="rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold">Details</h2>
        <div className="grid gap-2">
          {(
            [
              ["company", "Company"],
              ["roleTitle", "Role title"],
              ["location", "Location"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="grid gap-1 text-[12px] font-medium text-secondary">
              {label}
              <input
                value={details[key]}
                onChange={(e) => setDetails({ ...details, [key]: e.target.value })}
                onBlur={() =>
                  startTransition(() =>
                    updateApplication(data.id, {
                      company: details.company,
                      roleTitle: details.roleTitle,
                      location: details.location,
                    }),
                  )
                }
                className="rounded-lg border border-separator bg-surface-secondary px-3 py-1.5 text-[14px] font-normal text-foreground"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Stage */}
      <div className="rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold">Stage</h2>
        <select
          value={data.stage}
          onChange={(e) => startTransition(() => updateStage(data.id, e.target.value as Stage))}
          className="w-full rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px]"
        >
          {STAGES.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-[12px] text-tertiary">
          Moving to “Applied” sends your submission-confirmation receipt and hides reposts of this
          role.
        </p>
      </div>

      {/* Mode — always explicit, never defaulted */}
      <div className="rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="mb-1 text-[15px] font-semibold">Application mode</h2>
        <p className="mb-3 text-[12px] text-secondary">
          You choose how much the app does for this application. Nothing is ever assumed.
        </p>
        {data.recommendation && (
          <div className="mb-3 rounded-xl bg-accent-soft p-3">
            <p className="text-[13px] font-semibold text-accent">
              Recommended: {data.recommendation.recommended === "assist" ? "Agentic Assist" : "Manual"}
            </p>
            {data.recommendation.reasons.map((r, i) => (
              <p key={i} className="mt-1 text-[12px] leading-snug text-secondary">
                {r}
              </p>
            ))}
            <p className="mt-1.5 text-[11px] text-tertiary">
              Just a suggestion — your choice always wins.
            </p>
          </div>
        )}
        <div className="grid gap-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              disabled={!m.available || pending}
              onClick={() => {
                // Auto never sets the mode directly — it opens the pre-submit
                // review, and approval happens there. Other modes toggle as before.
                if (m.value === "auto") {
                  setShowOptin(data.mode !== "auto");
                  return;
                }
                setShowOptin(false);
                startTransition(() =>
                  setApplicationMode(data.id, data.mode === m.value ? null : m.value),
                );
              }}
              className={`rounded-xl border p-3 text-left transition-colors active:scale-[0.98] disabled:active:scale-100 ${
                data.mode === m.value
                  ? "border-accent bg-accent-soft"
                  : "border-separator hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
              } ${!m.available ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <span className="flex items-center justify-between text-[14px] font-semibold">
                {m.label}
                {data.mode === m.value && <Check className="h-4 w-4 text-accent" />}
              </span>
              <span className="mt-0.5 block text-[12px] text-secondary">{m.desc}</span>
            </button>
          ))}
        </div>

        {/* Standing auto-apply approval — revocable. */}
        {data.mode === "auto" && !showOptin && (
          <p className="mt-2 text-[12px] text-secondary">
            Approved{" "}
            {data.autoApplyApprovedAt
              ? new Date(data.autoApplyApprovedAt).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                })
              : ""}{" "}
            ·{" "}
            <button
              disabled={pending}
              onClick={() => startTransition(() => setApplicationMode(data.id, null))}
              className="font-medium text-danger transition-colors hover:underline active:scale-[0.98] disabled:active:scale-100 disabled:opacity-50"
            >
              Revoke
            </button>
          </p>
        )}

        {/* Pre-submit review — opened by clicking Full Auto-Apply. */}
        {showOptin && (
          <AutoApplyOptin
            applicationId={data.id}
            data={data.autoApply}
            onCancel={() => setShowOptin(false)}
          />
        )}
      </div>

      {/* Resume */}
      <div className="rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold">Resume version</h2>
        {data.resumes.length === 0 ? (
          <p className="text-[13px] text-secondary">Upload resumes in Profile to pick one here.</p>
        ) : (
          <select
            value={data.resumeId ?? ""}
            onChange={(e) =>
              startTransition(() =>
                updateApplication(data.id, {
                  resumeId: e.target.value ? Number(e.target.value) : null,
                }),
              )
            }
            className="w-full rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px]"
          >
            <option value="">— none selected —</option>
            {data.resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Reminders */}
      <div className="rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="mb-2 flex items-center gap-1.5 text-[15px] font-semibold">
          <CalendarClock className="h-4 w-4 text-secondary" /> Reminders & OA deadlines
        </h2>
        <ul className="grid gap-1.5">
          {data.reminders.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={r.done}
                onChange={(e) => startTransition(() => toggleReminder(r.id, e.target.checked))}
                className="h-4 w-4 accent-[var(--accent)]"
                aria-label={`Done: ${r.label}`}
              />
              <span className={`flex-1 ${r.done ? "text-tertiary line-through" : ""}`}>
                {r.label}
              </span>
              <span className="text-tertiary">
                {new Date(r.dueAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric" })}
              </span>
              <button
                onClick={() => startTransition(() => deleteReminder(r.id))}
                aria-label={`Delete reminder ${r.label}`}
                className="text-tertiary transition-colors active:scale-[0.98] hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={remLabel}
            onChange={(e) => setRemLabel(e.target.value)}
            placeholder="e.g. HackerRank OA due"
            className="min-w-0 flex-1 rounded-lg border border-separator bg-surface-secondary px-3 py-1.5 text-[13px]"
          />
          <input
            type="datetime-local"
            value={remDue}
            onChange={(e) => setRemDue(e.target.value)}
            className="rounded-lg border border-separator bg-surface-secondary px-3 py-1.5 text-[13px]"
            aria-label="Reminder due date"
          />
          <button
            disabled={!remLabel || !remDue || pending}
            onClick={() =>
              startTransition(async () => {
                await addReminder(data.id, remLabel, remDue);
                setRemLabel("");
                setRemDue("");
                showToast("Reminder added");
              })
            }
            className="rounded-lg bg-accent-soft px-3 py-1.5 text-[13px] font-medium text-accent transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
          >
            Add
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full resize-y rounded-lg border border-separator bg-surface-secondary p-3 text-[14px] outline-none focus:border-accent"
        />
        <button
          onClick={() =>
            startTransition(async () => {
              await updateApplication(data.id, { notes });
              showToast("Notes saved");
            })
          }
          disabled={pending}
          className="mt-2 rounded-lg bg-accent-soft px-3.5 py-1.5 text-[13px] font-medium text-accent transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
        >
          {pending ? "Saving…" : "Save notes"}
        </button>
      </div>

      <button
        onClick={() => {
          if (confirm("Remove this application from the tracker?")) {
            startTransition(async () => {
              await deleteApplication(data.id);
              router.push("/tracker");
            });
          }
        }}
        className="justify-self-start rounded-xl px-3.5 py-2 text-[13px] font-medium text-danger transition-colors active:scale-[0.98] hover:bg-danger/10"
      >
        Delete application
      </button>
    </div>
  );
}
