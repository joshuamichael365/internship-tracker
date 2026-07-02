import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/**
 * File storage for uploads (resumes now; generated documents in M5).
 * Local disk in development; the same interface gets an R2 backend for
 * production in M5 so callers never care which one is active.
 */
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "../../data/uploads");

export async function saveUpload(file: File, prefix: string): Promise<string> {
  const ext = path.extname(file.name) || ".pdf";
  const key = `${prefix}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  const full = path.join(UPLOAD_DIR, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()));
  return key;
}

export async function deleteUpload(key: string): Promise<void> {
  try {
    await unlink(path.join(UPLOAD_DIR, key));
  } catch {
    // Already gone — fine.
  }
}

export function uploadPath(key: string): string {
  return path.join(UPLOAD_DIR, key);
}
