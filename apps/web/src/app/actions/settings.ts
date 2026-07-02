"use server";

import { revalidatePath } from "next/cache";
import { db, settings, sql } from "@tracker/db";
import type { NotificationRules } from "@tracker/shared";

export interface SettingsUpdate {
  timezone?: string;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  channels?: { push: boolean; email: boolean; sms: boolean };
  includeNewGrad?: boolean;
  notificationRules?: NotificationRules;
}

export async function updateSettings(update: SettingsUpdate) {
  // Single-row table: upsert on the constant primary key.
  await db
    .insert(settings)
    .values({ id: true, ...update, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.id,
      set: { ...update, updatedAt: new Date() },
    });
  revalidatePath("/settings");
  revalidatePath("/internships");
}

/** Used by tracker stage changes to fire the submission-confirmation receipt. */
export async function enqueueConfirmation(applicationId: number) {
  await db.execute(
    sql`select graphile_worker.add_job('send_confirmation', json_build_object('applicationId', ${applicationId}::int))`,
  );
}
