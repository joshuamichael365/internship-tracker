import path from "node:path";
import { db, desc, eq, resumes } from "@tracker/db";

/**
 * Picks the resume for an application: its explicit resumeId, else the
 * default resume, else the most recently uploaded one. Shared by the
 * extension packet (metadata) and resume (bytes) routes so they agree.
 */
export async function resolveResumeForApplication(
  resumeId: number | null | undefined,
): Promise<{ id: number; name: string; fileKey: string } | null> {
  if (resumeId) {
    const [row] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
    if (row) return row;
  }

  const all = await db.select().from(resumes).orderBy(desc(resumes.createdAt));
  return all.find((r) => r.isDefault) ?? all[0] ?? null;
}

/** "My SWE Resume.pdf" — sanitized label + the file's original extension. */
export function resumeFilename(resume: { name: string; fileKey: string }): string {
  const ext = path.extname(resume.fileKey) || ".pdf";
  const base = resume.name.replace(/[^\w \-]+/g, "").trim() || "Resume";
  return `${base}${ext}`;
}
