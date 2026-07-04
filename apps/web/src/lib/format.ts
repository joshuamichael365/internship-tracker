export function timeAgo(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

export const ROLE_LABELS: Record<string, string> = {
  swe: "SWE",
  ml: "ML",
  data: "Data",
  quant: "Quant",
  other: "Other CS",
};

export const LOCATION_MODE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "",
};

/** Time-aware "Good morning/afternoon/evening" — falls back to "Dashboard" with no name. */
export function greeting(name?: string | null): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Good ${part}, ${first}` : "Dashboard";
}

export function todayLong(): string {
  return new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}
