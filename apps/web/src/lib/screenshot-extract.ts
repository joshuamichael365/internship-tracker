import Anthropic from "@anthropic-ai/sdk";

/**
 * Vision extraction for Screenshot Intake: pulls posting details out of a
 * screenshot (typically an Instagram story) using Haiku. Follows the same
 * graceful-degradation pattern as resume-parse.ts/drafting.ts — no
 * ANTHROPIC_API_KEY means a clearly-labeled empty extraction, never a crash.
 */

export type ScreenshotMediaType = "image/png" | "image/jpeg" | "image/webp";

export interface ScreenshotExtraction {
  company: string;
  title: string;
  url?: string;
  locations?: string[];
  term?: string;
  notes?: string;
}

export interface ExtractResult {
  ok: boolean;
  data: ScreenshotExtraction;
  /** User-facing explanation when extraction was skipped, partial, or failed. */
  message?: string;
}

const MODEL = "claude-haiku-4-5-20251001";

function emptyExtraction(): ScreenshotExtraction {
  return { company: "", title: "" };
}

const EXTRACTION_PROMPT = [
  "This is a screenshot of a social-media post (often an Instagram story) announcing a software/ML/CS internship opening.",
  "Extract the posting into strict JSON with these keys:",
  '{"company": string, "title": string, "url"?: string, "locations"?: string[], "term"?: string, "notes"?: string}',
  "- company and title: your best reading of the employer and role name, even if the image is partial.",
  "- url: ONLY include if a full or near-complete URL is actually legible in the image. Never guess, complete, or construct one from the company name — omit the key entirely if no URL is visible.",
  "- locations: array of city/remote strings if shown.",
  '- term: the application cycle if shown, e.g. "Summer 2027".',
  "- notes: anything else worth carrying over (deadline, comp, requirements) in one or two sentences.",
  "Output ONLY the JSON object — no commentary, no markdown fences.",
].join("\n");

export async function extractPostingFromScreenshot(
  base64: string,
  mediaType: ScreenshotMediaType,
): Promise<ExtractResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      data: emptyExtraction(),
      message: "The Claude API key isn't configured yet — fill in the details below by hand.",
    };
  }

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const block = res.content.find((b) => b.type === "text");
  if (block?.type !== "text") {
    return {
      ok: false,
      data: emptyExtraction(),
      message: "Couldn't read a response from the model — fill in the details below by hand.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(block.text.trim().replace(/^```json?\n?|\n?```$/g, ""));
  } catch {
    return {
      ok: false,
      data: emptyExtraction(),
      message: "Couldn't parse what the model found — fill in the details below by hand.",
    };
  }

  const p = (parsed ?? {}) as Record<string, unknown>;
  const data: ScreenshotExtraction = {
    company: typeof p.company === "string" ? p.company.trim() : "",
    title: typeof p.title === "string" ? p.title.trim() : "",
    url: typeof p.url === "string" && p.url.trim() ? p.url.trim() : undefined,
    locations: Array.isArray(p.locations)
      ? p.locations.filter((l): l is string => typeof l === "string" && l.trim().length > 0)
      : undefined,
    term: typeof p.term === "string" && p.term.trim() ? p.term.trim() : undefined,
    notes: typeof p.notes === "string" && p.notes.trim() ? p.notes.trim() : undefined,
  };

  if (!data.company && !data.title) {
    return {
      ok: false,
      data,
      message: "Couldn't make out a company or role in that screenshot — fill in the details below by hand.",
    };
  }

  return { ok: true, data };
}
