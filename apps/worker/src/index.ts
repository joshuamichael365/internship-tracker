import { run } from "graphile-worker";
import { pollSources } from "./tasks/poll-sources.js";
import { autoArchive } from "./tasks/auto-archive.js";
import { sendDigest } from "./tasks/send-digest.js";
import { sendConfirmation } from "./tasks/send-confirmation.js";
import { sendBlockerNotice } from "./tasks/send-blocker-notice.js";
import { sendReminders } from "./tasks/send-reminders.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://localhost:5432/internship_tracker";

async function main() {
  const runner = await run({
    connectionString: DATABASE_URL,
    concurrency: 4,
    taskList: {
      poll_sources: pollSources,
      auto_archive: autoArchive,
      send_digest: sendDigest,
      send_confirmation: sendConfirmation,
      send_blocker_notice: sendBlockerNotice,
      send_reminders: sendReminders,
    },
    // Discovery is latency-critical: poll every minute (each poller uses
    // conditional requests, so most ticks are cheap 304s). Digest flush is
    // checked every 5 minutes against the user's quiet-hours window;
    // archive sweep hourly.
    crontab: [
      "* * * * * poll_sources",
      "*/5 * * * * send_digest",
      "*/5 * * * * send_reminders",
      "13 * * * * auto_archive",
    ].join("\n"),
  });

  console.log("[worker] running — pollers scheduled");
  await runner.promise;
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
