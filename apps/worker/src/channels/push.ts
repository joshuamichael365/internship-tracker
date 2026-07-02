import webpush from "web-push";
import { db, eq, pushSubscriptions } from "@tracker/db";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(`mailto:${process.env.NOTIFY_EMAIL_TO ?? "me@example.com"}`, pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export async function sendPush(payload: PushPayload): Promise<boolean> {
  if (!ensureConfigured()) {
    console.log(`[push] (unconfigured) would send: ${payload.title}`);
    return false;
  }
  const subs = await db.select().from(pushSubscriptions);
  let delivered = false;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(payload),
      );
      delivered = true;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // Subscription expired/revoked — clean it up.
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      } else {
        console.error(`[push] send failed:`, err);
      }
    }
  }
  return delivered;
}
