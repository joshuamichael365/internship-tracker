"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, ImagePlus, ListPlus, Loader2 } from "lucide-react";
import { createPostingFromIntake, extractFromScreenshot, type ConfirmedIntake } from "@/app/actions/intake";
import { trackPosting } from "@/app/actions/postings";
import { useToast } from "@/components/toast";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 10 * 1024 * 1024;

interface FormFields {
  company: string;
  title: string;
  url: string;
  locations: string; // comma-separated for editing; split into an array on submit
  term: string;
  notes: string;
}

/**
 * Screenshot intake: upload a screenshot (typically an Instagram story) →
 * Haiku extracts the posting → the user reviews/edits every field → confirm
 * creates a normal tracked posting. Nothing is saved until the user clicks
 * Confirm, and the screenshot itself is never persisted (see
 * lib/screenshot-extract.ts and app/actions/intake.ts).
 */
export function ScreenshotIntake() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, startExtract] = useTransition();
  const [extractMessage, setExtractMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<FormFields | null>(null);
  const [saving, startSave] = useTransition();
  const [tracking, startTrack] = useTransition();
  const [tracked, setTracked] = useState(false);
  const [result, setResult] = useState<{ status: "created" | "existing"; postingId: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setExtractMessage(null);
    setFields(null);
    setResult(null);
    setTracked(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("That's not an image file");
      return;
    }
    if (file.size > MAX_BYTES) {
      showToast("Image is larger than 10MB");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setTracked(false);
    setFields(null);
    setExtractMessage(null);

    const formData = new FormData();
    formData.set("image", file);
    startExtract(async () => {
      const extraction = await extractFromScreenshot(formData);
      setExtractMessage(extraction.message ?? null);
      setFields({
        company: extraction.data.company,
        title: extraction.data.title,
        url: extraction.data.url ?? "",
        locations: (extraction.data.locations ?? []).join(", "),
        term: extraction.data.term ?? "",
        notes: extraction.data.notes ?? "",
      });
    });
  }

  function confirm() {
    if (!fields) return;
    const input: ConfirmedIntake = {
      company: fields.company,
      title: fields.title,
      url: fields.url || undefined,
      locations: fields.locations
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
      term: fields.term || undefined,
      notes: fields.notes || undefined,
    };
    startSave(async () => {
      const res = await createPostingFromIntake(input);
      setResult(res);
      showToast(res.status === "created" ? "Posting added" : "Already known — here it is");
    });
  }

  function track() {
    if (!result) return;
    startTrack(async () => {
      await trackPosting(result.postingId);
      setTracked(true);
      showToast("Tracking it");
    });
  }

  const canConfirm = !!fields && fields.company.trim() !== "" && fields.title.trim() !== "";

  // Success state: the posting exists (new or already known) — offer to view/track it or start over.
  if (result) {
    return (
      <div className="rounded-2xl bg-surface p-5 shadow-card">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div>
            <p className="text-[15px] font-semibold">
              {result.status === "created" ? "Posting added" : "Already known"}
            </p>
            <p className="mt-1 text-[13px] text-secondary">
              {result.status === "created"
                ? "It's in Internships with the details you confirmed."
                : "This company + role + location was already tracked — no duplicate was created."}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/internships/${result.postingId}`}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
          >
            View posting <ExternalLink className="h-4 w-4" />
          </Link>
          {!tracked ? (
            <button
              onClick={track}
              disabled={tracking}
              className="flex items-center gap-1.5 rounded-xl bg-surface-secondary px-3.5 py-2 text-[14px] font-medium text-secondary shadow-card transition-colors active:scale-[0.98] hover:text-foreground disabled:opacity-50 disabled:active:scale-100"
            >
              <ListPlus className="h-4 w-4" /> Track it
            </button>
          ) : (
            <span className="flex items-center gap-1.5 rounded-xl bg-accent-soft px-3.5 py-2 text-[14px] font-medium text-accent">
              <ListPlus className="h-4 w-4" /> In tracker
            </span>
          )}
          <button
            onClick={reset}
            className="rounded-xl px-3.5 py-2 text-[14px] font-medium text-secondary transition-colors active:scale-[0.98] hover:text-foreground"
          >
            Add another screenshot
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files[0] ?? null);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center shadow-card transition-colors ${
          dragOver ? "border-accent bg-accent-soft" : "border-separator bg-surface"
        }`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Selected screenshot"
            className="max-h-64 rounded-xl object-contain shadow-card"
          />
        ) : (
          <ImagePlus className="h-9 w-9 text-tertiary" />
        )}
        <div>
          <p className="text-[15px] font-medium">
            {previewUrl ? "Tap to choose a different screenshot" : "Drop a screenshot here, or tap to choose one"}
          </p>
          <p className="mt-1 text-[13px] text-tertiary">PNG, JPG, or WebP · up to 10MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {extracting && (
        <div className="flex items-center gap-2 rounded-2xl bg-surface p-4 text-[14px] text-secondary shadow-card">
          <Loader2 className="h-4 w-4 animate-spin text-accent" /> Reading the screenshot…
        </div>
      )}

      {fields && !extracting && (
        <div className="rounded-2xl bg-surface p-5 shadow-card">
          <h2 className="mb-1 text-[15px] font-semibold">Confirm the details</h2>
          <p className="mb-3 text-[13px] text-secondary">
            Nothing is saved until you confirm — edit anything that looks off.
          </p>
          {extractMessage && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-[13px] text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{extractMessage}</span>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[13px] font-medium">
              Company
              <input
                value={fields.company}
                onChange={(e) => setFields({ ...fields, company: e.target.value })}
                placeholder="e.g. Stripe"
                className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal"
              />
            </label>
            <label className="grid gap-1 text-[13px] font-medium">
              Role title
              <input
                value={fields.title}
                onChange={(e) => setFields({ ...fields, title: e.target.value })}
                placeholder="e.g. Software Engineer Intern"
                className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal"
              />
            </label>
            <label className="grid gap-1 text-[13px] font-medium sm:col-span-2">
              Posting URL <span className="font-normal text-tertiary">(optional — leave blank if not legible)</span>
              <input
                value={fields.url}
                onChange={(e) => setFields({ ...fields, url: e.target.value })}
                placeholder="https://…"
                className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal"
              />
            </label>
            <label className="grid gap-1 text-[13px] font-medium">
              Locations <span className="font-normal text-tertiary">(comma-separated)</span>
              <input
                value={fields.locations}
                onChange={(e) => setFields({ ...fields, locations: e.target.value })}
                placeholder="San Francisco, CA · Remote"
                className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal"
              />
            </label>
            <label className="grid gap-1 text-[13px] font-medium">
              Term
              <input
                value={fields.term}
                onChange={(e) => setFields({ ...fields, term: e.target.value })}
                placeholder="Summer 2027"
                className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal"
              />
            </label>
            <label className="grid gap-1 text-[13px] font-medium sm:col-span-2">
              Notes
              <textarea
                value={fields.notes}
                onChange={(e) => setFields({ ...fields, notes: e.target.value })}
                rows={3}
                placeholder="Deadline, compensation, requirements — anything else from the screenshot"
                className="resize-y rounded-lg border border-separator bg-surface-secondary p-3 text-[14px] font-normal leading-relaxed"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={confirm}
              disabled={!canConfirm || saving}
              className="rounded-xl bg-accent px-4 py-2 text-[14px] font-medium text-white transition-opacity active:scale-[0.98] hover:opacity-90 disabled:opacity-50 disabled:active:scale-100"
            >
              {saving ? "Adding…" : "Confirm & add posting"}
            </button>
            <button
              onClick={reset}
              className="rounded-xl px-3.5 py-2 text-[14px] font-medium text-secondary transition-colors active:scale-[0.98] hover:text-foreground"
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
