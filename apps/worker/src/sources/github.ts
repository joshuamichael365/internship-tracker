import type { NormalizedPosting } from "@tracker/shared";
import { conditionalFetch, type ConditionalResult } from "./http.js";

interface GithubConfig {
  repo: string; // e.g. "SimplifyJobs/Summer2026-Internships"
  branch?: string;
  /** JSON listings file if the repo maintains one (SimplifyJobs does). */
  listingsPath?: string;
  /**
   * Override the README table column order for repos that don't follow the community-standard
   * `Company | Role | Location | Link` layout (e.g. speedyapply puts the link in a "Posting"
   * column at index 5). Format: "company=1,role=2,location=3,link=4" — any subset of keys, 1-based
   * cell index counting from the leading `|`. Omitted keys keep the standard default. A field can
   * repeat an index (e.g. "link=2" when the role cell itself embeds the apply link, as jobright-ai
   * does). No effect on `listingsPath` repos.
   */
  columns?: string;
}

interface ColumnMap {
  company: number;
  role: number;
  location: number;
  link: number;
}

const DEFAULT_COLUMNS: ColumnMap = { company: 1, role: 2, location: 3, link: 4 };

/** Parse the `columns` config string (see GithubConfig.columns) into a ColumnMap, defaulting
 *  any key that's absent or malformed to the community-standard index. */
export function parseColumnMap(spec: string | undefined): ColumnMap {
  if (!spec) return DEFAULT_COLUMNS;
  const map: ColumnMap = { ...DEFAULT_COLUMNS };
  for (const pair of spec.split(",")) {
    const [rawKey, rawValue] = pair.split("=").map((s) => s.trim());
    const key = rawKey as keyof ColumnMap;
    const idx = Number(rawValue);
    if ((key === "company" || key === "role" || key === "location" || key === "link") && Number.isInteger(idx) && idx > 0) {
      map[key] = idx;
    }
  }
  return map;
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
  terms?: string[];
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
      terms: r.terms,
      raw: { sponsorship: mapSponsorship(r.sponsorship), listing: r },
    }))
    .filter((r) => r.url);
}

const LINK_RE = /<a[^>]+href="([^"]+)"|\[[^\]]*\]\(([^)]+)\)/;

/**
 * Fallback for repos without a listings file: parse README markdown tables.
 * Default column order: Company | Role | Location | Link | Age (the community standard) — pass a
 * `columns` map for repos that deviate (see GithubConfig.columns).
 * "↳" rows inherit the company above them.
 */
export function parseReadmeTable(body: string, columns: ColumnMap = DEFAULT_COLUMNS): NormalizedPosting[] {
  const out: NormalizedPosting[] = [];
  let lastCompany = "";
  // Table must have at least enough cells to cover the highest configured column index.
  const minCells = Math.max(columns.company, columns.role, columns.location, columns.link) + 1;
  for (const line of body.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < minCells) continue;
    const companyCell = cells[columns.company] ?? "";
    const roleCell = cells[columns.role] ?? "";
    const locationCell = cells[columns.location] ?? "";
    const linkCell = cells[columns.link] ?? "";
    if (/^-+$/.test(companyCell.replace(/[: ]/g, "-")) || /^company$/i.test(companyCell)) continue;

    let company = companyCell
      .replace(/\*\*|\[|\]\([^)]*\)|<[^>]+>/g, "")
      .trim();
    if (company === "↳" || company === "") company = lastCompany;
    else lastCompany = company;

    // Role text may itself carry the apply link (e.g. jobright-ai's "Job Title" column embeds a
    // markdown link, so `columns.link` points at the same cell as `columns.role`) — strip
    // bold/markdown-link syntax the same way the company cell does, keeping just the anchor text,
    // so titles never leak markdown junk.
    const role = roleCell
      .replace(/\*\*/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .trim();
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
  return { result, postings: parseReadmeTable(result.body!, parseColumnMap(config.columns)) };
}
