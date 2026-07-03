/**
 * Company logo with graceful fallback.
 *
 * Renders a favicon from Google's favicon service for the derived company
 * domain, inside a rounded square. When no real company domain can be derived
 * (job-board hosts like greenhouse/lever/ashby/workday don't identify the
 * company), we fall back to a letter avatar on an accent-soft background.
 *
 * This is a client component so it can swap to the letter fallback when the
 * favicon fails to load (some domains return a blank globe).
 */
"use client";

import { useState } from "react";

/** Hosts that belong to ATS / job-board vendors, not the hiring company. */
const JOB_BOARD_HOSTS = [
  "greenhouse.io",
  "boards.greenhouse.io",
  "lever.co",
  "jobs.lever.co",
  "ashbyhq.com",
  "jobs.ashbyhq.com",
  "myworkdayjobs.com",
  "workday.com",
  "icims.com",
  "smartrecruiters.com",
  "workable.com",
  "bamboohr.com",
  "jobvite.com",
  "taleo.net",
  "successfactors.com",
  "linkedin.com",
  "indeed.com",
  "google.com",
  "docs.google.com",
  "notion.so",
  "airtable.com",
];

/** Derive a company web domain from a posting/application URL, or null. */
export function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (!host || !host.includes(".")) return null;
    // If the host (or its registrable parent) is a known job board, we can't
    // identify the company from it — signal caller to use the letter fallback.
    if (JOB_BOARD_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))) return null;
    return host;
  } catch {
    return null;
  }
}

const SIZES = {
  sm: { box: "h-8 w-8 rounded-lg text-[13px]", img: 32 },
  md: { box: "h-10 w-10 rounded-[10px] text-[15px]", img: 40 },
  lg: { box: "h-12 w-12 rounded-xl text-[18px]", img: 48 },
} as const;

export function CompanyLogo({
  company,
  url,
  size = "sm",
  className = "",
}: {
  company: string;
  url?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const domain = domainFromUrl(url);
  const [failed, setFailed] = useState(false);
  const s = SIZES[size];
  const letter = company?.trim()?.[0]?.toUpperCase() ?? "?";

  const showFallback = !domain || failed;

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-separator ${s.box} ${
        showFallback ? "bg-accent-soft font-semibold text-accent" : "bg-white"
      } ${className}`}
      aria-hidden="true"
    >
      {showFallback ? (
        letter
      ) : (
        // Tiny external favicon — a plain <img> avoids next/image remote config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt=""
          width={s.img}
          height={s.img}
          loading="lazy"
          className="h-full w-full object-contain p-1"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
