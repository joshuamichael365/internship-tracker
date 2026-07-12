import { db, desc, settings, sources } from "@tracker/db";
import { Card, PageHeader } from "@/components/ui";
import { SourcesManager } from "@/components/sources-manager";
import { NotificationSettings } from "@/components/notification-settings";
import { StorageSettings } from "@/components/storage-settings";
import { AutoApplySettings } from "@/components/auto-apply-settings";
import { GmailSettings } from "@/components/gmail-settings";
import { driveConfigured } from "@/lib/gdrive";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const rows = await db.select().from(sources).orderBy(desc(sources.createdAt));
  const hasPresets = rows.some((s) => s.kind === "github_repo");
  const [prefs] = await db.select().from(settings).limit(1);
  const rules = (prefs?.notificationRules ?? {}) as Record<string, string[]>;

  return (
    <>
      <PageHeader title="Settings" subtitle="Sources, notifications, quiet hours, and storage" />
      <div className="grid gap-4">
        <Card>
          <h2 className="text-[17px] font-semibold">Sources</h2>
          <p className="mb-2 mt-1 text-[13px] text-secondary">
            The worker polls every enabled source about once a minute using conditional requests.
          </p>
          <SourcesManager
            sources={rows.map((s) => ({
              id: s.id,
              kind: s.kind,
              name: s.name,
              enabled: s.enabled,
              lastPolledAt: s.lastPolledAt?.toISOString() ?? null,
              lastError: s.lastError,
            }))}
            hasPresets={hasPresets}
          />
        </Card>
        <Card>
          <h2 className="mb-3 text-[17px] font-semibold">Notifications</h2>
          <NotificationSettings
            initial={{
              timezone: prefs?.timezone ?? "America/New_York",
              quietHoursStart: prefs?.quietHoursStart ?? 23,
              quietHoursEnd: prefs?.quietHoursEnd ?? 7,
              channels: prefs?.channels ?? { push: true, email: true, sms: false },
              includeNewGrad: prefs?.includeNewGrad ?? false,
              rules,
              watchlistCompanies: prefs?.watchlistCompanies ?? [],
              digestHours: prefs?.digestHours ?? [8, 17],
            }}
            vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null}
          />
        </Card>
        <Card>
          <h2 className="mb-1 text-[17px] font-semibold">Automation</h2>
          <p className="mb-3 text-[13px] text-secondary">
            Controls whether the browser extension may submit applications for you.
          </p>
          <AutoApplySettings initial={prefs?.autoApplyEnabled ?? false} />
        </Card>
        <Card>
          <h2 className="mb-1 text-[17px] font-semibold">Gmail status monitoring</h2>
          <GmailSettings
            initial={{
              enabled: prefs?.gmailEnabled ?? false,
              connectedEmail: prefs?.gmailConnectedEmail ?? null,
              lastSyncAt: prefs?.gmailLastSyncAt?.toISOString() ?? null,
            }}
          />
        </Card>
        <Card>
          <h2 className="mb-1 text-[17px] font-semibold">Document storage</h2>
          <p className="mb-3 text-[13px] text-secondary">
            Where generated cover letters and short answers are saved.
          </p>
          <StorageSettings
            initial={prefs?.storageDestination ?? "inapp"}
            driveConnected={driveConfigured()}
          />
        </Card>
      </div>
    </>
  );
}
