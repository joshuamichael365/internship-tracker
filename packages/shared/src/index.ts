export * from "./tagging";
export * from "./rules";
export * from "./google-oauth";

export type RoleType = "swe" | "ml" | "data" | "quant" | "other";
export type JobLevel = "internship" | "new_grad";
export type LocationMode = "remote" | "hybrid" | "onsite" | "unknown";
export type PostingStatus = "active" | "expired" | "hidden";
export type SourceKind =
  | "github_repo"
  | "greenhouse"
  | "lever"
  | "smartrecruiters"
  | "workday"
  | "rss"
  | "instagram_mirror";

export type ApplicationMode = "manual" | "assist" | "auto";
export type ApplicationStage =
  | "saved"
  | "in_progress"
  | "applied"
  | "assessment"
  | "interviewing"
  | "offer"
  | "rejected";

export type NotificationChannel = "push" | "email" | "sms";
export type NotificationKind = "instant" | "digest" | "confirmation" | "blocker";

/** A posting as produced by any source poller, before dedupe/tagging. */
export interface NormalizedPosting {
  company: string;
  title: string;
  url: string;
  locations: string[];
  locationMode?: LocationMode;
  roleType?: RoleType;
  jobLevel?: JobLevel;
  description?: string;
  deadline?: string; // ISO date if the source states one
  postedAt?: string; // ISO date if the source states one
  terms?: string[]; // e.g. ["Summer 2026"] if the source states them
  raw?: unknown;
}

const COMPANY_NOISE = /\b(inc|llc|ltd|corp|corporation|co|technologies|labs)\.?$/i;

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(COMPANY_NOISE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\((summer|fall|winter|spring)?\s*20\d\d\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLocation(loc: string): string {
  return loc
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Portable FNV-1a 64-bit hash (no crypto dependency, same result in web/worker/extension). */
export function fnv1a64(input: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

/**
 * Stable identity for a posting across sources:
 * same company + role title + first location = one card.
 */
export function dedupeHash(p: Pick<NormalizedPosting, "company" | "title" | "locations">): string {
  const loc = normalizeLocation(p.locations[0] ?? "");
  return fnv1a64(`${normalizeCompany(p.company)}|${normalizeTitle(p.title)}|${loc}`);
}
