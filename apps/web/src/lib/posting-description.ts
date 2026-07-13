import Anthropic from "@anthropic-ai/sdk";

/**
 * Fills in the gap left by github_repo sources: their README tables carry
 * only company/role/location/link, so `postings.description` is null even
 * though the posting's own URL has the real job page. This fetches that page
 * once, strips it to plain text, and has Haiku extract a short summary in the
 * same plain-text format `RichText` already renders (blank-line paragraphs,
 * "- " bullets) — cached back onto the posting so it only ever runs once per
 * posting per success.
 */

const MODEL = "claude-haiku-4-5-20251001";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_CHARS = 60_000;
const MAX_TEXT_CHARS = 15_000;
const MIN_TEXT_CHARS = 200;

/**
 * SSRF guard. `posting.url` originates from external sources (GitHub repos, ATS
 * feeds), so a malicious row could point at an internal/metadata endpoint. This
 * app is single-tenant, but the check is cheap defense-in-depth: allow only
 * http(s) to a public host. It validates the initial URL only — Node's fetch
 * follows redirects, so a public host that 3xx-redirects inward isn't covered
 * here; acceptable given the threat model, and the output is model-summarized
 * text rather than the raw body, which limits blind-SSRF exfiltration.
 */
function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (host === "::1" || host === "0.0.0.0") return false;

  // Block private / loopback / link-local IPv4 literals (incl. cloud metadata 169.254.x.x).
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number);
    if (a === 10 || a === 127 || (a === 169 && b === 254)) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  // Block unique-local / loopback IPv6 literals.
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return false;

  return true;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchPageText(url: string): Promise<string | null> {
  if (!isPublicHttpUrl(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; ErevnitisBot/1.0; +personal internship tracker)" },
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, MAX_HTML_CHARS);
    return stripHtml(html).slice(0, MAX_TEXT_CHARS);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const SYSTEM = `You extract and summarize internship/job postings from raw scraped web-page text. The text may contain site navigation, cookie banners, and unrelated boilerplate mixed in with the actual posting — ignore all of that and find the real posting content.

Write a concise, well-organized plain-text summary covering, when present in the source text:
- A short general description of the role and team
- Key skills/qualifications required or preferred
- Target graduation date(s) / class year / eligibility (e.g. "Graduating Dec 2027 - Jun 2028", "rising junior or senior")
- Anything else materially important to deciding whether to apply (visa sponsorship, pay range, location/remote policy, application deadline)

Formatting rules (plain text only, no markdown headers, no HTML):
- Separate distinct sections with a blank line
- Start qualification/requirement list lines with "- "
- Never fabricate information that isn't in the source text — omit a section entirely if the source doesn't cover it
- If the page clearly isn't a job posting (a login wall, error page, or a generic careers homepage with no specific role content), respond with exactly: NOT_FOUND`;

export async function extractPostingDescription(params: {
  url: string;
  company: string;
  title: string;
}): Promise<string | null> {
  const text = await fetchPageText(params.url);
  if (!text || text.length < MIN_TEXT_CHARS) return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const user = `Company: ${params.company}
Role: ${params.title}

Raw page text:
${text}`;

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    const block = res.content.find((b) => b.type === "text");
    const summary = block?.type === "text" ? block.text.trim() : "";
    if (!summary || summary === "NOT_FOUND") return null;
    return summary;
  } catch {
    return null;
  }
}
