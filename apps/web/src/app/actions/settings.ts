"use server";

import { revalidatePath } from "next/cache";
import { db, settings } from "@tracker/db";
import { revokeGoogleToken, type NotificationRules } from "@tracker/shared";

export interface SettingsUpdate {
  timezone?: string;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  channels?: { push: boolean; email: boolean; sms: boolean };
  includeNewGrad?: boolean;
  notificationRules?: NotificationRules;
  autoApplyEnabled?: boolean;
  watchlistCompanies?: string[];
  digestHours?: number[];
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

/** Revokes the Gmail grant with Google (best-effort) and clears the stored token/state. */
export async function disconnectGmail() {
  const [row] = await db.select({ token: settings.gmailRefreshToken }).from(settings).limit(1);
  if (row?.token) await revokeGoogleToken(row.token);

  await db
    .insert(settings)
    .values({ id: true, gmailEnabled: false, gmailRefreshToken: null, gmailConnectedEmail: null, gmailLastSyncAt: null })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        gmailEnabled: false,
        gmailRefreshToken: null,
        gmailConnectedEmail: null,
        gmailLastSyncAt: null,
        updatedAt: new Date(),
      },
    });
  revalidatePath("/settings");
}
