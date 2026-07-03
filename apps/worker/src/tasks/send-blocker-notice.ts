import type { Task } from "graphile-worker";
import { applications, db, eq } from "@tracker/db";
import { deliver } from "../notify.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Enqueued from /api/assist/report once auto-apply has hit a blocker 3 times:
 *   select graphile_worker.add_job('send_blocker_notice',
 *     json_build_object('applicationId', $1, 'detail', $2))
 * Hands the application back to the user with a "finish it yourself" nudge.
 */
export const sendBlockerNotice: Task = async (payload) => {
  const { applicationId, detail } = payload as { applicationId: number; detail?: string };
  if (typeof applicationId !== "number") return;

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return;

  await deliver({
    title: "Auto-apply blocked — needs you",
    body: `${app.company} — ${app.roleTitle}: ${detail ?? "CAPTCHA or bot-check"}. Finish this one manually.`,
    url: `${APP_URL}/tracker/${applicationId}`,
    kind: "blocker",
    applicationId,
  });
};
