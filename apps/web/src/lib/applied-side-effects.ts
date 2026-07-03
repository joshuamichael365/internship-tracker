import { db, eq, postings, sql } from "@tracker/db";
import { normalizeCompany, normalizeTitle } from "@tracker/shared";

/**
 * Side effects of an application first landing in "applied", shared by the
 * manual stage change (actions/applications.ts) and the extension's auto-apply
 * report (api/assist/report). Fires the submission receipt and hides matching
 * active postings so reposts stop showing/notifying.
 */
export async function onApplied(id: number, company: string, roleTitle: string) {
  await db.execute(
    sql`select graphile_worker.add_job('send_confirmation', json_build_object('applicationId', ${id}::int))`,
  );
  const active = await db
    .select({ id: postings.id, company: postings.company, title: postings.title })
    .from(postings)
    .where(eq(postings.status, "active"));
  const cKey = normalizeCompany(company);
  const tKey = normalizeTitle(roleTitle);
  const toHide = active
    .filter((p) => normalizeCompany(p.company) === cKey && normalizeTitle(p.title) === tKey)
    .map((p) => p.id);
  for (const pid of toHide) {
    await db.update(postings).set({ status: "hidden" }).where(eq(postings.id, pid));
  }
}
