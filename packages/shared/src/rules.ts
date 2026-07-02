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
