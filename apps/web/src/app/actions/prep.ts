"use server";

import { revalidatePath } from "next/cache";
import { applications, db, eq, postings, profile } from "@tracker/db";
import { generateInterviewPrep, type InterviewPrep, type PrepContext } from "@/lib/interview-prep";

async function contextFor(applicationId: number): Promise<PrepContext | null> {
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
    company: app.company,
    roleTitle: app.roleTitle,
    description: posting?.description,
    roleType: posting?.roleType,
    profileData: (prof?.data ?? {}) as Record<string, unknown>,
  };
}

/** Generates (or regenerates) prep guidance and persists it — cached like modeRecommendation so views don't re-bill. */
export async function generatePrep(applicationId: number): Promise<InterviewPrep> {
  const ctx = await contextFor(applicationId);
  if (!ctx) throw new Error("Application not found");

  const prep = await generateInterviewPrep(ctx);

  await db
    .update(applications)
    .set({ prep, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));

  revalidatePath("/tracker");
  revalidatePath(`/tracker/${applicationId}`);
  return prep;
}
