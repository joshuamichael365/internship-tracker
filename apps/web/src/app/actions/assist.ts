"use server";

import { revalidatePath } from "next/cache";
import { applications, db, eq, postings, profile } from "@tracker/db";
import { draftCoverLetter, draftShortAnswer, type DraftContext } from "@/lib/drafting";
import { renderPdf, saveGeneratedDocument, type SavedDoc } from "@/lib/documents";

async function contextFor(applicationId: number): Promise<(DraftContext & { id: number }) | null> {
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return null;
  const [posting] = app.postingId
    ? await db.select().from(postings).where(eq(postings.id, app.postingId)).limit(1)
    : [undefined];
  const [prof] = await db.select().from(profile).limit(1);
  return {
    id: app.id,
    company: app.company,
    roleTitle: app.roleTitle,
    description: posting?.description,
    profileData: (prof?.data ?? {}) as Record<string, string>,
  };
}

export async function generateCoverLetter(applicationId: number): Promise<string> {
  const ctx = await contextFor(applicationId);
  if (!ctx) return "";
  return draftCoverLetter(ctx);
}

export async function generateShortAnswer(applicationId: number, prompt: string): Promise<string> {
  const ctx = await contextFor(applicationId);
  if (!ctx || !prompt.trim()) return "";
  return draftShortAnswer(ctx, prompt.trim());
}

export interface AssistDocsInput {
  coverLetter?: string;
  answers?: { prompt: string; answer: string }[];
}

/** Saves the (user-reviewed) drafts to the chosen storage destination. */
export async function saveAssistDocuments(
  applicationId: number,
  input: AssistDocsInput,
): Promise<SavedDoc[]> {
  const ctx = await contextFor(applicationId);
  if (!ctx) return [];
  const saved: SavedDoc[] = [];

  if (input.coverLetter?.trim()) {
    const bytes = await renderPdf(
      `Cover Letter — ${ctx.company}`,
      input.coverLetter.trim(),
    );
    saved.push(
      await saveGeneratedDocument({
        applicationId,
        kind: "cover_letter",
        company: ctx.company,
        roleTitle: ctx.roleTitle,
        filename: "CoverLetter.pdf",
        bytes,
        mimeType: "application/pdf",
      }),
    );
  }

  if (input.answers?.length) {
    const body = input.answers
      .map((a) => `Q: ${a.prompt}\n\n${a.answer}`)
      .join("\n\n———\n\n");
    const bytes = await renderPdf(`Short Answers — ${ctx.company}`, body);
    saved.push(
      await saveGeneratedDocument({
        applicationId,
        kind: "short_answers",
        company: ctx.company,
        roleTitle: ctx.roleTitle,
        filename: "ShortAnswers.pdf",
        bytes,
        mimeType: "application/pdf",
      }),
    );
  }

  // Persist the reviewed raw text — this is exactly what the extension fills.
  await db
    .update(applications)
    .set({
      drafts: {
        coverLetter: input.coverLetter?.trim() || undefined,
        answers: input.answers?.filter((a) => a.answer.trim()),
      },
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  revalidatePath(`/tracker/${applicationId}`);
  revalidatePath("/documents");
  return saved;
}

export async function updateStorageDestination(dest: "inapp" | "local" | "gdrive") {
  const { settings } = await import("@tracker/db");
  await db
    .insert(settings)
    .values({ id: true, storageDestination: dest, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.id,
      set: { storageDestination: dest, updatedAt: new Date() },
    });
  revalidatePath("/settings");
}
