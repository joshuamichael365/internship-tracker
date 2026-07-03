"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Star, Trash2, Upload } from "lucide-react";
import { deleteResume, saveProfile, setDefaultResume, uploadResume } from "@/app/actions/profile";
import { timeAgo } from "@/lib/format";

const PROFILE_FIELDS: { key: string; label: string; placeholder?: string; span2?: boolean }[] = [
  { key: "fullName", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location", placeholder: "City, State" },
  { key: "linkedin", label: "LinkedIn URL" },
  { key: "github", label: "GitHub URL" },
  { key: "website", label: "Portfolio / website" },
  { key: "school", label: "University" },
  { key: "degree", label: "Degree", placeholder: "B.S. Computer Science" },
  { key: "gradDate", label: "Expected graduation", placeholder: "May 2027" },
  { key: "gpa", label: "GPA" },
  { key: "workAuth", label: "Work authorization", placeholder: "US citizen / F-1 OPT / …" },
];

const YES_NO_OPTIONS = ["", "Yes", "No"];

const APPLICATION_ANSWER_FIELDS: {
  key: string;
  label: string;
  placeholder?: string;
  type: "text" | "select";
}[] = [
  { key: "pronouns", label: "Pronouns", placeholder: "e.g. he/him", type: "text" },
  { key: "requiresSponsorship", label: "Requires sponsorship", type: "select" },
  { key: "authorizedToWork", label: "Authorized to work", type: "select" },
  { key: "currentlyEnrolled", label: "Currently enrolled", type: "select" },
  { key: "willingToRelocate", label: "Willing to relocate", type: "select" },
  { key: "gender", label: "Gender", type: "text" },
  { key: "raceEthnicity", label: "Race / ethnicity", type: "text" },
  {
    key: "veteranStatus",
    label: "Veteran status",
    placeholder: "I am not a protected veteran",
    type: "text",
  },
  {
    key: "disabilityStatus",
    label: "Disability status",
    placeholder: "No, I do not have a disability",
    type: "text",
  },
  { key: "howDidYouHear", label: "How did you hear about us", placeholder: "Company careers page", type: "text" },
];

export function ResumeManager({
  resumes,
}: {
  resumes: { id: number; name: string; isDefault: boolean; createdAt: string; parsed: boolean }[];
}) {
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <ul className="divide-y divide-separator">
        {resumes.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-3">
            <FileText className="h-5 w-5 shrink-0 text-secondary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">
                {r.name}
                {r.isDefault && (
                  <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                    Default
                  </span>
                )}
              </p>
              <p className="text-[12px] text-tertiary">
                uploaded {timeAgo(r.createdAt)}
                {!r.parsed && " · parsing activates once the Claude API key is configured"}
              </p>
            </div>
            {!r.isDefault && (
              <button
                onClick={() => startTransition(() => setDefaultResume(r.id))}
                aria-label={`Make ${r.name} default`}
                title="Make default"
                className="rounded-lg p-1.5 text-tertiary transition-colors hover:bg-black/[0.04] hover:text-warning dark:hover:bg-white/[0.06]"
              >
                <Star className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => startTransition(() => deleteResume(r.id))}
              aria-label={`Delete ${r.name}`}
              className="rounded-lg p-1.5 text-tertiary transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {resumes.length === 0 && (
          <li className="py-3 text-[13px] text-secondary">
            No resumes yet — upload your general SWE and ML-focused versions.
          </li>
        )}
      </ul>
      <form
        action={(fd) => startTransition(async () => {
          await uploadResume(fd);
          if (fileRef.current) fileRef.current.value = "";
        })}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept=".pdf,.doc,.docx"
          required
          className="text-[13px] file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-accent"
        />
        <input
          name="name"
          placeholder="Label (e.g. ML-focused)"
          className="rounded-lg border border-separator bg-surface-secondary px-3 py-1.5 text-[13px]"
        />
        <button
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" /> Upload
        </button>
      </form>
    </div>
  );
}

export function ProfileForm({ initial }: { initial: Record<string, string> }) {
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PROFILE_FIELDS.map((f) => (
          <label key={f.key} className="grid gap-1 text-[13px] font-medium">
            {f.label}
            <input
              value={data[f.key] ?? ""}
              onChange={(e) => {
                setData({ ...data, [f.key]: e.target.value });
                setSaved(false);
              }}
              placeholder={f.placeholder}
              className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal"
            />
          </label>
        ))}
      </div>

      <h3 className="mt-6 text-[14px] font-semibold">Application answers</h3>
      <p className="mt-1 text-[12px] text-tertiary">
        Used to answer the standard eligibility and demographic questions portals ask.
        Demographic fields are optional — leave blank to always answer those yourself.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {APPLICATION_ANSWER_FIELDS.map((f) => (
          <label key={f.key} className="grid gap-1 text-[13px] font-medium">
            {f.label}
            {f.type === "select" ? (
              <select
                value={data[f.key] ?? ""}
                onChange={(e) => {
                  setData({ ...data, [f.key]: e.target.value });
                  setSaved(false);
                }}
                className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal"
              >
                {YES_NO_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === "" ? "—" : opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={data[f.key] ?? ""}
                onChange={(e) => {
                  setData({ ...data, [f.key]: e.target.value });
                  setSaved(false);
                }}
                placeholder={f.placeholder}
                className="rounded-lg border border-separator bg-surface-secondary px-3 py-2 text-[14px] font-normal"
              />
            )}
          </label>
        ))}
      </div>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await saveProfile(data);
            setSaved(true);
          })
        }
        className="mt-4 rounded-xl bg-accent px-4 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {saved ? "Saved ✓" : "Save profile"}
      </button>
      <p className="mt-2 text-[12px] text-tertiary">
        These fields power form auto-fill in Agentic Assist — resume parsing will enrich them
        automatically once the Claude API key is set up.
      </p>
    </div>
  );
}
