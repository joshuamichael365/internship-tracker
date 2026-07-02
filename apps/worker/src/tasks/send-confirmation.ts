import type { Task } from "graphile-worker";
import { onSubmissionConfirmed } from "../notify.js";

/**
 * Enqueued from the web app via SQL:
 *   select graphile_worker.add_job('send_confirmation', json_build_object('applicationId', $1))
 */
export const sendConfirmation: Task = async (payload) => {
  const { applicationId } = payload as { applicationId: number };
  if (typeof applicationId === "number") await onSubmissionConfirmed(applicationId);
};
