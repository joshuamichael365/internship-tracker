import { applications, db, eq, modeDecisions, postings } from "@tracker/db";

export interface ModeRecommendation {
  recommended: "manual" | "assist";
  reasons: string[];
  signals: Record<string, unknown>;
}

const KNOWN_ATS: { pattern: RegExp; name: string }[] = [
  { pattern: /greenhouse\.io/, name: "Greenhouse" },
  { pattern: /lever\.co/, name: "Lever" },
  { pattern: /ashbyhq\.com/, name: "Ashby" },
  { pattern: /smartrecruiters\.com/, name: "SmartRecruiters" },
];

const HARD_PORTALS: { pattern: RegExp; name: string }[] = [
  { pattern: /myworkdayjobs\.com/, name: "Workday" },
  { pattern: /taleo\.net/, name: "Taleo" },
  { pattern: /icims\.com/, name: "iCIMS" },
];

function atsOf(url: string): { name: string; tier: "known" | "hard" | "unknown" } {
  for (const a of KNOWN_ATS) if (a.pattern.test(url)) return { name: a.name, tier: "known" };
  for (const a of HARD_PORTALS) if (a.pattern.test(url)) return { name: a.name, tier: "hard" };
  return { name: "unknown portal", tier: "unknown" };
}

/**
 * Phase 1 recommender: Manual vs Agentic Assist only. Auto-Apply is never
 * recommended until Phase 2 exists and a reliability track record with a
 * portal has been built — bias toward asking the user when uncertain.
 */
export async function recommendMode(applicationId: number): Promise<ModeRecommendation> {
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return { recommended: "manual", reasons: ["Application not found."], signals: {} };

  const [posting] = app.postingId
    ? await db.select().from(postings).where(eq(postings.id, app.postingId)).limit(1)
    : [undefined];

  const ats = atsOf(app.url);
  const reasons: string[] = [];
  let recommended: "manual" | "assist";

  if (ats.tier === "known") {
    recommended = "assist";
    reasons.push(
      `${ats.name} portal — a standardized ATS the assistant fills reliably. You still review every field and submit yourself.`,
    );
  } else if (ats.tier === "hard") {
    recommended = "manual";
    reasons.push(
      `${ats.name} portal — multi-step and login-gated; we're not confident in reliable auto-fill here yet, so Manual is safer. The assistant can still draft your cover letter and answers for copy-paste.`,
    );
  } else {
    recommended = "manual";
    reasons.push(
      "Unfamiliar portal — we can't verify our field-mapping confidence, so Manual is recommended. Drafting still works; use the assist panel and paste.",
    );
  }

  // Deadline urgency tips toward assisted speed.
  const deadline = posting?.deadline;
  if (deadline && deadline.getTime() - Date.now() < 72 * 60 * 60 * 1000) {
    reasons.push("Deadline is under 72 hours away — assisted drafting saves time.");
    if (recommended === "manual" && ats.tier !== "hard") recommended = "assist";
  }

  // Learn from consistent overrides for the same portal family.
  const history = await db.select().from(modeDecisions);
  const sameAts = history.filter(
    (d) => (d.signals as { ats?: string } | null)?.ats === ats.name && d.recommended !== d.chosen,
  );
  if (sameAts.length >= 2) {
    const lastChoice = sameAts[sameAts.length - 1]!.chosen;
    if (lastChoice === "manual" || lastChoice === "assist") {
      recommended = lastChoice;
      reasons.push(
        `You've overridden us toward ${lastChoice === "assist" ? "Agentic Assist" : "Manual"} on ${ats.name} before — following your pattern.`,
      );
    }
  }

  return {
    recommended,
    reasons,
    signals: { ats: ats.name, atsTier: ats.tier, deadline: deadline?.toISOString() ?? null },
  };
}
