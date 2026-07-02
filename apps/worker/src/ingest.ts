import { applications, db, eq, postings } from "@tracker/db";
import {
  classifyLevel,
  classifyLocationMode,
  classifyRole,
  dedupeHash,
  isRelevantRole,
  normalizeCompany,
  normalizeTitle,
  type NormalizedPosting,
} from "@tracker/shared";
import { onNewPosting } from "./notify.js";

function safeDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export interface IngestStats {
  inserted: number;
  duplicates: number;
  irrelevant: number;
  suppressed: number;
}

/**
 * Core pipeline: normalize → dedupe → tag → suppress-if-applied → store → notify.
 * Cross-source duplicates merge into one card via dedupe_hash; re-seeing a
 * posting never re-notifies.
 */
export async function ingestPostings(
  sourceId: number,
  items: NormalizedPosting[],
  opts: { skipNotify?: boolean } = {},
): Promise<IngestStats> {
  const stats: IngestStats = { inserted: 0, duplicates: 0, irrelevant: 0, suppressed: 0 };
  if (items.length === 0) return stats;

  // Applied roles (any stage past "saved") suppress re-notification for matching postings.
  const applied = await db
    .select({ company: applications.company, roleTitle: applications.roleTitle })
    .from(applications);
  const appliedKeys = new Set(
    applied.map((a) => `${normalizeCompany(a.company)}|${normalizeTitle(a.roleTitle)}`),
  );

  for (const item of items) {
    if (!isRelevantRole(item.title)) {
      stats.irrelevant++;
      continue;
    }
    const hash = dedupeHash(item);
    const seenEntry = { sourceId, url: item.url, seenAt: new Date().toISOString() };

    const existing = await db
      .select({ id: postings.id, seenIn: postings.seenIn })
      .from(postings)
      .where(eq(postings.dedupeHash, hash))
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0]!;
      if (!row.seenIn.some((s) => s.sourceId === sourceId)) {
        await db
          .update(postings)
          .set({ seenIn: [...row.seenIn, seenEntry] })
          .where(eq(postings.id, row.id));
      }
      stats.duplicates++;
      continue;
    }

    const rawTags = (item.raw ?? {}) as Record<string, unknown>;
    const suppressed = appliedKeys.has(
      `${normalizeCompany(item.company)}|${normalizeTitle(item.title)}`,
    );

    const [inserted] = await db
      .insert(postings)
      .values({
        dedupeHash: hash,
        company: item.company,
        title: item.title,
        url: item.url,
        locations: item.locations,
        locationMode: item.locationMode ?? classifyLocationMode(item.locations, item.description),
        roleType: item.roleType ?? classifyRole(item.title, item.description),
        jobLevel: item.jobLevel ?? classifyLevel(item.title, item.description) ?? "internship",
        description: item.description,
        deadline: safeDate(item.deadline),
        postedAt: safeDate(item.postedAt),
        status: suppressed ? "hidden" : "active",
        sponsorship:
          rawTags.sponsorship === "sponsors" || rawTags.sponsorship === "citizens_only"
            ? (rawTags.sponsorship as "sponsors" | "citizens_only")
            : "unknown",
        seenIn: [seenEntry],
        raw: item.raw ?? null,
      })
      .onConflictDoNothing({ target: postings.dedupeHash })
      .returning({ id: postings.id });

    if (!inserted) {
      stats.duplicates++;
      continue;
    }
    if (suppressed) {
      stats.suppressed++;
      continue;
    }
    stats.inserted++;
    if (!opts.skipNotify) await onNewPosting(inserted.id);
  }

  return stats;
}
