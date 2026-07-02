import type { JobLevel, LocationMode, RoleType } from "./index";

const ML_RE = /\b(machine learning|ml engineer|deep learning|computer vision|nlp|llm|ai engineer|artificial intelligence|research scientist|research engineer)\b/i;
const DATA_RE = /\b(data scien|data engineer|data analy|analytics|business intelligence)\b/i;
const QUANT_RE = /\b(quant|quantitative|trading|trader)\b/i;
const SWE_RE = /\b(software|swe|backend|back-end|frontend|front-end|full[- ]?stack|mobile|ios|android|devops|infrastructure|platform|security|site reliability|sre|embedded|firmware|systems|cloud|web develop)\b/i;

const INTERN_RE = /\b(intern|internship|co-?op)\b/i;
const NEW_GRAD_RE = /\b(new ?grad|university grad|early career|entry[- ]level|recent grad|campus hire|graduate program)\b/i;

const REMOTE_RE = /\bremote\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const ONSITE_RE = /\b(on-?site|in[- ]office|in[- ]person)\b/i;

/** Keyword classifier — used standalone, or as the fallback when Claude tagging is unavailable. */
export function classifyRole(title: string, description = ""): RoleType {
  const text = `${title} ${description.slice(0, 2000)}`;
  if (QUANT_RE.test(title)) return "quant";
  if (ML_RE.test(title)) return "ml";
  if (DATA_RE.test(title)) return "data";
  if (SWE_RE.test(title)) return "swe";
  if (ML_RE.test(text)) return "ml";
  if (DATA_RE.test(text)) return "data";
  if (SWE_RE.test(text)) return "swe";
  return "other";
}

export function classifyLevel(title: string, description = ""): JobLevel | null {
  if (INTERN_RE.test(title)) return "internship";
  if (NEW_GRAD_RE.test(title)) return "new_grad";
  if (INTERN_RE.test(description)) return "internship";
  if (NEW_GRAD_RE.test(description)) return "new_grad";
  return null;
}

export function classifyLocationMode(locations: string[], description = ""): LocationMode {
  const locText = locations.join(" ");
  if (REMOTE_RE.test(locText)) return "remote";
  if (HYBRID_RE.test(locText) || HYBRID_RE.test(description)) return "hybrid";
  if (ONSITE_RE.test(description)) return "onsite";
  if (locations.length > 0 && locText.trim() !== "") return "onsite";
  return "unknown";
}

const TERM_RE = /\b(summer|fall|autumn|winter|spring)\s*(20\d\d)?\b/gi;

/** Normalizes term/season labels: "Summer 2026", "Fall 2026", or bare "Summer". */
export function extractTerms(title: string, provided?: string[]): string[] {
  const out = new Set<string>();
  for (const t of provided ?? []) {
    const m = /(summer|fall|autumn|winter|spring)\s*(20\d\d)?/i.exec(t);
    if (m) {
      const season = m[1]!.toLowerCase() === "autumn" ? "Fall" : m[1]![0]!.toUpperCase() + m[1]!.slice(1).toLowerCase();
      out.add(m[2] ? `${season} ${m[2]}` : season);
    } else if (t.trim() && !/^(n\/a|tbd)$/i.test(t.trim())) out.add(t.trim());
  }
  if (out.size === 0) {
    for (const m of title.matchAll(TERM_RE)) {
      const season = m[1]!.toLowerCase() === "autumn" ? "Fall" : m[1]![0]!.toUpperCase() + m[1]!.slice(1).toLowerCase();
      out.add(m[2] ? `${season} ${m[2]}` : season);
    }
  }
  return [...out];
}

/** True if the posting is CS-relevant at all (drops marketing/finance/etc. roles from broad boards). */
export function isRelevantRole(title: string): boolean {
  return (
    SWE_RE.test(title) ||
    ML_RE.test(title) ||
    DATA_RE.test(title) ||
    QUANT_RE.test(title) ||
    /\b(engineer|developer|computer science|technology analyst)\b/i.test(title)
  );
}
