import type { Task } from "graphile-worker";
import { db, eq, sources } from "@tracker/db";
import type { NormalizedPosting } from "@tracker/shared";
import { ingestPostings } from "../ingest.js";
import { pollGithubRepo } from "../sources/github.js";
import {
  pollAshby,
  pollGreenhouse,
  pollLever,
  pollSmartRecruiters,
  pollWorkday,
} from "../sources/ats.js";
import { pollRss } from "../sources/rss.js";
import type { ConditionalResult } from "../sources/http.js";

type PollOutput = { result: ConditionalResult; postings: NormalizedPosting[] };

async function pollOne(
  source: typeof sources.$inferSelect,
): Promise<PollOutput> {
  const cfg = source.config as Record<string, string>;
  const cache = source.httpCache;
  switch (source.kind) {
    case "github_repo":
      return pollGithubRepo(cfg as { repo: string; branch?: string; listingsPath?: string }, cache);
    case "greenhouse":
      return pollGreenhouse(cfg as { boardToken: string }, cache);
    case "lever":
      return pollLever(cfg as { site: string }, cache);
    case "smartrecruiters":
      return pollSmartRecruiters(cfg as { company: string }, cache);
    case "ashby":
      return pollAshby(cfg as { clientName: string }, cache);
    case "workday":
      return pollWorkday(cfg as unknown as { host: string; tenant: string; site: string }, cache);
    case "rss":
    case "instagram_mirror":
      return pollRss(cfg as unknown as { feedUrl: string; defaultCompany?: string }, cache);
    default:
      throw new Error(`unknown source kind: ${source.kind}`);
  }
}

export const pollSources: Task = async (_payload, { logger }) => {
  const enabled = await db.select().from(sources).where(eq(sources.enabled, true));
  if (enabled.length === 0) return;

  // First poll of a brand-new source backfills without notifying — otherwise
  // adding SimplifyJobs would fire hundreds of "new posting" alerts at once.
  for (const source of enabled) {
    const isFirstPoll = source.lastPolledAt === null;
    try {
      const { result, postings } = await pollOne(source);
      const stats = await ingestPostings(source.id, postings, { skipNotify: isFirstPoll });
      await db
        .update(sources)
        .set({
          lastPolledAt: new Date(),
          httpCache: result.cache ?? source.httpCache,
          lastError: null,
        })
        .where(eq(sources.id, source.id));
      if (!result.notModified && postings.length > 0) {
        logger.info(
          `${source.name}: +${stats.inserted} new, ${stats.duplicates} dup, ${stats.irrelevant} skipped, ${stats.suppressed} suppressed${isFirstPoll ? " (initial backfill, no notifications)" : ""}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`${source.name}: ${message}`);
      await db
        .update(sources)
        .set({
          // Preserve lastPolledAt=null for a source that has never successfully
          // polled, so its first SUCCESSFUL poll is still treated as the silent
          // backfill — otherwise a failed first poll here would let the next
          // success notify on every one of its (potentially thousands of) rows.
          ...(source.lastPolledAt ? { lastPolledAt: new Date() } : {}),
          lastError: message,
        })
        .where(eq(sources.id, source.id));
    }
  }
};
