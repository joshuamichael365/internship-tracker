"use server";

import { revalidatePath } from "next/cache";
import { db, eq, postings } from "@tracker/db";
import { classifyLevel, classifyLocationMode, classifyRole, dedupeHash, extractTerms } from "@tracker/shared";
import {
  extractPostingFromScreenshot,
  type ExtractResult,
  type ScreenshotMediaType,
} from "@/lib/screenshot-extract";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, ScreenshotMediaType> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/webp": "image/webp",
};

/**
 * Runs vision extraction on an uploaded screenshot. The decoded bytes live
 * only in this function's memory — nothing is written to disk or the DB, per
 * the intake spec (extract and discard).
 */
export async function extractFromScreenshot(formData: FormData): Promise<ExtractResult> {
  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, data: { company: "", title: "" }, message: "No image received — try again." };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      data: { company: "", title: "" },
      message: "That image is over 10MB — try a smaller screenshot.",
    };
  }
  const mediaType = ALLOWED_TYPES[file.type];
  if (!mediaType) {
    return {
      ok: false,
      data: { company: "", title: "" },
      message: "Unsupported image type — use PNG, JPG, or WebP.",
    };
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  return extractPostingFromScreenshot(base64, mediaType);
}

export interface ConfirmedIntake {
  company: string;
  title: string;
  url?: string;
  locations?: string[];
  term?: string;
  notes?: string;
}

export interface IntakeCreateResult {
  status: "created" | "existing";
  postingId: number;
}

/**
 * Creates the posting from the user-confirmed intake form, running it
 * through the same normalize/dedupe/tag pipeline as the worker's ingest
 * (apps/worker/src/ingest.ts) so a screenshot-sourced posting behaves
 * identically to a polled one. dedupeHash normalizes company/title/location
 * internally, so a match here means the worker (or an earlier intake) has
 * already recorded this exact company + role + location — we return that
 * posting instead of inserting a duplicate. seenIn stays empty: there's no
 * sources row for a manual screenshot intake.
 */
export async function createPostingFromIntake(input: ConfirmedIntake): Promise<IntakeCreateResult> {
  const company = input.company.trim();
  const title = input.title.trim();
  if (!company || !title) throw new Error("Company and title are required.");

  const locations = (input.locations ?? []).map((l) => l.trim()).filter(Boolean);
  const url = input.url?.trim() ?? "";
  const description = input.notes?.trim() || null;

  const hash = dedupeHash({ company, title, locations });
  const existing = await db
    .select({ id: postings.id })
    .from(postings)
    .where(eq(postings.dedupeHash, hash))
    .limit(1);
  if (existing.length > 0) {
    return { status: "existing", postingId: existing[0]!.id };
  }

  const [inserted] = await db
    .insert(postings)
    .values({
      dedupeHash: hash,
      company,
      title,
      url,
      locations,
      locationMode: classifyLocationMode(locations, description ?? ""),
      roleType: classifyRole(title, description ?? ""),
      jobLevel: classifyLevel(title, description ?? "") ?? "internship",
      description,
      terms: extractTerms(title, input.term ? [input.term] : undefined),
      status: "active",
      seenIn: [],
    })
    .onConflictDoNothing({ target: postings.dedupeHash })
    .returning({ id: postings.id });

  if (!inserted) {
    // Lost a race with a concurrent insert of the same posting — return that one.
    const [row] = await db.select({ id: postings.id }).from(postings).where(eq(postings.dedupeHash, hash)).limit(1);
    return { status: "existing", postingId: row!.id };
  }

  revalidatePath("/internships");
  return { status: "created", postingId: inserted.id };
}
