"use client";

import { useState, useTransition } from "react";
import { Download, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  generateCoverLetter,
  generateShortAnswer,
  saveAssistDocuments,
} from "@/app/actions/assist";
import type { SavedDoc } from "@/lib/documents";
import { useToast } from "@/components/toast";

const DESTINATION_LABELS: Record<SavedDoc["destination"], string> = {
  gdrive: "Google Drive",
  local: "local download",
  inapp: "in-app storage",
};

interface QA {
  prompt: string;
  answer: string;
  generating?: boolean;
}

/**
 * Agentic Assist workspace: draft → review/edit (always) → save to the chosen
 * storage destination. Field auto-fill on the actual portal happens through
 * the companion Chrome extension, which pulls these same reviewed documents.
 */
export function AssistPanel({ applicationId }: { applicationId: number }) {
  const [coverLetter, setCoverLetter] = useState("");
  const [qas, setQas] = useState<QA[]>([]);
  const [newPrompt, setNewPrompt] = useState("");
  const [saved, setSaved] = useState<SavedDoc[] | null>(null);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  const genCover = () =>
    startTransition(async () => {
      setCoverLetter(await generateCoverLetter(applicationId));
      setSaved(null);
    });

  const addPrompt = () => {
    const prompt = newPrompt.trim();
    if (!prompt) return;
    setNewPrompt("");
    const idx = qas.length;
    setQas([...qas, { prompt, answer: "", generating: true }]);
    startTransition(async () => {
      const answer = await generateShortAnswer(applicationId, prompt);
      setQas((cur) => cur.map((q, i) => (i === idx ? { ...q, answer, generating: false } : q)));
      setSaved(null);
    });
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveAssistDocuments(applicationId, {
        coverLetter: coverLetter || undefined,
        answers: qas.filter((q) => q.answer.trim()).map(({ prompt, answer }) => ({ prompt, answer })),
      });
      setSaved(result);
      if (result.length > 0) {
        showToast(`Saved to ${DESTINATION_LABELS[result[0].destination]}`);
      }
    });

  return (
    <div className="rounded-2xl bg-surface p-5 shadow-card">
      <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
        <Sparkles className="h-4 w-4 text-accent" /> Agentic Assist
      </h2>
      <p className="mb-4 mt-1 text-[12px] text-secondary">
        Drafts are written in your voice from your writing samples. You can edit everything before
        it's used anywhere — nothing is submitted by the app.
      </p>

      {/* Cover letter */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">Cover letter</h3>
          <button
            onClick={genCover}
            disabled={pending}
            className="rounded-lg bg-accent-soft px-3 py-1.5 text-[13px] font-medium text-accent transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
          >
            {coverLetter ? "Regenerate" : "Generate"}
          </button>
        </div>
        {coverLetter ? (
          <textarea
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
            rows={12}
            className="w-full resize-y rounded-lg border border-separator bg-surface-secondary p-3 text-[13px] leading-relaxed outline-none focus:border-accent"
          />
        ) : (
          <p className="rounded-lg bg-surface-secondary p-3 text-[13px] text-tertiary">
            Tailored to this role from your cover-letter samples.
          </p>
        )}
      </div>

      {/* Short answers */}
      <div className="mb-4">
        <h3 className="mb-1.5 text-[14px] font-semibold">Short-answer questions</h3>
        <div className="grid gap-3">
          {qas.map((qa, i) => (
            <div key={i} className="rounded-lg border border-separator p-3">
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium">{qa.prompt}</p>
                <button
                  onClick={() => setQas(qas.filter((_, j) => j !== i))}
                  aria-label={`Remove question ${i + 1}`}
                  className="shrink-0 text-tertiary transition-colors active:scale-[0.98] hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {qa.generating ? (
                <p className="text-[13px] text-tertiary">Drafting in your short-answer voice…</p>
              ) : (
                <textarea
                  value={qa.answer}
                  onChange={(e) =>
                    setQas(qas.map((q, j) => (j === i ? { ...q, answer: e.target.value } : q)))
                  }
                  rows={5}
                  className="w-full resize-y rounded-lg border border-separator bg-surface-secondary p-2.5 text-[13px] leading-relaxed outline-none focus:border-accent"
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPrompt()}
            placeholder="Paste a question from the portal, e.g. “Why do you want to work here?”"
            className="min-w-0 flex-1 rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[13px]"
          />
          <button
            onClick={addPrompt}
            disabled={!newPrompt.trim() || pending}
            className="flex items-center gap-1 rounded-lg bg-accent-soft px-3 py-1.5 text-[13px] font-medium text-accent transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
          >
            <Plus className="h-3.5 w-3.5" /> Draft
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="border-t border-separator pt-3">
        <button
          onClick={save}
          disabled={pending || (!coverLetter && qas.every((q) => !q.answer.trim()))}
          className="rounded-xl bg-accent px-4 py-2 text-[14px] font-medium text-white transition-opacity active:scale-[0.98] hover:opacity-90 disabled:opacity-50 disabled:active:scale-100"
        >
          Save documents
        </button>
        {saved && saved.length > 0 && (
          <div className="mt-3 grid gap-1.5">
            {saved.map((d) => (
              <div key={d.documentId} className="flex items-center justify-between text-[13px]">
                <span className="text-secondary">
                  Saved to {d.destination === "gdrive" ? "Google Drive" : d.destination === "local" ? "local download" : "in-app storage"} · {d.location}
                </span>
                <a
                  href={d.downloadUrl}
                  className="flex items-center gap-1 font-medium text-accent"
                  download
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </div>
            ))}
            {saved.some((d) => d.driveError) && (
              <p className="text-[12px] text-warning">
                {saved.find((d) => d.driveError)?.driveError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
