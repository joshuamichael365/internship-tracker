/**
 * Company logo with graceful, multi-candidate fallback.
 *
 * Most postings link to an ATS/job-board host (Greenhouse, Lever, Ashby,
 * Workday…) rather than the company's own site, so a naive "favicon of the URL
 * host" only ever resolved a handful of logos — everything else fell back to a
 * bare letter. We now build an *ordered list* of domain candidates and try each
 * in turn, advancing to the next when a favicon 404s:
 *
 *   1. the URL host itself, when it's a real company domain (not a job board);
 *   2. the company slug embedded in the ATS URL (greenhouse.io/<slug>,
 *      <tenant>.myworkdayjobs.com, ashbyhq.com/<slug>, …) → `<slug>.com`;
 *   3. a domain guessed from the company name → `<name>.com`.
 *
 * Favicons come from DuckDuckGo's icon service, which returns a real 404 for
 * unknown domains (Google's service serves a generic globe with a 200, which we
 * can't distinguish from a real icon) — so a wrong guess cleanly advances to
 * the next candidate and ultimately to the letter avatar, never a stray globe.
 *
 * Client component so it can walk the candidate list as favicons fail to load.
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

/** Descriptor words that aren't part of a company's domain. */
const NAME_NOISE = new Set([
  "the", "inc", "llc", "ltd", "corp", "corporation", "co", "company", "technologies",
  "technology", "software", "labs", "lab", "group", "holdings", "systems", "solutions",
  "global", "international", "worldwide", "capital", "partners", "ventures",
]);

/** `Foo & Bar Technologies` → `foo.com`. Best-effort; a wrong guess 404s to the letter. */
function domainFromCompanyName(company: string): string | null {
  const base = company
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ") // drop parentheticals
    .split(/\s+and\s+|\s*[,/|]\s*/)[0]! // joint ventures / lists → take the first entity
    .replace(/[^a-z0-9 ]/g, " ");
  const words = base.split(/\s+/).filter((w) => w && !NAME_NOISE.has(w));
  const slug = words.join("");
  return slug.length >= 2 ? `${slug}.com` : null;
}

/** Pull the company slug an ATS puts in its URL, e.g. greenhouse.io/<slug> or <tenant>.myworkdayjobs.com. */
function domainFromAtsUrl(host: string, pathname: string): string | null {
  const firstSeg = pathname.split("/").filter(Boolean)[0];
  const clean = (s?: string) => (s ? s.toLowerCase().replace(/[^a-z0-9]/g, "") : "");

  if (host.endsWith("myworkdayjobs.com") || host.endsWith("workday.com")) {
    const tenant = host.split(".")[0]; // <tenant>.wdN.myworkdayjobs.com
    if (tenant && !/^(www|wd\d+)$/.test(tenant)) return `${clean(tenant)}.com`;
  }
  if (
    host.endsWith("greenhouse.io") ||
    host.endsWith("lever.co") ||
    host.endsWith("ashbyhq.com") ||
    host.endsWith("smartrecruiters.com")
  ) {
    if (firstSeg && !/^(jobs|careers|embed)$/.test(firstSeg)) return `${clean(firstSeg)}.com`;
  }
  return null;
}

/** Derive a company web domain from a posting/application URL, or null (job-board host). */
export function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (!host || !host.includes(".")) return null;
    if (JOB_BOARD_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))) return null;
    return host;
  } catch {
    return null;
  }
}

/** Ordered, de-duplicated list of favicon domains to try, best signal first. */
function candidateDomains(company: string, url?: string | null): string[] {
  const out: (string | null)[] = [domainFromUrl(url)];
  if (url) {
    try {
      const u = new URL(url);
      out.push(domainFromAtsUrl(u.hostname.replace(/^www\./, "").toLowerCase(), u.pathname));
    } catch {
      /* ignore malformed URL */
    }
  }
  out.push(domainFromCompanyName(company));
  return [...new Set(out.filter((d): d is string => !!d))];
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
  const candidates = candidateDomains(company, url);
  const [idx, setIdx] = useState(0);
  const s = SIZES[size];
  const letter = company?.trim()?.[0]?.toUpperCase() ?? "?";

  const domain = candidates[idx];
  const showFallback = !domain;

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
        // On error we advance to the next candidate domain (or the letter).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={domain}
          src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
          alt=""
          width={s.img}
          height={s.img}
          loading="lazy"
          className="h-full w-full object-contain p-1"
          onError={() => setIdx((i) => i + 1)}
        />
      )}
    </div>
  );
}
