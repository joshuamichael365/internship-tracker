"use server";

import { revalidatePath } from "next/cache";
import { applications, db, eq, postings } from "@tracker/db";
import { extractPostingDescription } from "@/lib/posting-description";

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

/**
 * Fetches the posting's own URL and has Haiku extract a summary — fills the
 * gap for github_repo sources, whose README tables carry no description.
 * Persists "" (distinct from null) on a failed attempt so the client knows
 * not to keep auto-retrying on every page view; "" still renders the same
 * fallback UI as null everywhere else since both are falsy.
 */
export async function generatePostingDescription(id: number): Promise<string> {
  const [p] = await db.select().from(postings).where(eq(postings.id, id)).limit(1);
  if (!p || !p.url) return "";

  const description = (await extractPostingDescription({
    url: p.url,
    company: p.company,
    title: p.title,
  })) ?? "";

  await db.update(postings).set({ description }).where(eq(postings.id, id));
  revalidatePath(`/internships/${id}`);
  return description;
}
