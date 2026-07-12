import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { googleAuthUrl } from "@tracker/shared";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const STATE_COOKIE = "gmail_oauth_state";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Session-gated (via proxy — /api/gmail isn't in its exclusion list, same as
 * every other page). Starts the Gmail consent flow: a SEPARATE OAuth grant from
 * sign-in, requesting only gmail.readonly, so the sign-in flow itself is never
 * touched or widened. The state nonce goes in a short-lived httpOnly cookie and
 * is verified in the callback to guard against CSRF.
 */
export async function GET() {
  const state = randomUUID();
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });

  const url = googleAuthUrl(
    { clientId: process.env.AUTH_GOOGLE_ID ?? "", clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "" },
    { redirectUri: `${APP_URL}/api/gmail/callback`, scope: GMAIL_SCOPE, state },
  );
  return NextResponse.redirect(url);
}
