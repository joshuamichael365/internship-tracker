"use server";

import { readFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { db, desc, eq, latexResumes, profile, resumes } from "@tracker/db";
import { JAKES_RESUME_TEMPLATE } from "@/lib/latex-templates";
import { deleteUpload, saveUpload, uploadPath } from "@/lib/storage";

const MODEL = "claude-sonnet-5";
const MAX_STORED_MESSAGES = 30;
const MAX_CONTEXT_MESSAGES = 12;

export async function createLatexResume(): Promise<number> {
  const [row] = await db
    .insert(latexResumes)
    .values({ name: "Untitled resume", source: JAKES_RESUME_TEMPLATE })
    .returning({ id: latexResumes.id });
  revalidatePath("/resume-studio");
  return row!.id;
}

export async function updateLatexResume(
  id: number,
  fields: { name?: string; source?: string },
): Promise<void> {
  await db
    .update(latexResumes)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(latexResumes.id, id));
  revalidatePath("/resume-studio");
  revalidatePath(`/resume-studio/${id}`);
}

export async function deleteLatexResume(id: number): Promise<void> {
  const [row] = await db.select().from(latexResumes).where(eq(latexResumes.id, id)).limit(1);
  if (!row) return;
  await db.delete(latexResumes).where(eq(latexResumes.id, id));
  if (row.compiledKey) await deleteUpload(row.compiledKey);
  revalidatePath("/resume-studio");
}

/**
 * Copies the compiled PDF into the standard resume flow: a new `resumes` row
 * (not default), then best-effort `parseResume` exactly like the profile
 * upload path in actions/profile.ts.
 */
export async function saveLatexResumeAsVersion(id: number): Promise<{ ok: boolean; error?: string }> {
  const [row] = await db.select().from(latexResumes).where(eq(latexResumes.id, id)).limit(1);
  if (!row || !row.compiledKey) return { ok: false, error: "Compile the resume before saving a version." };

  let bytes: Buffer;
  try {
    bytes = await readFile(uploadPath(row.compiledKey));
  } catch {
    return { ok: false, error: "Compiled PDF is missing — recompile and try again." };
  }

  const fileKey = await saveUpload(
    new File([new Uint8Array(bytes)], `${row.name}.pdf`, { type: "application/pdf" }),
    "resumes",
  );

  const [inserted] = await db
    .insert(resumes)
    .values({ name: `${row.name} (Studio)`, fileKey, isDefault: false })
    .returning({ id: resumes.id });

  try {
    const { parseResume } = await import("@/lib/resume-parse");
    await parseResume(inserted!.id);
  } catch (err) {
    console.error("[resume-parse]", err);
  }

  revalidatePath("/profile");
  return { ok: true };
}

function offlineChatReply(): string {
  return "[The Claude API key isn't configured yet, so I can't chat or draft LaTeX right now. Once ANTHROPIC_API_KEY is set, I'll be able to discuss your resume and produce updated LaTeX on request.]";
}

async function loadContext(id: number) {
  const [row] = await db.select().from(latexResumes).where(eq(latexResumes.id, id)).limit(1);
  if (!row) return null;
  const [prof] = await db.select().from(profile).limit(1);
  const [defaultResume] = await db
    .select()
    .from(resumes)
    .where(eq(resumes.isDefault, true))
    .orderBy(desc(resumes.createdAt))
    .limit(1);
  return { row, profileData: (prof?.data ?? {}) as Record<string, unknown>, parsedResume: defaultResume?.parsed ?? null };
}

/**
 * Conversational resume-writing + LaTeX assistant. Sees the current LaTeX
 * source and structured profile/resume data; never invents facts absent from
 * that data or the conversation. When asked to produce/apply LaTeX, replies
 * with the COMPLETE updated document wrapped in <latex>...</latex> — never a
 * partial snippet inside those tags.
 */
export async function chatLatex(id: number, userMessage: string): Promise<{ reply: string }> {
  const ctx = await loadContext(id);
  if (!ctx) return { reply: "Resume not found." };
  const trimmed = userMessage.trim();
  if (!trimmed) return { reply: "" };

  const history = [...ctx.row.chatHistory, { role: "user" as const, content: trimmed }];

  if (!process.env.ANTHROPIC_API_KEY) {
    const reply = offlineChatReply();
    await persistTurn(id, history, reply);
    return { reply };
  }

  const system = `You are an expert resume writer and LaTeX assistant helping a CS student improve their resume. You can see the CURRENT LaTeX source of their resume document and their structured profile/resume data below. Discuss and draft content conversationally.

Rules:
- Never invent facts, experience, skills, or credentials not present in the profile data, the parsed resume data, or what the user has told you in this conversation. If you need a detail to write something concrete, ask for it.
- When the user asks you to produce or apply LaTeX changes, output the COMPLETE updated .tex document wrapped EXACTLY in <latex> and </latex> tags — never a partial snippet inside those tags, and never more than one <latex> block per reply.
- Keep the document compiling: don't introduce packages beyond what the template already uses unless the user explicitly asks for something that requires one.
- Outside of a <latex> block, respond in plain prose — no markdown code fences around the LaTeX.

Current LaTeX source:
<current_source>
${ctx.row.source}
</current_source>

Profile data:
${JSON.stringify(ctx.profileData, null, 2)}

Parsed resume data (may be null if no resume has been parsed yet):
${JSON.stringify(ctx.parsedResume, null, 2)}`;

  const client = new Anthropic();
  let reply: string;
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system,
      messages: history.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({ role: m.role, content: m.content })),
    });
    const block = res.content.find((b) => b.type === "text");
    reply = block?.type === "text" ? block.text.trim() : "";
  } catch (err) {
    console.error("[latex-chat]", err);
    reply = "Something went wrong talking to Claude — try again in a moment.";
  }

  await persistTurn(id, history, reply);
  return { reply };
}

async function persistTurn(
  id: number,
  historyWithUser: { role: "user" | "assistant"; content: string }[],
  reply: string,
) {
  const full = [...historyWithUser, { role: "assistant" as const, content: reply }].slice(-MAX_STORED_MESSAGES);
  await db.update(latexResumes).set({ chatHistory: full, updatedAt: new Date() }).where(eq(latexResumes.id, id));
  revalidatePath(`/resume-studio/${id}`);
}
