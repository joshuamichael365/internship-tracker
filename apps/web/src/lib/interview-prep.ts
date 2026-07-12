import Anthropic from "@anthropic-ai/sdk";
import type { InterviewPrep } from "@tracker/db";

export type { InterviewPrep };

/**
 * Interview & skill-prep engine (P2-M3). Turns a posting's description into
 * concrete, personalized prep guidance — useful in every mode, not just
 * Assist, since it doesn't touch the application itself.
 *
 * Without ANTHROPIC_API_KEY it returns a clearly-labeled placeholder so the
 * generate/cache/regenerate flow is fully testable locally.
 */

export interface PrepContext {
  company: string;
  roleTitle: string;
  description?: string | null;
  roleType?: string | null;
  profileData: Record<string, unknown>;
}

const MODEL = "claude-sonnet-5";

function offlinePrep(ctx: PrepContext): InterviewPrep {
  return {
    focusAreas: [
      {
        topic: "[PLACEHOLDER — ANTHROPIC_API_KEY not configured]",
        why: `Once the API key is set up, this will be tailored to the ${ctx.roleTitle} posting at ${ctx.company}.`,
      },
    ],
    practiceProblems: [
      { name: "Two Sum", pattern: "hash map", difficulty: "easy" },
      { name: "Binary Tree Level Order Traversal", pattern: "BFS", difficulty: "medium" },
    ],
    projectIdeas: [
      "(Once the API key is set up, this will suggest projects grounded in the actual posting and your profile.)",
    ],
    resources: [{ name: "NeetCode 150", kind: "DSA practice set" }],
    behavioral: ["Tell me about a project you're proud of."],
  };
}

/** Strips ```json fences some models add despite instructions not to. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1]! : trimmed;
}

function isDifficulty(v: unknown): v is "easy" | "medium" | "hard" {
  return v === "easy" || v === "medium" || v === "hard";
}

/** Defensive parse — never trust the model's JSON shape blindly; drop malformed entries instead of crashing. */
function parsePrep(raw: string): InterviewPrep | null {
  let data: unknown;
  try {
    data = JSON.parse(stripFences(raw));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  const focusAreas = Array.isArray(d.focusAreas)
    ? d.focusAreas
        .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
        .map((f) => ({ topic: String(f.topic ?? ""), why: String(f.why ?? "") }))
        .filter((f) => f.topic)
    : [];

  const practiceProblems = Array.isArray(d.practiceProblems)
    ? d.practiceProblems
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
        .map((p) => ({
          name: String(p.name ?? ""),
          pattern: String(p.pattern ?? ""),
          difficulty: isDifficulty(p.difficulty) ? p.difficulty : "medium",
        }))
        .filter((p) => p.name)
    : [];

  const projectIdeas = Array.isArray(d.projectIdeas)
    ? d.projectIdeas.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : [];

  const resources = Array.isArray(d.resources)
    ? d.resources
        .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
        .map((r) => ({ name: String(r.name ?? ""), kind: String(r.kind ?? "") }))
        .filter((r) => r.name)
    : [];

  const behavioral = Array.isArray(d.behavioral)
    ? d.behavioral.filter((b): b is string => typeof b === "string" && b.trim().length > 0)
    : [];

  if (
    focusAreas.length === 0 &&
    practiceProblems.length === 0 &&
    projectIdeas.length === 0 &&
    resources.length === 0 &&
    behavioral.length === 0
  ) {
    return null;
  }

  return { focusAreas, practiceProblems, projectIdeas, resources, behavioral };
}

export async function generateInterviewPrep(ctx: PrepContext): Promise<InterviewPrep> {
  if (!process.env.ANTHROPIC_API_KEY) return offlinePrep(ctx);

  const system = `You generate interview and skill-prep guidance for a CS student's internship application. Ground every suggestion in the specific role and description given — don't produce generic advice divorced from the posting. Personalize using their profile (known skills, experience level) where relevant.

Never fabricate URLs or invent specific problem IDs/links. Reference practice problems and resources by well-known NAME only (e.g. "Two Sum", "NeetCode 150", "Cracking the Coding Interview", official framework docs) — never a deep link, never a made-up problem.

Keep the lists focused so the whole response fits comfortably: at most 6 focus areas, 10 practice problems, 5 project ideas, 6 resources, and 6 behavioral prompts. Prefer fewer, higher-signal entries over padding.

Respond with ONLY strict JSON, no commentary, no markdown fences, matching exactly this shape:
{
  "focusAreas": [{ "topic": string, "why": string }],
  "practiceProblems": [{ "name": string, "pattern": string, "difficulty": "easy"|"medium"|"hard" }],
  "projectIdeas": [string],
  "resources": [{ "name": string, "kind": string }],
  "behavioral": [string]
}`;

  const user = `Role: ${ctx.roleTitle} at ${ctx.company}${ctx.roleType ? ` (${ctx.roleType})` : ""}

Posting description:
${(ctx.description ?? "Not available — base guidance on the role title and general expectations for this kind of internship.").slice(0, 6000)}

My profile (for personalization — tailor difficulty/focus to my level, reference my known skills where relevant):
${JSON.stringify(ctx.profileData, null, 2)}`;

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    // Generous budget: a full five-section prep runs past 2k tokens, and a
    // truncated response yields unparsable JSON. The prompt caps list sizes to
    // keep the whole object inside this budget.
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "text");
  const text = block?.type === "text" ? block.text.trim() : "";

  // A parse failure here means the model returned malformed/truncated JSON — NOT
  // that the key is missing (that's handled above). Surface it as an error so the
  // client can toast "try again" rather than showing the misleading offline
  // placeholder, which would falsely claim the API key isn't configured.
  const parsed = parsePrep(text);
  if (!parsed) throw new Error("Interview-prep model returned unparsable output — try again.");
  return parsed;
}
