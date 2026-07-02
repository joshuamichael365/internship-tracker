import Anthropic from "@anthropic-ai/sdk";
import { db, desc, writingSamples } from "@tracker/db";

/**
 * Drafting engine for Agentic Assist. Uses claude-sonnet-5 with the user's
 * two writing-sample sets as few-shot voice references.
 *
 * Without ANTHROPIC_API_KEY it produces clearly-labeled placeholder drafts so
 * the full review/edit/save flow works locally; the real model takes over the
 * moment the key is configured (M6).
 */

export interface DraftContext {
  company: string;
  roleTitle: string;
  description?: string | null;
  profileData: Record<string, string>;
}

const MODEL = "claude-sonnet-5";

function offlineDraft(kind: string, ctx: DraftContext): string {
  return [
    `[PLACEHOLDER ${kind.toUpperCase()} — the Claude API key isn't configured yet, so this is a template, not your voice.]`,
    "",
    kind === "cover letter"
      ? `Dear ${ctx.company} team,\n\nI'm writing to express my strong interest in the ${ctx.roleTitle} position. (Once the API key is set up, this will be a fully tailored letter drafted from your cover-letter samples.)\n\nSincerely,\n${ctx.profileData.fullName ?? "Your name"}`
      : `(Once the API key is set up, this answer will be drafted in your short-answer voice, grounded in the posting for ${ctx.roleTitle} at ${ctx.company}.)`,
  ].join("\n");
}

async function getSamples(set: "cover_letter" | "short_answer", limit = 3) {
  const rows = await db
    .select()
    .from(writingSamples)
    .orderBy(desc(writingSamples.createdAt))
    .limit(20);
  return rows.filter((r) => r.set === set).slice(0, limit);
}

async function callClaude(system: string, user: string): Promise<string> {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text.trim() : "";
}

export async function draftCoverLetter(ctx: DraftContext): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return offlineDraft("cover letter", ctx);

  const samples = await getSamples("cover_letter");
  const sampleBlock = samples.length
    ? samples.map((s, i) => `<sample_${i + 1} title="${s.title}">\n${s.content}\n</sample_${i + 1}>`).join("\n\n")
    : "(no samples provided — use a natural, direct, first-person voice without clichés)";

  const system = `You draft cover letters for a CS student applying to internships. Write in THEIR voice, learned from their past cover letters below. Match their sentence rhythm, vocabulary level, and how they open/close. Never invent experience not present in their profile. Output only the letter body — no commentary.\n\n${sampleBlock}`;

  const user = `Draft a cover letter for this role.\n\nCompany: ${ctx.company}\nRole: ${ctx.roleTitle}\n\nPosting description:\n${(ctx.description ?? "Not available — keep the letter role-generic but company-specific.").slice(0, 6000)}\n\nMy profile:\n${JSON.stringify(ctx.profileData, null, 2)}`;

  return callClaude(system, user);
}

export async function draftShortAnswer(ctx: DraftContext, prompt: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return offlineDraft("short answer", ctx);

  const samples = await getSamples("short_answer");
  const sampleBlock = samples.length
    ? samples.map((s, i) => `<sample_${i + 1} title="${s.title}">\n${s.content}\n</sample_${i + 1}>`).join("\n\n")
    : "(no samples provided — answer concretely and personally, 120-200 words, no clichés)";

  const system = `You draft short application-question answers for a CS student. Write in THEIR short-answer voice, learned from the samples below — it is typically more direct and compact than a cover letter. Never invent experience not in their profile. Output only the answer.\n\n${sampleBlock}`;

  const user = `Application question: "${prompt}"\n\nCompany: ${ctx.company}\nRole: ${ctx.roleTitle}\nPosting description:\n${(ctx.description ?? "").slice(0, 4000)}\n\nMy profile:\n${JSON.stringify(ctx.profileData, null, 2)}`;

  return callClaude(system, user);
}
