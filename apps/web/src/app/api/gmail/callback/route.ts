import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db, settings } from "@tracker/db";
import { exchangeGoogleCode, fetchGoogleUserEmail } from "@tracker/shared";

const STATE_COOKIE = "gmail_oauth_state";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

function toSettings(status: "connected" | "error", detail?: string) {
  const params = new URLSearchParams({ gmail: status, ...(detail ? { detail } : {}) });
  return NextResponse.redirect(`${APP_URL}/settings?${params.toString()}`);
}

/**
 * Session-gated (via proxy). Completes the Gmail consent flow: verifies the
 * CSRF state cookie, exchanges the code for tokens, and persists ONLY the
 * refresh token + connected email address — never an access token (short-lived,
 * regenerated per sync) and never anything from the inbox itself yet.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  if (error) return toSettings("error", "You declined the Gmail permission request.");
  if (!code || !state || !expectedState || state !== expectedState) {
    return toSettings("error", "That link expired or was invalid — try connecting again.");
  }

  const client = { clientId: process.env.AUTH_GOOGLE_ID ?? "", clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "" };
  try {
    const tokens = await exchangeGoogleCode(client, code, `${APP_URL}/api/gmail/callback`);
    if (!tokens.refresh_token) {
      // Google omits refresh_token on a repeat consent without prompt=consent forcing it —
      // connect.ts always sets prompt=consent, so this should be rare (e.g. a stale link).
      return toSettings("error", "Didn't get a long-lived grant — try connecting again.");
    }
    const email = await fetchGoogleUserEmail(tokens.access_token);

    await db
      .insert(settings)
      .values({
        id: true,
        gmailEnabled: true,
        gmailRefreshToken: tokens.refresh_token,
        gmailConnectedEmail: email,
        gmailLastSyncAt: null, // first sync scans a bounded lookback window, not "everything ever"
      })
      .onConflictDoUpdate({
        target: settings.id,
        set: {
          gmailEnabled: true,
          gmailRefreshToken: tokens.refresh_token,
          gmailConnectedEmail: email,
          gmailLastSyncAt: null,
          updatedAt: new Date(),
        },
      });

    return toSettings("connected");
  } catch (err) {
    console.error("[gmail-callback]", err);
    return toSettings("error", "Something went wrong connecting Gmail — try again.");
  }
}
