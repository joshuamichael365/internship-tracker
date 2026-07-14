import type { LocationMode, NormalizedPosting } from "@tracker/shared";
import { classifyLevel } from "@tracker/shared";
import { conditionalFetch, type ConditionalResult } from "./http.js";

type PollResult = { result: ConditionalResult; postings: NormalizedPosting[] };

/** Only keep internship/new-grad-relevant roles from full company boards. */
function levelFilter(p: NormalizedPosting): boolean {
  return classifyLevel(p.title, p.description ?? "") !== null;
}

export async function pollGreenhouse(
  config: { boardToken: string },
  prevCache: Record<string, string> | null | undefined,
): Promise<PollResult> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${config.boardToken}/jobs?content=true`;
  const result = await conditionalFetch(url, prevCache);
  if (result.notModified) return { result, postings: [] };
  const data = JSON.parse(result.body!) as {
    jobs: {
      title: string;
      absolute_url: string;
      location?: { name?: string };
      updated_at?: string;
      content?: string;
    }[];
  };
  const postings = data.jobs
    .map((j) => ({
      company: config.boardToken,
      title: j.title,
      url: j.absolute_url,
      locations: j.location?.name ? [j.location.name] : [],
      description: j.content ? decodeHtml(j.content).slice(0, 8000) : undefined,
      postedAt: j.updated_at,
    }))
    .filter(levelFilter);
  return { result, postings };
}

export async function pollLever(
  config: { site: string },
  prevCache: Record<string, string> | null | undefined,
): Promise<PollResult> {
  const url = `https://api.lever.co/v0/postings/${config.site}?mode=json`;
  const result = await conditionalFetch(url, prevCache);
  if (result.notModified) return { result, postings: [] };
  const data = JSON.parse(result.body!) as {
    text: string;
    hostedUrl: string;
    createdAt?: number;
    descriptionPlain?: string;
    categories?: { location?: string; allLocations?: string[] };
  }[];
  const postings = data
    .map((j) => ({
      company: config.site,
      title: j.text,
      url: j.hostedUrl,
      locations: j.categories?.allLocations ?? (j.categories?.location ? [j.categories.location] : []),
      description: j.descriptionPlain?.slice(0, 8000),
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
    }))
    .filter(levelFilter);
  return { result, postings };
}

export async function pollSmartRecruiters(
  config: { company: string },
  prevCache: Record<string, string> | null | undefined,
): Promise<PollResult> {
  const url = `https://api.smartrecruiters.com/v1/companies/${config.company}/postings?limit=100`;
  const result = await conditionalFetch(url, prevCache);
  if (result.notModified) return { result, postings: [] };
  const data = JSON.parse(result.body!) as {
    content: {
      id: string;
      name: string;
      releasedDate?: string;
      location?: { city?: string; region?: string; country?: string; remote?: boolean };
      company?: { name?: string };
    }[];
  };
  const postings = data.content
    .map((j) => {
      const locBits = [j.location?.city, j.location?.region, j.location?.country].filter(
        Boolean,
      ) as string[];
      const locations = j.location?.remote ? ["Remote"] : locBits.length ? [locBits.join(", ")] : [];
      return {
        company: j.company?.name ?? config.company,
        title: j.name,
        url: `https://jobs.smartrecruiters.com/${config.company}/${j.id}`,
        locations,
        postedAt: j.releasedDate,
      };
    })
    .filter(levelFilter);
  return { result, postings };
}

/** Ashby's workplaceType is authoritative — prefer it over the description heuristic. */
function ashbyLocationMode(workplaceType?: string, isRemote?: boolean): LocationMode | undefined {
  switch ((workplaceType ?? "").toLowerCase()) {
    case "remote":
      return "remote";
    case "hybrid":
      return "hybrid";
    case "onsite":
    case "on-site":
      return "onsite";
    default:
      return isRemote ? "remote" : undefined;
  }
}

export async function pollAshby(
  config: { clientName: string },
  prevCache: Record<string, string> | null | undefined,
): Promise<PollResult> {
  // Ashby's public Job Posting API — no auth, poll-only. Used by a large slice
  // of high-growth AI/infra/fintech startups (OpenAI, Ramp, Notion, Linear…),
  // so it's high-value coverage the community repos surface slowly if at all.
  const url = `https://api.ashbyhq.com/posting-api/job-board/${config.clientName}?includeCompensation=true`;
  const result = await conditionalFetch(url, prevCache);
  if (result.notModified) return { result, postings: [] };
  const data = JSON.parse(result.body!) as {
    jobs?: {
      title: string;
      employmentType?: string;
      location?: string;
      secondaryLocations?: { location?: string }[];
      isRemote?: boolean;
      workplaceType?: string;
      jobUrl?: string;
      applyUrl?: string;
      descriptionPlain?: string;
      publishedAt?: string;
    }[];
  };
  const postings = (data.jobs ?? [])
    .filter((j) => j.title && (j.jobUrl || j.applyUrl))
    // employmentType is authoritative for interns; fall back to the title/desc
    // heuristic so new-grad full-time roles aren't dropped.
    .filter((j) => j.employmentType === "Intern" || classifyLevel(j.title, j.descriptionPlain ?? "") !== null)
    .map((j) => {
      const locations = [
        j.location,
        ...(j.secondaryLocations ?? []).map((s) => s.location),
      ].filter((l): l is string => !!l);
      return {
        company: config.clientName,
        title: j.title,
        url: j.jobUrl ?? j.applyUrl!,
        locations,
        locationMode: ashbyLocationMode(j.workplaceType, j.isRemote),
        jobLevel: j.employmentType === "Intern" ? ("internship" as const) : undefined,
        description: j.descriptionPlain?.slice(0, 8000),
        postedAt: j.publishedAt,
      };
    });
  return { result, postings };
}

export async function pollWorkday(
  config: { host: string; tenant: string; site: string; searchText?: string },
  _prevCache: Record<string, string> | null | undefined,
): Promise<PollResult> {
  // Workday's CXS endpoint is POST-based; no conditional-request support.
  const url = `https://${config.host}/wday/cxs/${config.tenant}/${config.site}/jobs`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "internship-tracker (personal job-search tool)",
    },
    body: JSON.stringify({
      appliedFacets: {},
      limit: 20,
      offset: 0,
      searchText: config.searchText ?? "intern",
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = (await res.json()) as {
    jobPostings?: { title?: string; externalPath?: string; locationsText?: string; postedOn?: string }[];
  };
  const postings = (data.jobPostings ?? [])
    .filter((j) => j.title && j.externalPath)
    .map((j) => ({
      company: config.tenant,
      title: j.title!,
      url: `https://${config.host}/en-US/${config.site}${j.externalPath}`,
      locations: j.locationsText ? [j.locationsText] : [],
    }))
    .filter(levelFilter);
  return { result: { status: 200, notModified: false }, postings };
}

function decodeHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
