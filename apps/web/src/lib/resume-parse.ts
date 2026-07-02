import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { db, eq, resumes } from "@tracker/db";
import { uploadPath } from "./storage";

/**
 * Parses an uploaded resume PDF into structured data for auto-fill.
 * No-op until ANTHROPIC_API_KEY is configured — re-runs are triggered by
 * re-uploading or from the parse-pending state at M6 key setup.
 */
export async function parseResume(resumeId: number): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;
  const [row] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
  if (!row || row.parsed || !row.fileKey.endsWith(".pdf")) return;

  const bytes = await readFile(uploadPath(row.fileKey));
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") },
          },
          {
            type: "text",
            text: 'Extract this resume into JSON with keys: education (array of {school, degree, dates, gpa}), experience (array of {company, title, dates, bullets}), skills (string array), projects (array of {name, description}), links (object). Output ONLY the JSON.',
          },
        ],
      },
    ],
  });
  const text = res.content.find((b) => b.type === "text");
  if (text?.type !== "text") return;
  try {
    const parsed = JSON.parse(text.text.replace(/^```json?\n?|\n?```$/g, ""));
    await db.update(resumes).set({ parsed }).where(eq(resumes.id, resumeId));
  } catch {
    // Unparseable output — leave as pending; a re-upload retries.
  }
}
