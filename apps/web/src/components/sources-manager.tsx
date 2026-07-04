"use client";

import { useState, useTransition } from "react";
import { CircleAlert, Plus, Trash2 } from "lucide-react";
import { addPresetSource, addSource, deleteSource, toggleSource } from "@/app/actions/sources";
import { useToast } from "@/components/toast";

const KIND_FIELDS: Record<string, { field: string; label: string; placeholder: string }[]> = {
  github_repo: [
    { field: "repo", label: "Repository", placeholder: "owner/repo" },
    { field: "branch", label: "Branch (default: dev)", placeholder: "dev" },
    { field: "listingsPath", label: "listings.json path (optional)", placeholder: ".github/scripts/listings.json" },
  ],
  greenhouse: [{ field: "boardToken", label: "Board token", placeholder: "stripe" }],
  lever: [{ field: "site", label: "Site name", placeholder: "palantir" }],
  smartrecruiters: [{ field: "company", label: "Company id", placeholder: "Visa" }],
  workday: [
    { field: "host", label: "Host", placeholder: "nvidia.wd5.myworkdayjobs.com" },
    { field: "tenant", label: "Tenant", placeholder: "nvidia" },
    { field: "site", label: "Site", placeholder: "NVIDIAExternalCareerSite" },
    { field: "searchText", label: "Search text", placeholder: "intern" },
  ],
  rss: [
    { field: "feedUrl", label: "Feed URL", placeholder: "https://example.com/feed.xml" },
    { field: "defaultCompany", label: "Default company (optional)", placeholder: "" },
  ],
  instagram_mirror: [
    { field: "feedUrl", label: "Bridge feed URL", placeholder: "https://rss-bridge.../instagram/zero2sudo" },
    { field: "defaultCompany", label: "Label", placeholder: "zero2sudo" },
  ],
};

const KIND_LABELS: Record<string, string> = {
  github_repo: "GitHub repo",
  greenhouse: "Greenhouse",
  lever: "Lever",
  smartrecruiters: "SmartRecruiters",
  workday: "Workday",
  rss: "RSS / Atom",
  instagram_mirror: "Instagram mirror",
};

interface SourceRow {
  id: number;
  kind: string;
  name: string;
  enabled: boolean;
  lastPolledAt: string | null;
  lastError: string | null;
}

export function SourcesManager({ sources, hasPresets }: { sources: SourceRow[]; hasPresets: boolean }) {
  const [kind, setKind] = useState("github_repo");
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  return (
    <div>
      <ul className="divide-y divide-separator">
        {sources.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{s.name}</p>
              <p className="text-[12px] text-tertiary">
                {KIND_LABELS[s.kind] ?? s.kind}
                {s.lastPolledAt &&
                  ` · polled ${new Date(s.lastPolledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
              </p>
              {s.lastError && (
                <p className="mt-0.5 flex items-center gap-1 text-[12px] text-danger">
                  <CircleAlert className="h-3 w-3 shrink-0" /> {s.lastError}
                </p>
              )}
            </div>
            <button
              onClick={() => startTransition(() => toggleSource(s.id, !s.enabled))}
              role="switch"
              aria-checked={s.enabled}
              aria-label={`${s.name} enabled`}
              className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors ${s.enabled ? "bg-success" : "bg-black/[0.15] dark:bg-white/[0.2]"}`}
            >
              <span
                className={`absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-card transition-[left] ${s.enabled ? "left-[20px]" : "left-[2px]"}`}
              />
            </button>
            <button
              onClick={() =>
                startTransition(async () => {
                  await deleteSource(s.id);
                  showToast("Source deleted");
                })
              }
              aria-label={`Delete ${s.name}`}
              className="rounded-lg p-1.5 text-tertiary transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {sources.length === 0 && (
          <li className="py-3 text-[13px] text-secondary">No sources yet — add one below.</li>
        )}
      </ul>

      {!hasPresets && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await addPresetSource("simplify");
                showToast("Source added");
              })
            }
            className="rounded-full bg-accent-soft px-3.5 py-1.5 text-[13px] font-medium text-accent transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            + SimplifyJobs repo
          </button>
          <button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await addPresetSource("vanshb03");
                showToast("Source added");
              })
            }
            className="rounded-full bg-accent-soft px-3.5 py-1.5 text-[13px] font-medium text-accent transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            + vanshb03 repo
          </button>
        </div>
      )}

      {showForm ? (
        <form
          action={(fd) => {
            startTransition(async () => {
              await addSource(fd);
              setShowForm(false);
              showToast("Source added");
            });
          }}
          className="mt-4 grid gap-3 rounded-xl bg-surface-secondary p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[13px] font-medium">
              Type
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="rounded-lg border border-separator bg-surface px-3 py-2 text-[14px]"
              >
                {Object.entries(KIND_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[13px] font-medium">
              Display name
              <input
                name="name"
                required
                placeholder="e.g. Stripe careers"
                className="rounded-lg border border-separator bg-surface px-3 py-2 text-[14px]"
              />
            </label>
            {KIND_FIELDS[kind]?.map(({ field, label, placeholder }) => (
              <label key={field} className="grid gap-1 text-[13px] font-medium">
                {label}
                <input
                  name={field}
                  placeholder={placeholder}
                  className="rounded-lg border border-separator bg-surface px-3 py-2 text-[14px]"
                />
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-accent px-4 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Add source
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl px-4 py-2 text-[14px] font-medium text-secondary transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="mt-4 flex items-center gap-1.5 rounded-xl bg-accent-soft px-3.5 py-2 text-[14px] font-medium text-accent transition-opacity hover:opacity-80"
        >
          <Plus className="h-4 w-4" /> Add source
        </button>
      )}
    </div>
  );
}
