import type { Task } from "graphile-worker";
import { and, db, eq, lt, postings, sql } from "@tracker/db";

/** Postings whose stated deadline has passed leave the active list (still visible in Archive). */
export const autoArchive: Task = async (_payload, { logger }) => {
  const result = await db
    .update(postings)
    .set({ status: "expired" })
    .where(and(eq(postings.status, "active"), lt(postings.deadline, sql`now()`)))
    .returning({ id: postings.id });
  if (result.length > 0) logger.info(`archived ${result.length} expired posting(s)`);
};
