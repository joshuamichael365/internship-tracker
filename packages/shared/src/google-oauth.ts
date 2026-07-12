/**
 * Minimal Google OAuth2 helpers shared by web (the /api/gmail/connect + /callback
 * consent flow) and worker (refreshing the stored token to poll Gmail). Plain
 * fetch, no SDK — matches the dependency-free ethos of this package. Every
 * function takes clientId/clientSecret explicitly rather than reading env vars,
 * since web and worker read them from different places.
 */

export interface GoogleOAuthClient {
  clientId: string;
  clientSecret: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

/** Builds the consent-screen URL for a given scope. `state` should be a server-verified nonce (CSRF). */
export function googleAuthUrl(
  client: GoogleOAuthClient,
  opts: { redirectUri: string; scope: string; state: string },
): string {
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: opts.scope,
    access_type: "offline",
    prompt: "consent", // force a refresh_token even on a re-connect
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(
  client: GoogleOAuthClient,
  code: string,
  redirectUri: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as GoogleTokenResponse;
}

export async function refreshGoogleAccessToken(
  client: GoogleOAuthClient,
  refreshToken: string,
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** Best-effort revoke — swallow failures since we clear our own copy of the token regardless. */
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
    });
  } catch {
    // best-effort
  }
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}
