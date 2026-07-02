import type { NormalizedPosting } from "@tracker/shared";
import { conditionalFetch, type ConditionalResult } from "./http.js";

interface GithubConfig {
  repo: string; // e.g. "SimplifyJobs/Summer2026-Internships"
  branch?: string;
  /** JSON listings file if the repo maintains one (SimplifyJobs does). */
  listingsPath?: string;
}

interface SimplifyListing {
  company_name: string;
  title: string;
  locations?: string[];
  url?: string;
  application_link?: string;
  active?: boolean;
  is_visible?: boolean;
  date_posted?: number;
  sponsorship?: string;
  [k: string]: unknown;
}

function mapSponsorship(s: string | undefined): "sponsors" | "citizens_only" | "unknown" {
  if (!s) return "unknown";
  if (/offers sponsorship/i.test(s)) return "sponsors";
  if (/citizenship|does not offer/i.test(s)) return "citizens_only";
  return "unknown";
}

function parseListingsJson(body: string): NormalizedPosting[] {
  const rows = JSON.parse(body) as SimplifyListing[];
  return rows
    .filter((r) => r.active !== false && r.is_visible !== false && r.company_name && r.title)
    .map((r) => ({
      company: r.company_name,
      title: r.title,
      url: r.url || r.application_link || "",
      locations: r.locations ?? [],
      postedAt: r.date_posted ? new Date(r.date_posted * 1000).toISOString() : undefined,
      raw: { sponsorship: mapSponsorship(r.sponsorship) },
    }))
    .filter((r) => r.url);
}

const LINK_RE = /<a[^>]+href="([^"]+)"|\[[^\]]*\]\(([^)]+)\)/;

/**
 * Fallback for repos without a listings file: parse README markdown tables.
 * Expected column order: Company | Role | Location | Link | Age (the community standard).
 * "↳" rows inherit the company above them.
 */
function parseReadmeTable(body: string): NormalizedPosting[] {
  const out: NormalizedPosting[] = [];
  let lastCompany = "";
  for (const line of body.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 5) continue;
    const [, companyCell = "", roleCell = "", locationCell = "", linkCell = ""] = cells;
    if (/^-+$/.test(companyCell.replace(/[: ]/g, "-")) || /^company$/i.test(companyCell)) continue;

    let company = companyCell
      .replace(/\*\*|\[|\]\([^)]*\)|<[^>]+>/g, "")
      .trim();
    if (company === "↳" || company === "") company = lastCompany;
    else lastCompany = company;

    const role = roleCell.replace(/<[^>]+>/g, "").trim();
    const linkMatch = linkCell.match(LINK_RE);
    const url = linkMatch?.[1] || linkMatch?.[2] || "";
    if (!company || !role || !url || /🔒/.test(linkCell)) continue;

    const locations = locationCell
      .replace(/<\/?(details|summary)[^>]*>/g, " ")
      .split(/<br\s*\/?>|,(?![^(]*\))/)
      .map((l) => l.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean);

    out.push({ company, title: role, url, locations });
  }
  return out;
}

export async function pollGithubRepo(
  config: GithubConfig,
  prevCache: Record<string, string> | null | undefined,
): Promise<{ result: ConditionalResult; postings: NormalizedPosting[] }> {
  const branch = config.branch ?? "dev";
  const base = `https://raw.githubusercontent.com/${config.repo}/${branch}`;

  if (config.listingsPath) {
    const result = await conditionalFetch(`${base}/${config.listingsPath}`, prevCache);
    if (result.notModified) return { result, postings: [] };
    return { result, postings: parseListingsJson(result.body!) };
  }

  const result = await conditionalFetch(`${base}/README.md`, prevCache);
  if (result.notModified) return { result, postings: [] };
  return { result, postings: parseReadmeTable(result.body!) };
}
