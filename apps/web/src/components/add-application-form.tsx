"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { addManualApplication } from "@/app/actions/applications";
import { useToast } from "@/components/toast";

/**
 * Tracker's "Add application by link" panel. Previously a bare <details>/<summary>
 * wrapping a server-action form with uncontrolled inputs — on success the route
 * revalidated but the DOM form persisted, so fields stayed filled and the panel
 * stayed open with no feedback. This mirrors the sources-manager/writing-samples
 * pattern instead: controlled open state, resets on success, pending label, toast.
 */
export function AddApplicationForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const { showToast } = useToast();

  return (
    <div className="mb-5">
      {open ? (
        <form
          ref={formRef}
          action={(fd) =>
            startTransition(async () => {
              await addManualApplication(fd);
              formRef.current?.reset();
              setOpen(false);
              showToast("Application added");
            })
          }
          className="grid max-w-2xl gap-3 rounded-2xl bg-surface p-4 shadow-card sm:grid-cols-2"
        >
          <label className="grid gap-1 text-[13px] font-medium sm:col-span-2">
            Posting / careers URL
            <input
              name="url"
              required
              type="url"
              placeholder="https://…"
              className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal"
            />
          </label>
          <label className="grid gap-1 text-[13px] font-medium">
            Company <span className="font-normal text-tertiary">(auto-detected if blank)</span>
            <input
              name="company"
              className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal"
            />
          </label>
          <label className="grid gap-1 text-[13px] font-medium">
            Role <span className="font-normal text-tertiary">(auto-detected if blank)</span>
            <input
              name="roleTitle"
              className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal"
            />
          </label>
          <label className="grid gap-1 text-[13px] font-medium">
            Location
            <input
              name="location"
              className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal"
            />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-accent px-4 py-2 text-[14px] font-medium text-white transition-opacity active:scale-[0.98] hover:opacity-90 disabled:opacity-50 disabled:active:scale-100"
            >
              {pending ? "Adding…" : "Add to tracker"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="rounded-xl px-4 py-2 text-[14px] font-medium text-secondary transition-colors active:scale-[0.98] hover:bg-black/[0.04] disabled:opacity-50 disabled:active:scale-100 dark:hover:bg-white/[0.06]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex w-fit items-center gap-1.5 rounded-xl bg-accent-soft px-3.5 py-2 text-[14px] font-medium text-accent transition-opacity active:scale-[0.98] hover:opacity-80"
        >
          <Plus className="h-4 w-4" /> Add application by link
        </button>
      )}
    </div>
  );
}
