"use server";

import { revalidatePath } from "next/cache";
import { applications, db, eq, postings } from "@tracker/db";

export async function toggleBookmark(id: number, bookmarked: boolean) {
  await db.update(postings).set({ bookmarked }).where(eq(postings.id, id));
  revalidatePath("/internships");
  revalidatePath(`/internships/${id}`);
}

export async function savePostingNotes(id: number, notes: string) {
  await db.update(postings).set({ notes }).where(eq(postings.id, id));
  revalidatePath(`/internships/${id}`);
}

/**
 * Adds the posting to the tracker (stage: Saved). The application mode stays
 * null — per spec, the user always chooses it explicitly, never a default.
 */
export async function trackPosting(id: number) {
  const [p] = await db.select().from(postings).where(eq(postings.id, id)).limit(1);
  if (!p) return;
  const existing = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.postingId, id))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(applications).values({
    postingId: p.id,
    company: p.company,
    roleTitle: p.title,
    location: p.locations[0] ?? null,
    url: p.url,
    stage: "saved",
  });
  revalidatePath("/tracker");
  revalidatePath(`/internships/${id}`);
}
