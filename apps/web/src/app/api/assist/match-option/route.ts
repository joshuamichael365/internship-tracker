import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { ASSIST_CORS, assistAuthorized, assistPreflight } from "@/lib/extension-auth";

/**
 * Semantic fallback for choice questions (radios/checkboxes/selects). The
 * extension's literal text match runs first in content.js; when it fails to
 * find an option matching the user's stored profile answer, it calls here
 * with the question, the portal's option list, and the stored answer.
 * claude-haiku maps the stored answer to the closest option — or refuses.
 *
 * This endpoint NEVER invents an answer: it only ever returns the index of
 * an option that expresses the SAME answer the user already stored. Unsure
 * → null, and the extension leaves the field for the user to review.
 */

const MODEL = "claude-haiku-4-5-20251001";

export function OPTIONS() {
  return assistPreflight();
}

export async function POST(req: Request) {
  if (!assistAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: ASSIST_CORS });
  }

  let body: { question?: unknown; options?: unknown; storedAnswer?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400, headers: ASSIST_CORS });
  }

  const { question, options, storedAnswer } = body;
  const validQuestion = typeof question === "string" && question.trim().length > 0;
  const validAnswer = typeof storedAnswer === "string" && storedAnswer.trim().length > 0;
  const validOptions =
    Array.isArray(options) &&
    options.length >= 2 &&
    options.length <= 30 &&
    options.every((o) => typeof o === "string" && o.length > 0 && o.length < 200);

  if (!validQuestion || !validAnswer || !validOptions) {
    return NextResponse.json({ error: "bad body" }, { status: 400, headers: ASSIST_CORS });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ index: null, reason: "no api key" }, { headers: ASSIST_CORS });
  }

  const optionsList = (options as string[]).map((o, i) => `${i}: ${o}`).join("\n");
  const system =
    "You map a job applicant's stored answer to the closest option in a form's option list. " +
    "Reply ONLY with the 0-based index of the option that expresses the same answer, or the word NONE " +
    "if no option clearly matches. Never guess between plausibly different answers — when unsure, reply NONE.";
  const user = `Question: "${question}"\n\nOptions:\n${optionsList}\n\nStored answer: "${storedAnswer}"`;

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 100,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = res.content.find((b) => b.type === "text");
    const text = block?.type === "text" ? block.text.trim() : "";
    const match = text.match(/-?\d+/);
    if (match) {
      const idx = Number.parseInt(match[0], 10);
      if (Number.isInteger(idx) && idx >= 0 && idx < (options as string[]).length) {
        return NextResponse.json({ index: idx }, { headers: ASSIST_CORS });
      }
    }
    return NextResponse.json({ index: null }, { headers: ASSIST_CORS });
  } catch (err) {
    return NextResponse.json(
      { index: null, reason: err instanceof Error ? err.message : "request failed" },
      { headers: ASSIST_CORS },
    );
  }
}
