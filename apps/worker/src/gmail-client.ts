/**
 * Gmail read-only client + status classifier for P2-M2. Plain fetch throughout
 * (Gmail REST API + Anthropic REST API) — matches this app's "no SDK in the
 * worker" convention (see channels/*.ts). Deliberately narrow: list + metadata
 * only (never a full message body fetch), so the raw email content is never
 * pulled into this process at all, let alone stored.
 */

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessageMeta {
  id: string;
  from: string;
  subject: string;
  snippet: string;
}

/** Message ids received since `afterEpochSeconds`, newest inbox first, capped at 50 (one poll window). */
export async function listRecentMessageIds(accessToken: string, afterEpochSeconds: number): Promise<string[]> {
  const q = encodeURIComponent(`after:${afterEpochSeconds}`);
  const res = await fetch(`${GMAIL_API}/messages?q=${q}&maxResults=50`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail list failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { messages?: { id: string }[] };
  return (data.messages ?? []).map((m) => m.id);
}

/**
 * Metadata-only fetch: From, Subject, and Gmail's own short `snippet` (a
 * ~200-char preview it generates) — never `format=full`, so the full email
 * body never leaves Google's servers into this process.
 */
export async function getMessageMeta(accessToken: string, id: string): Promise<GmailMessageMeta | null> {
  const params = new URLSearchParams({ format: "metadata" });
  params.append("metadataHeaders", "From");
  params.append("metadataHeaders", "Subject");
  const res = await fetch(`${GMAIL_API}/messages/${id}?${params.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    snippet?: string;
    payload?: { headers?: { name: string; value: string }[] };
  };
  const headers = data.payload?.headers ?? [];
  const get = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  return { id, from: get("From"), subject: get("Subject"), snippet: data.snippet ?? "" };
}

export type StatusSignal = "interview_invite" | "oa_invite" | "offer" | "rejection" | "confirmation" | "none";

export interface ClassifyResult {
  signal: StatusSignal;
  confidence: "high" | "low";
}

const MODEL = "claude-haiku-4-5-20251001";

/**
 * Classifies one candidate email against one tracked application. Only ever
 * sees From/Subject/snippet (already short, never a full body) and discards
 * them immediately after — the classification result is the only thing that
 * gets persisted, never the email text itself.
 */
export async function classifyStatusSignal(input: {
  company: string;
  roleTitle: string;
  from: string;
  subject: string;
  snippet: string;
}): Promise<ClassifyResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { signal: "none", confidence: "low" };

  const system = `You classify a single email as an application-status signal for ONE specific tracked job application, or "none" if it isn't actually about that application. Reply with ONLY strict JSON: {"signal": "interview_invite"|"oa_invite"|"offer"|"rejection"|"confirmation"|"none", "confidence": "high"|"low"}.

- interview_invite: inviting them to a live/phone/video interview.
- oa_invite: an online assessment / coding test / take-home.
- offer: an actual job offer.
- rejection: declining the application ("unfortunately", "not moving forward", "other candidates").
- confirmation: acknowledges the application was received (no further status yet).
- none: unrelated to this application, or you can't tell.

Only use "high" confidence when the email is clearly and specifically about THIS company/role — not a general newsletter, marketing email, or an email that merely mentions a similar word. When unsure, use "low" or "none".`;

  const user = `Tracked application: ${input.roleTitle} at ${input.company}\n\nEmail From: ${input.from}\nEmail Subject: ${input.subject}\nEmail preview: ${input.snippet}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 100, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) return { signal: "none", confidence: "low" };
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Partial<ClassifyResult>;
    const signal: StatusSignal = ["interview_invite", "oa_invite", "offer", "rejection", "confirmation", "none"].includes(
      parsed.signal ?? "",
    )
      ? (parsed.signal as StatusSignal)
      : "none";
    const confidence: "high" | "low" = parsed.confidence === "high" ? "high" : "low";
    return { signal, confidence };
  } catch {
    return { signal: "none", confidence: "low" };
  }
}
