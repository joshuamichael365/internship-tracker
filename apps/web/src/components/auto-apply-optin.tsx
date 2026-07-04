"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { approveAutoApply } from "@/app/actions/applications";

export interface AutoApplyData {
  profile: Record<string, string>;
  drafts: { coverLetter?: string; answers?: { prompt: string; answer: string }[] };
  resumeName: string | null;
}

/**
 * Pre-submit review for Full Auto-Apply. Shows exactly what will be submitted —
 * every profile field, the resume, the full cover letter, each Q&A — and gates
 * approval behind an explicit checkbox. Mode 'auto' is never set without this.
 */
export function AutoApplyOptin({
  applicationId,
  data,
  onCancel,
}: {
  applicationId: number;
  data: AutoApplyData;
  onCancel: () => void;
}) {
  const [understood, setUnderstood] = useState(false);
  const [pending, startTransition] = useTransition();

  const answers = data.drafts.answers ?? [];
  const hasDrafts = !!data.drafts.coverLetter || answers.length > 0;
  const ready = hasDrafts && !!data.resumeName;
  const profileEntries = Object.entries(data.profile).filter(([, v]) => String(v ?? "").trim());

  if (!ready) {
    return (
      <div className="mt-3 rounded-xl border border-warning/40 bg-warning/5 p-3">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-warning">
          <AlertTriangle className="h-4 w-4" /> Not ready for Auto-Apply
        </p>
        <p className="mt-1 text-[12px] leading-snug text-secondary">
          Auto-Apply needs your reviewed drafts and a resume version — generate and save them in
          Agentic Assist first.
        </p>
        <button
          onClick={onCancel}
          className="mt-2 rounded-lg px-2.5 py-1 text-[12px] font-medium text-secondary transition-colors active:scale-[0.98] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-accent/40 bg-accent-soft p-3">
      <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-accent">
        <ShieldCheck className="h-4 w-4" /> Review before Auto-Apply
      </h3>
      <p className="mt-1 text-[12px] leading-snug text-secondary">
        This is exactly what will be submitted for you — no final review click on the portal.
      </p>

      {/* Profile fields */}
      <div className="mt-3">
        <p className="text-[12px] font-semibold text-secondary">Profile fields</p>
        <dl className="mt-1 grid gap-0.5">
          {profileEntries.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3 text-[12px]">
              <dt className="text-tertiary">{key}</dt>
              <dd className="min-w-0 truncate text-right text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Resume */}
      <div className="mt-3">
        <p className="text-[12px] font-semibold text-secondary">Resume version</p>
        <p className="mt-0.5 text-[12px] text-foreground">{data.resumeName}</p>
      </div>

      {/* Cover letter */}
      {data.drafts.coverLetter && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold text-secondary">Cover letter</p>
          <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface p-2.5 text-[12px] leading-relaxed text-foreground">
            {data.drafts.coverLetter}
          </div>
        </div>
      )}

      {/* Short answers */}
      {answers.length > 0 && (
        <div className="mt-3 grid gap-2">
          <p className="text-[12px] font-semibold text-secondary">Short answers</p>
          {answers.map((qa, i) => (
            <div key={i} className="rounded-lg bg-surface p-2.5">
              <p className="text-[12px] font-medium text-foreground">{qa.prompt}</p>
              <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-secondary">
                {qa.answer}
              </p>
            </div>
          ))}
        </div>
      )}

      <label className="mt-3 flex items-start gap-2 text-[12px] text-foreground">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
        />
        I understand this application will be submitted without a final review click.
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={!understood || pending}
          onClick={() => startTransition(() => approveAutoApply(applicationId))}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity active:scale-[0.98] hover:opacity-90 disabled:opacity-50 disabled:active:scale-100"
        >
          Approve Auto-Apply for this application
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-secondary transition-colors active:scale-[0.98] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
