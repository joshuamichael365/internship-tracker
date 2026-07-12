import type { JobLevel, LocationMode, RoleType } from "./index";
import { normalizeCompany } from "./index";

/**
 * The user's notification filter. A posting must pass every configured
 * criterion (empty/omitted = no constraint). Company exclusion always applies.
 */
export type NotificationRules = {
  roleTypes?: RoleType[];
  locationModes?: LocationMode[];
  excludeCompanies?: string[];
  keywords?: string[];
};

export interface RuleInput {
  company: string;
  title: string;
  roleType: RoleType;
  jobLevel: JobLevel;
  locationMode: LocationMode;
  description?: string | null;
}

export function passesNotificationRules(
  posting: RuleInput,
  rules: NotificationRules | null | undefined,
  includeNewGrad: boolean,
): boolean {
  if (posting.jobLevel === "new_grad" && !includeNewGrad) return false;
  if (!rules) return true;

  if (rules.roleTypes?.length && !rules.roleTypes.includes(posting.roleType)) return false;
  if (rules.locationModes?.length && !rules.locationModes.includes(posting.locationMode))
    return false;
  if (
    rules.excludeCompanies?.length &&
    rules.excludeCompanies.some((c) => normalizeCompany(c) === normalizeCompany(posting.company))
  )
    return false;
  if (rules.keywords?.length) {
    const text = `${posting.title} ${posting.description ?? ""}`.toLowerCase();
    if (!rules.keywords.some((k) => text.includes(k.toLowerCase()))) return false;
  }
  return true;
}

/** True if `company` matches any entry on the instant-alert watchlist (normalized both sides). */
export function isWatchedCompany(company: string, watchlist: string[] | null | undefined): boolean {
  if (!watchlist?.length) return false;
  const c = normalizeCompany(company);
  return watchlist.some((w) => normalizeCompany(w) === c);
}

/** The `YYYY-MM-DD-HH` slot key for `date` in the given timezone (used to dedupe digest sends). */
function slotKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // en-CA gives 24h "24" for midnight in some engines; normalize to "00".
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}-${hour}`;
}

/** Current hour (0–23) in the given timezone. */
function hourIn(date: Date, timezone: string): number {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(date));
  return h === 24 ? 0 : h;
}

/**
 * True if a digest is due to send *now*: the current hour (in `timezone`) is one
 * of the configured `digestHours`, and we haven't already sent for this exact
 * hour-slot (compared to `lastSentAt`). Safe to call every few minutes — it only
 * returns true on the first tick of each slot.
 */
export function digestSlotDue(
  now: Date,
  timezone: string,
  digestHours: number[],
  lastSentAt: Date | null | undefined,
): boolean {
  if (!digestHours?.length) return false;
  if (!digestHours.includes(hourIn(now, timezone))) return false;
  if (!lastSentAt) return true;
  return slotKey(now, timezone) !== slotKey(lastSentAt, timezone);
}

/** True if `now` falls inside the quiet-hours window in the given timezone. */
export function inQuietHours(
  now: Date,
  timezone: string,
  startHour: number,
  endHour: number,
): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).format(now),
  );
  // Window may wrap midnight (23 → 7) or not (1 → 6).
  return startHour <= endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}
